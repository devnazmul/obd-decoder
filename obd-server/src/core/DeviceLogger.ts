import fs from 'fs';
import path from 'path';

export class DeviceLogger {
    private static baseDir = path.join(process.cwd(), 'logs');

    public static log(deviceId: string, level: 'INFO' | 'WARN' | 'ERROR' | 'ACK', event: string, meta: any = {}) {
        if (!deviceId) deviceId = "UNKNOWN_DEVICE";
        
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const deviceDir = path.join(this.baseDir, `device_${deviceId}`);
        const logFile = path.join(deviceDir, `device_${deviceId}_${dateStr}.log`);

        if (!fs.existsSync(deviceDir)) {
            fs.mkdirSync(deviceDir, { recursive: true });
        }

        const logEntry = JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            event,
            ...meta
        }) + '\n';

        // Write to file asynchronously
        fs.appendFile(logFile, logEntry, (err) => {
            if (err) console.error(`Failed to write log for ${deviceId}:`, err);
        });
        
        // Also print to console for live viewing
        console.log(`[${new Date().toISOString()}] [${level}] [${deviceId}] ${event}`);
    }
}
