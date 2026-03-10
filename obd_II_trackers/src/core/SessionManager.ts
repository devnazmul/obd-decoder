/**
 * SessionManager — Tracks connected OBD-II devices.
 *
 * Maps deviceId → session info (socketId, last activity).
 * Sessions are always isolated per device.
 */
export interface DeviceSession {
  deviceId: string;
  socketId: string;
  connectedAt: Date;
  lastActivity: Date;
}

export class SessionManager {
  private sessions: Map<string, DeviceSession> = new Map();

  /** Register a device connection. */
  registerDevice(deviceId: string, socketId: string): DeviceSession {
    const session: DeviceSession = {
      deviceId,
      socketId,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };
    this.sessions.set(deviceId, session);
    return session;
  }

  /** Remove a device session on disconnect. */
  removeDevice(deviceId: string): boolean {
    return this.sessions.delete(deviceId);
  }

  /** Remove a device session by socket ID. */
  removeBySocketId(socketId: string): string | null {
    for (const [deviceId, session] of this.sessions) {
      if (session.socketId === socketId) {
        this.sessions.delete(deviceId);
        return deviceId;
      }
    }
    return null;
  }

  /** Get a device session by deviceId. */
  getDevice(deviceId: string): DeviceSession | undefined {
    return this.sessions.get(deviceId);
  }

  /** Update the last activity timestamp for a device. */
  updateActivity(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    if (!session) return false;
    session.lastActivity = new Date();
    return true;
  }

  /** Get all active device sessions. */
  getActiveDevices(): DeviceSession[] {
    return Array.from(this.sessions.values());
  }

  /** Get the count of connected devices. */
  getDeviceCount(): number {
    return this.sessions.size;
  }

  /** Check if a device is currently connected. */
  isConnected(deviceId: string): boolean {
    return this.sessions.has(deviceId);
  }

  /** Clear all sessions — useful for shutdown/testing. */
  clear(): void {
    this.sessions.clear();
  }
}
