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
 * 6. Power Status APIs
 */

// 1. GET /api/logs/devices/online - List running vehicles
router.get('/devices/online', (req: Request, res: Response) => {
    try {
        const activeVehicles: any[] = [];
        
        // Get all active sessions from your SessionManager
        const allSessions = sessionManager.getAllSessions(); 
        
        allSessions.forEach((session: any) => {
            // UNIFIED ENGINE LOGIC
            const isEngineOn = session.lastRpm > 300 || session.lastVoltage >= 13.2;
            
            // Only return vehicles that are currently running
            if (isEngineOn) {
                activeVehicles.push({
                    deviceId: session.deviceId,
                    engineStatus: "ON",
                    rpm: session.lastRpm,
                    voltage: session.lastVoltage,
                    lastUpdated: new Date(session.lastSeen).toISOString()
                });
            }
        });
        
        res.json({ activeVehicles });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 2. GET /api/logs/devices/:deviceId/status - Check specific car
router.get('/devices/:deviceId/status', (req: Request, res: Response) => {
    try {
        const session = sessionManager.getSession(req.params.deviceId);
        
        if (!session) {
            return res.json({ 
                deviceId: req.params.deviceId, 
                deviceConnection: "OFFLINE", 
                engineStatus: "UNKNOWN" 
            });
        }

        // Connection is valid if seen within 10 minutes
        const isOnline = (Date.now() - session.lastSeen) < (10 * 60 * 1000);
        
        // UNIFIED ENGINE LOGIC
        const isEngineOn = session.lastRpm > 300 || session.lastVoltage >= 13.2;

        res.json({
            deviceId: session.deviceId,
            deviceConnection: isOnline ? "ONLINE" : "OFFLINE",
            engineStatus: isEngineOn ? "ON" : "OFF",
            lastRpm: session.lastRpm,
            lastVoltage: session.lastVoltage,
            lastSeen: new Date(session.lastSeen).toISOString()
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

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
 * 5. Duration-based Playback: Aggregate data from multiple log files within a date range
 * Query: ?start=2026-03-24T00:00:00Z&end=2026-03-24T23:59:59Z
 */
router.get('/:deviceId/playback/duration', (req: Request, res: Response) => {
    try {
        const { deviceId } = req.params;
        const { start, end } = req.query;

        if (!start || !end) {
            return res.status(400).json({ error: "Start and end parameters are required" });
        }

        const startDate = new Date(start as string);
        const endDate = new Date(end as string);
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
                        if (pointTime >= startDate && pointTime <= endDate) {
                            relevantPoints.push({
                                lat: log.lat,
                                lng: log.lon || log.lng,
                                speed: log.speed,
                                direction: log.direction,
                                time: log.time || log.timestamp,
                                obd: log.vehicleCondition,
                                timestamp: log.timestamp || log.time
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
