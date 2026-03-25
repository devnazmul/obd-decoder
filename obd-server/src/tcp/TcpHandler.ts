import * as net from 'net';
import { SessionManager } from '../core/SessionManager';
import { DeviceLogger } from '../core/DeviceLogger';
import { ObdParser } from '../protocol/ObdParser';
import { HexUtils } from '../protocol/HexUtils';
import { io } from '../server';

export class TcpHandler {
    private sessionManager: SessionManager;

    constructor(sessionManager: SessionManager) {
        this.sessionManager = sessionManager;
    }

    public handleConnection(socket: net.Socket) {
        const clientIp = socket.remoteAddress || 'Unknown';
        DeviceLogger.log('SYSTEM', 'INFO', 'New TCP Connection', { ip: clientIp });

        let buffer = '';

        socket.on('data', (data) => {
            buffer += data.toString('hex').toUpperCase();

            // Extract messages bounded by 7E ... 7E
            const messages = buffer.split('7E').filter(m => m.length > 0);
            
            // Keep the last part in buffer if it doesn't end cleanly (fragmented packet)
            if (!buffer.endsWith('7E')) {
                buffer = messages.pop() || '';
            } else {
                buffer = '';
            }

            for (const msgHex of messages) {
                const fullHex = `7E${msgHex}7E`;
                this.processMessage(socket, fullHex, clientIp);
            }
        });

        socket.on('error', (err) => {
            DeviceLogger.log('SYSTEM', 'ERROR', 'TCP Socket Error', { error: err.message, ip: clientIp });
        });
    }

    private processMessage(socket: net.Socket, hexMessage: string, clientIp: string) {
        try {
            const header = ObdParser.parseHeader(hexMessage);
            if (!header.msgId) return;

            const dId = header.deviceId;
            this.sessionManager.updateSession(dId, clientIp);

            // Log EVERY raw message received
            DeviceLogger.log(dId, 'INFO', `Received Message [${header.msgId}]`, { rawHex: hexMessage });

            switch (header.msgId) {
                case '0100': // Registration
                    DeviceLogger.log(dId, 'INFO', 'Device Registration Request');
                    const regAck = HexUtils.createRegistrationReply(dId, header.seqNumber);
                    socket.write(regAck);
                    DeviceLogger.log(dId, 'ACK', 'Sent 8100 Registration Reply', { hex: regAck.toString('hex') });
                    break;

                case '0102': // Authentication
                    DeviceLogger.log(dId, 'INFO', 'Device Authentication Request');
                    const authAck = HexUtils.createUniversalReply(dId, header.seqNumber, header.msgId);
                    socket.write(authAck);
                    DeviceLogger.log(dId, 'ACK', 'Sent 8001 Universal Reply', { hex: authAck.toString('hex') });
                    break;

                case '0002': // Heartbeat
                    DeviceLogger.log(dId, 'INFO', 'Heartbeat Received');
                    const hbAck = HexUtils.createUniversalReply(dId, header.seqNumber, header.msgId);
                    socket.write(hbAck);
                    DeviceLogger.log(dId, 'ACK', 'Sent 8001 Universal Reply', { hex: hbAck.toString('hex') });
                    break;

                case '0200': // Location & OBD
                    const locData = ObdParser.parse0200WithObd(header.body);

                    let processedObd: any = {};
                    let currentRpm = 0;
                    let currentVoltage = 0;

                    // Apply the correct Proprietary J63S Dictionary
                    if (locData.obd?.rawPids) {
                        const p = locData.obd.rawPids;
                        currentRpm = p["0003"] !== undefined ? p["0003"] : 0;          // Real RPM (No division)
                        currentVoltage = p["0004"] ? (p["0004"] / 1000) : 0;           // Real Battery Voltage

                        processedObd = {
                            batteryVoltage: currentVoltage,
                            totalMileage: p["0005"] ? (p["0005"] / 10) : locData.obd.totalMileage,
                            coolantTemp: p["0009"] !== undefined ? (p["0009"] - 40) : null, // PID 0009 is Coolant
                            intakePressure: p["000B"] !== undefined ? p["000B"] : null,
                            rpm: currentRpm,
                            engineLoad: p["0008"] !== undefined ? p["0008"] : null,         // PID 0008 is Load %
                            ignitionAdvance: p["000E"] !== undefined ? ((p["000E"] / 2) - 64) : null,
                            airTemp: p["000F"] !== undefined ? (p["000F"] - 40) : null,
                            airFlow: p["0010"] !== undefined ? p["0010"] : null,
                            throttlePos: p["0011"] !== undefined ? Math.round((p["0011"] * 100) / 255) : null
                        };
                    }

                    // --- TRUE ENGINE ON/OFF DETECTION ---
                    // An engine is only running if RPM > 0 OR Alternator is charging (>13.2V)
                    const isEngineRunning = currentRpm > 0 || currentVoltage >= 13.2;
                    
                    let actualSpeed = locData.speedKmH;
                    if (!isEngineRunning) {
                        actualSpeed = 0; // Prevent GPS drift if car is OFF
                    }

                    this.sessionManager.processTelemetry(dId, actualSpeed, locData.obd?.rawPids);

                    const cleanDataPayload = {
                        time: locData.deviceTime,
                        lat: locData.lat,
                        lon: locData.lon,
                        speed: actualSpeed,
                        direction: locData.direction,
                        mileage: locData.obd?.totalMileage || 0,
                        vehicleCondition: processedObd
                    };

                    DeviceLogger.log(dId, 'INFO', 'Decoded Location & OBD', cleanDataPayload);
                    io.emit(`live-location-${dId}`, cleanDataPayload);

                    const locAck = HexUtils.createUniversalReply(dId, header.seqNumber, header.msgId);
                    socket.write(locAck);
                    DeviceLogger.log(dId, 'ACK', 'Sent 8001 Universal Reply', { hex: locAck.toString('hex') });
                    break;

                case '0900': // Passthrough (Trips, DTCs)
                    const pType = header.body.substring(0, 2);
                    if (pType === 'F8') {
                        const len = parseInt(header.body.substring(6, 10), 16);
                        if (len > 15) {
                            const eventPid = header.body.substring(10, 12);
                            const eventTime = ObdParser.parseBcdTime(header.body.substring(12, 24));

                            if (eventPid === '01') {
                                this.sessionManager.startTrip(dId, eventTime);
                                DeviceLogger.log(dId, 'INFO', 'Trip Started', { time: eventTime });
                            } else if (eventPid === '02') {
                                const tripReport = this.sessionManager.endTrip(dId, eventTime);
                                if (tripReport) {
                                    DeviceLogger.log(dId, tripReport.isGhostTrip ? 'WARN' : 'INFO', 'Trip Ended', tripReport);
                                }
                            } else if (eventPid === '06') {
                                this.sessionManager.recordEvent(dId, 'HA');
                                DeviceLogger.log(dId, 'WARN', 'Rapid Acceleration');
                            } else if (eventPid === '0E') {
                                this.sessionManager.recordEvent(dId, 'HB');
                                DeviceLogger.log(dId, 'WARN', 'Rapid Braking');
                            }
                        } else {
                            // Extract ASCII for DTC Codes
                            const payloadHex = header.body.substring(24);
                            let asciiPayload = '';
                            for (let i = 0; i < payloadHex.length; i += 2) {
                                const charCode = parseInt(payloadHex.substring(i, i + 2), 16);
                                if (charCode >= 32 && charCode <= 126) asciiPayload += String.fromCharCode(charCode);
                            }
                            if (asciiPayload.startsWith('P') || asciiPayload.startsWith('C') || asciiPayload.startsWith('B') || asciiPayload.startsWith('U')) {
                                const dtcs = require('../protocol/dtcs.json');
                                const description = dtcs[asciiPayload] || 'Unknown Trouble Code';
                                DeviceLogger.log(dId, 'ERROR', 'DTC Fault Detected', { 
                                    code: asciiPayload,
                                    description: description
                                });
                            }
                        }
                    }

                    const passAck = HexUtils.createUniversalReply(dId, header.seqNumber, header.msgId);
                    socket.write(passAck);
                    DeviceLogger.log(dId, 'ACK', 'Sent 8001 Universal Reply', { hex: passAck.toString('hex') });
                    break;
            }
        } catch (error: any) {
            DeviceLogger.log('SYSTEM', 'ERROR', 'Packet Parse Error', { hex: hexMessage, error: error.message });
        }
    }
}
