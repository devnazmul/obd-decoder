import { DeviceSession } from "../types";

interface TripState {
  startTime: number;
  startMileage: number;
  maxSpeed: number;
  maxTemp: number;
  hardBrakes: number;
  hardAccels: number;
  idleSeconds: number;
  isActive: boolean;
}
export class SessionManager {
  private sessions: Map<string, DeviceSession> = new Map();
  private socketToDeviceMap: Map<string, string> = new Map();

  public registerDevice(deviceId: string, socketId: string): void {
    this.sessions.set(deviceId, {
      deviceId,
      socketId,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
    });
    this.socketToDeviceMap.set(socketId, deviceId);
  }

  public updateActivity(deviceId: string): void {
    const session = this.sessions.get(deviceId);
    if (session) {
      session.lastSeen = Date.now();
    }
  }

  public removeSessionBySocket(socketId: string): string | null {
    const deviceId = this.socketToDeviceMap.get(socketId);
    if (deviceId) {
      this.sessions.delete(deviceId);
      this.socketToDeviceMap.delete(socketId);
      return deviceId;
    }
    return null;
  }

  public getSession(deviceId: string): DeviceSession | undefined {
    return this.sessions.get(deviceId);
  }

  public getAllActiveDevices(): string[] {
    return Array.from(this.sessions.keys());
  }

  private trips: Map<string, TripState> = new Map();

  public processTelemetry(
    deviceId: string,
    speed: number,
    rpm: number = 0,
    temp: number = 0,
  ) {
    const trip = this.trips.get(deviceId);
    if (trip && trip.isActive) {
      if (speed > trip.maxSpeed) trip.maxSpeed = speed;
      if (temp > trip.maxTemp) trip.maxTemp = temp;

      // Calculate Idle (Engine running, vehicle not moving)
      if (speed === 0 && rpm > 0) {
        trip.idleSeconds += 10; // Assuming 10-second polling interval
      }
    }
  }

  public recordEvent(deviceId: string, eventType: string) {
    const trip = this.trips.get(deviceId);
    if (!trip || !trip.isActive) return;

    if (eventType === "HB") trip.hardBrakes++;
    if (eventType === "HA") trip.hardAccels++;
  }

  public startTrip(deviceId: string, currentMileage: number) {
    this.trips.set(deviceId, {
      startTime: Date.now(),
      startMileage: currentMileage,
      maxSpeed: 0,
      maxTemp: 0,
      hardBrakes: 0,
      hardAccels: 0,
      idleSeconds: 0,
      isActive: true,
    });
  }

  public endTrip(deviceId: string, endMileage: number) {
    const trip = this.trips.get(deviceId);
    if (!trip || !trip.isActive) return null;

    trip.isActive = false;
    const distance = endMileage - trip.startMileage;
    const durationMins = Math.round((Date.now() - trip.startTime) / 60000);

    // This object matches IMAGE 2 exactly
    return {
      startTime: new Date(trip.startTime).toISOString(),
      endTime: new Date().toISOString(),
      distanceKm: distance,
      maxSpeedKmH: trip.maxSpeed,
      maxTempC: trip.maxTemp,
      hardBrakeCount: trip.hardBrakes,
      hardAccelCount: trip.hardAccels,
      idleTimeSeconds: trip.idleSeconds,
      durationMinutes: durationMins,
    };
  }
}
