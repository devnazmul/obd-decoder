import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { sessionManager } from '../core/SessionManager';

const router = Router();
const LOGS_DIR = path.join(process.cwd(), 'logs');

// List devices
router.get('/', (req: Request, res: Response) => {
    try {
        if (!fs.existsSync(LOGS_DIR)) return res.json({ devices: [] });
        const devices = fs.readdirSync(LOGS_DIR).filter(f => {
            if (!f.startsWith('device_')) return false;
            const deviceId = f.replace('device_', '');
            
            // 1. Exclude system markers and hex noise IDs (only allow numeric BCD IDs)
            if (f === 'device_SYSTEM' || f === 'device_UNKNOWN_DEVICE') return false;
            
            // 2. Dynamically determine "real" devices (must be numeric BCD with at least 10 digits)
            if (!/^\d{10,}$/.test(deviceId)) return false;

            const devicePath = path.join(LOGS_DIR, f);
            if (!fs.statSync(devicePath).isDirectory()) return false;
            
            const files = fs.readdirSync(devicePath).filter(file => file.endsWith('.log'));
            
            // 3. Must have at least one log file > 10KB (filters out empty/heartbeat-only logs)
            return files.some(file => {
                const stats = fs.statSync(path.join(devicePath, file));
                return stats.size > 10240; // 10KB
            });
        }).map(f => f.replace('device_', ''));
        
        res.json({ devices });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Alias for listing devices
router.get('/devices', (req: Request, res: Response) => {
    try {
        if (!fs.existsSync(LOGS_DIR)) return res.json({ devices: [] });
        const devices = fs.readdirSync(LOGS_DIR).filter(f => {
            if (!f.startsWith('device_')) return false;
            const deviceId = f.replace('device_', '');
            
            // 1. Exclude system markers and hex noise IDs (only allow numeric BCD IDs)
            if (f === 'device_SYSTEM' || f === 'device_UNKNOWN_DEVICE') return false;
            
            // 2. Dynamically determine "real" devices (must be numeric BCD with at least 10 digits)
            if (!/^\d{10,}$/.test(deviceId)) return false;

            const devicePath = path.join(LOGS_DIR, f);
            if (!fs.statSync(devicePath).isDirectory()) return false;
            
            const files = fs.readdirSync(devicePath).filter(file => file.endsWith('.log'));
            
            // 3. Must have at least one log file > 10KB (filters out empty/heartbeat-only logs)
            return files.some(file => {
                const stats = fs.statSync(path.join(devicePath, file));
                return stats.size > 10240; // 10KB
            });
        }).map(f => f.replace('device_', ''));

        res.json({ devices });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/logs/v1.0/devices/status
 * Returns the status of all registered devices.
 */
router.get('/v1.0/devices/status', (req: Request, res: Response) => {
    try {
        if (!fs.existsSync(LOGS_DIR)) return res.json({ total_devices: 0, devices: [] });

        const statuses: any[] = [];
        const deviceFolders = fs.readdirSync(LOGS_DIR).filter(f => {
            if (!f.startsWith('device_')) return false;
            const deviceId = f.replace('device_', '');
            
            // Apply the "Same Logic" filter as the main /devices endpoint
            if (f === 'device_SYSTEM' || f === 'device_UNKNOWN_DEVICE') return false;
            if (!/^\d{10,}$/.test(deviceId)) return false;

            const devicePath = path.join(LOGS_DIR, f);
            if (!fs.statSync(devicePath).isDirectory()) return false;
            
            // Must have at least one log file > 10KB
            const files = fs.readdirSync(devicePath).filter(file => file.endsWith('.log'));
            return files.some(file => {
                const stats = fs.statSync(path.join(devicePath, file));
                return stats.size > 10240; 
            });
        });

        deviceFolders.forEach(folder => {
            const deviceId = folder.replace('device_', '');
            const session = sessionManager.getSession(deviceId);
            
            if (session) {
                const isOnline = (Date.now() - session.lastSeen) < (10 * 60 * 1000); // 10 minutes
                const isEngineOn = session.lastRpm > 300 || session.lastVoltage >= 13.2;

                statuses.push({
                    vehicle_id: deviceId,
                    connection_status: isOnline ? "ONLINE" : "OFFLINE",
                    engine_status: isEngineOn ? "ON" : "OFF",
                    last_seen: new Date(session.lastSeen).toISOString(),
                    telemetry: {
                        rpm: session.lastRpm,
                        voltage: session.lastVoltage
                    }
                });
            } else {
                // Device exists in logs but not in active memory
                statuses.push({
                    vehicle_id: deviceId,
                    connection_status: "OFFLINE",
                    engine_status: "OFF",
                    last_seen: "Unknown", // Or try to extract from last log file
                    telemetry: { rpm: 0, voltage: 0 }
                });
            }
        });

        res.json({ total_devices: statuses.length, devices: statuses });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/logs/v1.0/trips
 * Dynamic Trip Segmentation based on stop duration.
 */
router.get('/v1.0/trips', (req: Request, res: Response) => {
    try {
        const vehicle_id = req.query.vehicle_id as string;
        const start_time = req.query.start_time as string; // Format: YYYY-MM-DD
        const end_time = req.query.end_time as string;     // Format: YYYY-MM-DD
        const min_stop = parseInt(req.query.min_stop_duration_minutes as string) || 5;

        if (!vehicle_id || !start_time || !end_time) {
            return res.status(400).json({ error: "Missing required parameters: vehicle_id, start_time, end_time" });
        }

        const deviceFolder = vehicle_id.startsWith('device_') ? vehicle_id : `device_${vehicle_id}`;
        const deviceDir = path.join(LOGS_DIR, deviceFolder);
        if (!fs.existsSync(deviceDir)) return res.json({ trips: [] });

        // Load logs within the date range
        const files = fs.readdirSync(deviceDir).filter(f => f.endsWith('.log'));
        let allLogs: any[] = [];

        files.forEach(file => {
            // Check if file date is within range
            const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
                const fileDateStr = dateMatch[1];
                if (fileDateStr < start_time || fileDateStr > end_time) return;
            }

            const content = fs.readFileSync(path.join(deviceDir, file), 'utf-8');
            content.trim().split('\n').forEach(line => {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.event === 'Decoded Location & OBD') {
                        allLogs.push(parsed);
                    }
                } catch (e) {}
            });
        });

        // Sort chronologically
        allLogs.sort((a, b) => new Date(a.time || a.timestamp).getTime() - new Date(b.time || b.timestamp).getTime());

        const trips: any[] = [];
        let currentTrip: any = null;
        let lastMovingLog: any = null;
        const stopThresholdMs = min_stop * 60 * 1000;

        for (const log of allLogs) {
            const logTime = new Date(log.time || log.timestamp).getTime();
            const isEngineOn = log.vehicleCondition?.rpm > 300 || log.vehicleCondition?.batteryVoltage >= 13.2;

            if (log.speed > 0) {
                if (!currentTrip) {
                    currentTrip = createNewTrip(log);
                } else if (lastMovingLog && (logTime - new Date(lastMovingLog.time || lastMovingLog.timestamp).getTime()) >= stopThresholdMs) {
                    // Filter trips with more than 5 logs (prevents noise)
                    if (currentTrip && currentTrip._logCount > 5) {
                        closeTrip(currentTrip, lastMovingLog);
                        trips.push(currentTrip);
                    }
                    currentTrip = createNewTrip(log);
                }
                lastMovingLog = log;
            }

            if (currentTrip) {
                if (log.speed > currentTrip.max_speed) currentTrip.max_speed = log.speed;
                currentTrip._speedSum += log.speed;
                currentTrip._logCount += 1;

                if (log.speed === 0 && isEngineOn) {
                    currentTrip.idle_time_seconds += 10; 
                }
            }
        }

        if (currentTrip && lastMovingLog && currentTrip._logCount > 5) {
            closeTrip(currentTrip, lastMovingLog);
            trips.push(currentTrip);
        }

        res.json({
            vehicle_id,
            total_trips: trips.length,
            min_stop_duration_minutes: min_stop,
            trips
        });

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Helper Functions
function createNewTrip(startLog: any) {
    // Ensure we send a consistent ISO-8601 UTC string to the frontend
    const startTimeStr = startLog.timestamp || startLog.time;
    return {
        start_time: new Date(startTimeStr).toISOString(),
        start_location: { lat: startLog.lat, lng: startLog.lon || startLog.lng },
        start_mileage: startLog.mileage,
        end_time: null,
        end_location: null,
        distance_km: 0,
        max_speed: startLog.speed,
        average_speed: 0,
        idle_time_seconds: 0,
        _speedSum: startLog.speed,
        _logCount: 1
    };
}

function closeTrip(trip: any, endLog: any) {
    const endTimeStr = endLog.timestamp || endLog.time;
    trip.end_time = new Date(endTimeStr).toISOString();
    trip.end_location = { lat: endLog.lat, lng: endLog.lon || endLog.lng };
    trip.distance_km = parseFloat((endLog.mileage - trip.start_mileage).toFixed(2));
    trip.average_speed = parseFloat((trip._speedSum / trip._logCount).toFixed(2));
    trip.idle_time_minutes = parseFloat((trip.idle_time_seconds / 60).toFixed(2));
    
    // Clean up temporary variables
    delete trip._speedSum;
    delete trip._logCount;
    delete trip.idle_time_seconds;
}

// List logs for a device
router.get('/:deviceId', (req: Request, res: Response) => {
    try {
        const { deviceId } = req.params;
        const deviceFolder = deviceId.startsWith('device_') ? deviceId : `device_${deviceId}`;
        const deviceDir = path.join(LOGS_DIR, deviceFolder);
        
        if (!fs.existsSync(deviceDir)) return res.status(404).json({ error: "Device not found" });
        const files = fs.readdirSync(deviceDir).filter(f => f.endsWith('.log'));
        res.json({ deviceId, logs: files });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// View specific log contents
router.get('/:deviceId/:filename', (req: Request, res: Response) => {
    try {
        const { deviceId, filename } = req.params;
        const deviceFolder = deviceId.startsWith('device_') ? deviceId : `device_${deviceId}`;
        const filePath = path.join(LOGS_DIR, deviceFolder, filename);
        
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Log not found" });

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const logEntries = fileContent.trim().split('\n').map(line => {
            try { return JSON.parse(line); } catch { return { raw: line }; }
        });

        res.json({ totalEntries: logEntries.length, data: logEntries });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 4. Map Playback Endpoint: Get clean coordinates grouped by trips
router.get('/:deviceId/:filename/playback', (req: Request, res: Response) => {
    try {
        const deviceFolder = req.params.deviceId.startsWith('device_') ? req.params.deviceId : `device_${req.params.deviceId}`;
        const filePath = path.join(LOGS_DIR, deviceFolder, req.params.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Log file not found" });

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.trim().split('\n');

        const trips: any[] = [];
        let currentTrip: any = { id: 1, startTime: null, endTime: null, path: [] };
        let tripCounter = 1;

        lines.forEach(line => {
            if (!line) return;
            try {
                const log = JSON.parse(line);

                // Start a new trip
                if (log.event === 'Trip Started') {
                    if (currentTrip.path.length > 0) {
                        trips.push(currentTrip);
                        tripCounter++;
                    }
                    currentTrip = { id: tripCounter, startTime: log.time, endTime: null, path: [] };
                }
                
                // Add coordinates to the current trip
                else if (log.event === 'Decoded Location & OBD') {
                    if (!currentTrip.startTime) currentTrip.startTime = log.time || log.timestamp;
                    currentTrip.path.push({
                        lat: log.lat,
                        lng: log.lon || log.lng,
                        speed: log.speed,
                        direction: log.direction,
                        time: log.time || log.timestamp,
                        obd: log.vehicleCondition
                    });
                }
                
                // End the current trip
                else if (log.event === 'Trip Ended') {
                    currentTrip.endTime = log.endTime || log.time || log.timestamp;
                    if (currentTrip.path.length > 0) trips.push(currentTrip);
                    tripCounter++;
                    currentTrip = { id: tripCounter, startTime: null, endTime: null, path: [] };
                }
            } catch (e) {}
        });

        // Push the final trip if it hasn't ended yet
        if (currentTrip.path.length > 0) trips.push(currentTrip);

        res.json({
            deviceId: req.params.deviceId,
            date: req.params.filename,
            totalTrips: trips.length,
            trips: trips
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * v1.0 Duration-based Playback: Aggregate data from multiple log files within a date range
 * Query: ?start=2026-03-24T00:00:00Z&end=2026-03-24T23:59:59Z
 */
router.get('/v1.0/:deviceId/playback/duration', (req: Request, res: Response) => {
    try {
        const { deviceId } = req.params;
        const { start, end } = req.query;

        if (!start || !end) {
            return res.status(400).json({ error: "Start and end parameters are required" });
        }

        // Add 30s buffer to catch points exactly at the boundary or from slightly noisy trip times
        const startDate = new Date(new Date(start as string).getTime() - 30000);
        const endDate = new Date(new Date(end as string).getTime() + 30000);
        
        const deviceFolder = deviceId.startsWith('device_') ? deviceId : `device_${deviceId}`;
        const deviceDir = path.join(LOGS_DIR, deviceFolder);

        if (!fs.existsSync(deviceDir)) {
            return res.status(404).json({ error: "Device logs not found" });
        }

        // Collect all potential log files in the range
        const logFiles = fs.readdirSync(deviceDir).filter(f => f.endsWith('.log'));
        const relevantPoints: any[] = [];

        logFiles.forEach(filename => {
            // Filename format: device_{id}_{YYYY-MM-DD}.log
            const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
            if (!dateMatch) return;

            const fileDate = new Date(dateMatch[1]);
            // Check if file date is within range (ignoring time for broad match, then filter points)
            // But we can be more precise: only read files that COULD contain data in range
            const fileStart = new Date(dateMatch[1]);
            fileStart.setHours(0,0,0,0);
            const fileEnd = new Date(dateMatch[1]);
            fileEnd.setHours(23,59,59,999);

            if (fileEnd < startDate || fileStart > endDate) return;

            const filePath = path.join(deviceDir, filename);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const lines = fileContent.trim().split('\n');

            lines.forEach(line => {
                if (!line) return;
                try {
                    const log = JSON.parse(line);
                    if (log.event === 'Decoded Location & OBD') {
                        const pointTime = new Date(log.timestamp || log.time);
                        const pointIsoTime = new Date(log.timestamp || log.time).toISOString();
                        if (pointTime >= startDate && pointTime <= endDate) {
                            relevantPoints.push({
                                lat: log.lat,
                                lng: log.lon || log.lng,
                                speed: log.speed,
                                direction: log.direction,
                                time: pointIsoTime,
                                obd: log.vehicleCondition,
                                timestamp: pointIsoTime
                            });
                        }
                    }
                } catch (e) {}
            });
        });

        // Sort by timestamp
        relevantPoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        res.json({
            deviceId,
            start,
            end,
            totalPoints: relevantPoints.length,
            points: relevantPoints
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


export default router;
