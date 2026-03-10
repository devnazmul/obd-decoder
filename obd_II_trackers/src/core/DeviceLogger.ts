import * as fs from "fs";
import * as path from "path";

/**
 * DeviceLogger — Per-device, daily-rotating, JSON-structured logging.
 *
 * Log path: logs/device_<deviceId>/device_<deviceId>_<date>.log
 *
 * Rules:
 *   - Logging must never block the main event loop (async writes)
 *   - Always use per-device isolation
 *   - Daily rotation via date-stamped filenames
 *   - JSON structured entries
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  deviceId: string;
  message: string;
  data?: unknown;
}

export class DeviceLogger {
  private readonly baseDir: string;

  constructor(baseDir: string = "logs") {
    this.baseDir = baseDir;
  }

  /** Log a message for a specific device. Non-blocking async write. */
  async log(
    deviceId: string,
    level: LogLevel,
    message: string,
    data?: unknown,
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      deviceId,
      message,
      ...(data !== undefined ? { data } : {}),
    };

    const filePath = this.getLogPath(deviceId);
    const line = JSON.stringify(entry) + "\n";

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.promises.mkdir(dir, { recursive: true });

      // Async append — never blocks the event loop
      await fs.promises.appendFile(filePath, line, "utf8");
    } catch (error) {
      // Log errors should never crash the system
      console.error(
        `[DeviceLogger] Failed to write log for device ${deviceId}:`,
        error,
      );
    }
  }

  /** Convenience methods for each log level. */
  async debug(
    deviceId: string,
    message: string,
    data?: unknown,
  ): Promise<void> {
    return this.log(deviceId, "DEBUG", message, data);
  }

  async info(deviceId: string, message: string, data?: unknown): Promise<void> {
    return this.log(deviceId, "INFO", message, data);
  }

  async warn(deviceId: string, message: string, data?: unknown): Promise<void> {
    return this.log(deviceId, "WARN", message, data);
  }

  async error(
    deviceId: string,
    message: string,
    data?: unknown,
  ): Promise<void> {
    return this.log(deviceId, "ERROR", message, data);
  }

  /**
   * Build the log file path for a device on today's date.
   * Format: logs/device_<id>/device_<id>_<YYYY-MM-DD>.log
   */
  getLogPath(deviceId: string, date?: Date): string {
    const d = date || new Date();
    const dateStr = d.toISOString().split("T")[0]; // YYYY-MM-DD
    const dirName = `device_${deviceId}`;
    const fileName = `device_${deviceId}_${dateStr}.log`;
    return path.join(this.baseDir, dirName, fileName);
  }

  /**
   * Read logs for a device on a specific date.
   * Returns parsed LogEntry array.
   */
  async readLogs(deviceId: string, date?: Date): Promise<LogEntry[]> {
    const filePath = this.getLogPath(deviceId, date);

    try {
      const content = await fs.promises.readFile(filePath, "utf8");
      const lines = content.trim().split("\n").filter(Boolean);
      return lines.map((line) => JSON.parse(line) as LogEntry);
    } catch {
      return [];
    }
  }
}
