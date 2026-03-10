import fs from "fs";
import path from "path";

/**
 * Ensures logging strictly follows the requirement:
 * logs/device_123/device_123_2026-03-09.log
 */
export class DeviceLogger {
  private static baseDir = path.join(process.cwd(), "logs");

  public static log(
    deviceId: string,
    level: "INFO" | "ERROR" | "WARN",
    message: string,
    meta: any = {},
  ) {
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const deviceDir = path.join(this.baseDir, `device_${deviceId}`);
    const logFile = path.join(deviceDir, `device_${deviceId}_${dateStr}.log`);

    if (!fs.existsSync(deviceDir)) {
      fs.mkdirSync(deviceDir, { recursive: true });
    }

    const logEntry =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        deviceId,
        message,
        ...meta,
      }) + "\n";

    fs.appendFile(logFile, logEntry, (err) => {
      if (err) console.error(`Failed to write log for ${deviceId}:`, err);
    });
  }
}
