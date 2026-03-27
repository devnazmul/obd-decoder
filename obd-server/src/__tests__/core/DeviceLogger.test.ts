import fs from "fs";
import path from "path";

jest.mock("fs");

import { DeviceLogger } from "../../core/DeviceLogger";

const mockedFs = fs as jest.Mocked<typeof fs>;

describe("DeviceLogger", () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Suppress console output during tests
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    // Default: directory does NOT exist so mkdirSync path is exercised
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.mkdirSync.mockImplementation(() => undefined);
    mockedFs.appendFile.mockImplementation((_path, _data, callback) => {
      (callback as (err: NodeJS.ErrnoException | null) => void)(null);
    });
  });

  // ─── Directory creation ───────────────────────────────────────────────────
  it("should create the device log directory if it does not exist", () => {
    DeviceLogger.log("device123", "INFO", "Test Event");
    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("device_device123"),
      { recursive: true },
    );
  });

  it("should NOT call mkdirSync if the directory already exists", () => {
    mockedFs.existsSync.mockReturnValue(true);
    DeviceLogger.log("device123", "INFO", "Test Event");
    expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
  });

  // ─── appendFile content ───────────────────────────────────────────────────
  it("should call fs.appendFile with valid JSON log entry", () => {
    DeviceLogger.log("device123", "INFO", "Test Event", { key: "value" });
    expect(mockedFs.appendFile).toHaveBeenCalledTimes(1);
    const callArgs = mockedFs.appendFile.mock.calls[0];
    const logContent = callArgs[1] as string;
    const parsed = JSON.parse(logContent.trim());
    expect(parsed.level).toBe("INFO");
    expect(parsed.event).toBe("Test Event");
    expect(parsed.key).toBe("value");
    expect(parsed.timestamp).toBeDefined();
  });

  it("should append a newline after each log entry", () => {
    DeviceLogger.log("device123", "WARN", "Some Warning");
    const callArgs = mockedFs.appendFile.mock.calls[0];
    const logContent = callArgs[1] as string;
    expect(logContent.endsWith("\n")).toBe(true);
  });

  it("should write WARN level correctly", () => {
    DeviceLogger.log("device123", "WARN", "Warning Event");
    const logContent = mockedFs.appendFile.mock.calls[0][1] as string;
    const parsed = JSON.parse(logContent.trim());
    expect(parsed.level).toBe("WARN");
  });

  it("should write ERROR level correctly", () => {
    DeviceLogger.log("device123", "ERROR", "Error Event");
    const logContent = mockedFs.appendFile.mock.calls[0][1] as string;
    const parsed = JSON.parse(logContent.trim());
    expect(parsed.level).toBe("ERROR");
  });

  it("should write ACK level correctly", () => {
    DeviceLogger.log("device123", "ACK", "Ack Event");
    const logContent = mockedFs.appendFile.mock.calls[0][1] as string;
    const parsed = JSON.parse(logContent.trim());
    expect(parsed.level).toBe("ACK");
  });

  // ─── deviceId fallback ────────────────────────────────────────────────────
  it('should default deviceId to "UNKNOWN_DEVICE" when empty string is given', () => {
    DeviceLogger.log("", "INFO", "Empty ID Event");
    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("device_UNKNOWN_DEVICE"),
      { recursive: true },
    );
  });

  // ─── Log file path ────────────────────────────────────────────────────────
  it("should write to a log file named device_{id}_{date}.log", () => {
    DeviceLogger.log("abc123", "INFO", "Test");
    const filePath = mockedFs.appendFile.mock.calls[0][0] as string;
    expect(filePath).toMatch(/device_abc123_\d{4}-\d{2}-\d{2}\.log$/);
  });

  // ─── console.log ─────────────────────────────────────────────────────────
  it("should call console.log with device id and event", () => {
    DeviceLogger.log("device123", "INFO", "Some Event");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("device123"),
    );
  });

  // ─── fs.appendFile error handling ─────────────────────────────────────────
  it("should log to console.error when appendFile fails", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockedFs.appendFile.mockImplementation((_path, _data, callback) => {
      (callback as (err: NodeJS.ErrnoException | null) => void)(
        new Error("Disk full"),
      );
    });
    DeviceLogger.log("device123", "ERROR", "Failed Write");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("device123"),
      expect.any(Error),
    );
  });

  // ─── meta spreading ──────────────────────────────────────────────────────
  it("should spread meta fields into the log entry", () => {
    DeviceLogger.log("dev1", "INFO", "Telemetry", {
      lat: 23.5,
      lon: 45.1,
      speed: 80,
    });
    const logContent = mockedFs.appendFile.mock.calls[0][1] as string;
    const parsed = JSON.parse(logContent.trim());
    expect(parsed.lat).toBe(23.5);
    expect(parsed.lon).toBe(45.1);
    expect(parsed.speed).toBe(80);
  });
});
