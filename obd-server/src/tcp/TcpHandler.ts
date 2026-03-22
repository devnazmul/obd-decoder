import * as net from 'net';
import { SessionManager } from '../core/SessionManager';
import { DeviceLogger } from '../core/DeviceLogger';
import { ObdParser } from '../protocol/ObdParser';
import { HexUtils } from '../protocol/HexUtils';

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
                    this.sessionManager.processTelemetry(dId, locData.speedKmH, locData.obd?.rawPids);

                    // J63S Proprietary Translation for the logs
                    let processedObd = {};
                    if (locData.obd?.rawPids) {
                        const p = locData.obd.rawPids;
                        processedObd = {
                            rpm: p["000C"] ? (p["000C"] / 4) : 0,
                            coolantTemp: p["0006"] ? (p["0006"] - 40) : 64,
                            airFlow: p["0010"] || 502,
                            airTemp: p["000F"] ? (p["000F"] - 40) : 20,
                            intakePressure: p["000B"] || 101,
                            engineLoad: p["0004"] ? Math.round((p["0004"] * 100) / 255) : 32,
                            throttlePos: p["0011"] || 255,
                            ignitionAdvance: p["000E"] || -64
                        };
                    }

                    DeviceLogger.log(dId, 'INFO', 'Decoded Location & OBD', {
                        time: locData.deviceTime,
                        lat: locData.lat,
                        lon: locData.lon,
                        speed: locData.speedKmH,
                        mileage: locData.obd?.totalMileage || 0,
                        vehicleCondition: processedObd
                    });

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
                            if (asciiPayload.startsWith('P') || asciiPayload.startsWith('C')) {
                                DeviceLogger.log(dId, 'ERROR', 'DTC Fault Detected', { code: asciiPayload });
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
