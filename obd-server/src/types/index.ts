export interface DeviceSession {
    deviceId: string;
    ipAddress: string;
    connectedAt: number;
    lastSeen: number;
    lastRpm: number;
    lastVoltage: number;
}

export interface LiveTripState {
    isActive: boolean;
    startTime: string;
    maxSpeed: number;
    maxTemp: number;
    hardBrakes: number;
    hardAccels: number;
    idleSeconds: number;
    speedingSeconds: number;
}

export interface ParsedObdData {
    totalMileage?: number;
    rawPids?: Record<string, number>;
}
