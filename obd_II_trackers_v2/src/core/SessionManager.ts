import { DeviceSession } from "../types";

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
}
