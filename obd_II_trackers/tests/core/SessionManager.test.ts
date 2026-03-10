import { SessionManager } from "../../src/core/SessionManager";

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it("registers a device", () => {
    const session = manager.registerDevice("dev123", "sock456");
    expect(session.deviceId).toBe("dev123");
    expect(session.socketId).toBe("sock456");
    expect(manager.getDeviceCount()).toBe(1);
    expect(manager.isConnected("dev123")).toBe(true);
  });

  it("removes a device by deviceId", () => {
    manager.registerDevice("dev123", "sock456");
    expect(manager.removeDevice("dev123")).toBe(true);
    expect(manager.getDeviceCount()).toBe(0);
    expect(manager.isConnected("dev123")).toBe(false);
  });

  it("removes a device by socketId", () => {
    manager.registerDevice("dev123", "sock456");
    const removedId = manager.removeBySocketId("sock456");
    expect(removedId).toBe("dev123");
    expect(manager.getDeviceCount()).toBe(0);
  });

  it("returns null when removing non-existent socketId", () => {
    const removedId = manager.removeBySocketId("nonexistent");
    expect(removedId).toBeNull();
  });

  it("updates activity correctly", async () => {
    const session = manager.registerDevice("dev123", "sock456");
    const firstTime = session.lastActivity.getTime();

    // wait briefly
    await new Promise((r) => setTimeout(r, 10));

    expect(manager.updateActivity("dev123")).toBe(true);
    const newSession = manager.getDevice("dev123");

    expect(newSession?.lastActivity.getTime()).toBeGreaterThan(firstTime);
  });

  it("update activity returns false for non-existent device", () => {
    expect(manager.updateActivity("non-existent")).toBe(false);
  });

  it("lists active devices", () => {
    manager.registerDevice("dev1", "s1");
    manager.registerDevice("dev2", "s2");
    const devices = manager.getActiveDevices();
    expect(devices).toHaveLength(2);
    expect(devices.map((d) => d.deviceId)).toContain("dev1");
    expect(devices.map((d) => d.deviceId)).toContain("dev2");
  });

  it("clears sessions", () => {
    manager.registerDevice("dev1", "s1");
    manager.clear();
    expect(manager.getDeviceCount()).toBe(0);
  });
});
