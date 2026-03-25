import { DeviceSession, LiveTripState } from '../types';

export class SessionManager {
    private sessions: Map<string, DeviceSession> = new Map();
    private trips: Map<string, LiveTripState> = new Map();

    public updateSession(deviceId: string, ipAddress: string): void {
        if (!this.sessions.has(deviceId)) {
            this.sessions.set(deviceId, { 
                deviceId, 
                ipAddress, 
                connectedAt: Date.now(), 
                lastSeen: Date.now(),
                lastRpm: 0,
                lastVoltage: 0
            });
            this.trips.set(deviceId, this.getEmptyTrip());
        } else {
            const session = this.sessions.get(deviceId)!;
            session.lastSeen = Date.now();
            session.ipAddress = ipAddress;
        }
    }

    private getEmptyTrip(): LiveTripState {
        return { isActive: false, startTime: '', maxSpeed: 0, maxTemp: 0, hardBrakes: 0, hardAccels: 0, idleSeconds: 0, speedingSeconds: 0 };
    }

    public processTelemetry(deviceId: string, speedKmH: number, rawPids: any) {
        // 1. Extract the TRUE proprietary values
        const currentRpm = rawPids && rawPids["0003"] !== undefined ? rawPids["0003"] : 0;
        const currentVoltage = rawPids && rawPids["0004"] !== undefined ? (rawPids["0004"] / 1000) : 0;
        
        // 2. Update the live device session for the APIs
        const session = this.sessions.get(deviceId);
        if (session) {
            session.lastRpm = currentRpm;
            session.lastVoltage = currentVoltage;
        }

        // 3. Update the active Trip (Renewals Data)
        const trip = this.trips.get(deviceId);
        if (trip && trip.isActive) {
            // Update max speed
            if (speedKmH > trip.maxSpeed) trip.maxSpeed = speedKmH;
            
            // Extract J63S Coolant Temp (PID 0009)
            const temp = rawPids && rawPids["0009"] !== undefined ? (rawPids["0009"] - 40) : 0;
            if (temp > trip.maxTemp) trip.maxTemp = temp;
            
            // Idle calculation: Car isn't moving, but engine is genuinely running (> 300 RPM)
            if (speedKmH === 0 && currentRpm > 300) {
                trip.idleSeconds += 10;
            }
            
            // Speeding calculation
            if (speedKmH > 120) {
                trip.speedingSeconds += 10;
            }
        }
    }

    public startTrip(deviceId: string, timestamp: string) {
        const trip = this.getEmptyTrip();
        trip.isActive = true;
        trip.startTime = timestamp;
        this.trips.set(deviceId, trip);
    }

    public recordEvent(deviceId: string, type: 'HB' | 'HA') {
        const trip = this.trips.get(deviceId);
        if (trip && trip.isActive) {
            if (type === 'HB') trip.hardBrakes++;
            if (type === 'HA') trip.hardAccels++;
        }
    }

    public endTrip(deviceId: string, timestamp: string) {
        const trip = this.trips.get(deviceId);
        if (!trip || !trip.isActive) return null;

        // Tag as ghost if no real activity occurred, but still return it so we can log it
        const isGhost = (trip.maxSpeed === 0 && trip.idleSeconds === 0 && trip.hardAccels === 0);

        const report = {
            startTime: trip.startTime,
            endTime: timestamp,
            maxSpeed: trip.maxSpeed,
            maxTemp: trip.maxTemp,
            idleSeconds: trip.idleSeconds,
            speedingSeconds: trip.speedingSeconds,
            hardBrakes: trip.hardBrakes,
            hardAccels: trip.hardAccels,
            isGhostTrip: isGhost
        };

        this.trips.set(deviceId, this.getEmptyTrip());
        return report;
    }

    public getAllSessions(): DeviceSession[] {
        return Array.from(this.sessions.values());
    }

    public getSession(deviceId: string): DeviceSession | undefined {
        return this.sessions.get(deviceId);
    }
}

export const sessionManager = new SessionManager();
