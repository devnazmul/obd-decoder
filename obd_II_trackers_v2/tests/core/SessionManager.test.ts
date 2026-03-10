import { SessionManager } from "../../src/core/SessionManager";

describe("SessionManager", () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  it("should register a new device session", () => {
    const deviceId = "069252500651";
    const socketId = "socket-123";
    sessionManager.registerDevice(deviceId, socketId);

    const session = sessionManager.getSession(deviceId);
    expect(session).toBeDefined();
    expect(session?.deviceId).toBe(deviceId);
    expect(session?.socketId).toBe(socketId);
    expect(session?.connectedAt).toBeLessThanOrEqual(Date.now());
  });

  it("should update device activity", async () => {
    const deviceId = "069252500651";
    sessionManager.registerDevice(deviceId, "socket-123");

    const initialLastSeen = sessionManager.getSession(deviceId)?.lastSeen || 0;

    // Wait a bit to ensure Date.now() changes
    await new Promise((resolve) => setTimeout(resolve, 10));

    sessionManager.updateActivity(deviceId);
    const updatedLastSeen = sessionManager.getSession(deviceId)?.lastSeen || 0;

    expect(updatedLastSeen).toBeGreaterThan(initialLastSeen);
  });

  it("should remove session by socket ID", () => {
    const deviceId = "069252500651";
    const socketId = "socket-123";
    sessionManager.registerDevice(deviceId, socketId);

    const removedDeviceId = sessionManager.removeSessionBySocket(socketId);
    expect(removedDeviceId).toBe(deviceId);
    expect(sessionManager.getSession(deviceId)).toBeUndefined();
  });

  it("should return null when removing non-existent socket ID", () => {
    expect(sessionManager.removeSessionBySocket("non-existent")).toBeNull();
  });

  it("should get all active device IDs", () => {
    sessionManager.registerDevice("dev1", "socket1");
    sessionManager.registerDevice("dev2", "socket2");

    const activeDevices = sessionManager.getAllActiveDevices();
    expect(activeDevices).toContain("dev1");
    expect(activeDevices).toContain("dev2");
    expect(activeDevices).toHaveLength(2);
  });
});
