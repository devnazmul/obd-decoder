import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();
const LOGS_DIR = path.join(process.cwd(), 'logs');

// List devices
router.get('/', (req: Request, res: Response) => {
    try {
        if (!fs.existsSync(LOGS_DIR)) return res.json({ devices: [] });
        const devices = fs.readdirSync(LOGS_DIR).filter(f => fs.statSync(path.join(LOGS_DIR, f)).isDirectory());
        res.json({ devices });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// List logs for a device
router.get('/:deviceId', (req: Request, res: Response) => {
    try {
        const deviceDir = path.join(LOGS_DIR, req.params.deviceId);
        if (!fs.existsSync(deviceDir)) return res.status(404).json({ error: "Device not found" });
        const files = fs.readdirSync(deviceDir).filter(f => f.endsWith('.log'));
        res.json({ deviceId: req.params.deviceId, logs: files });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// View specific log contents
router.get('/:deviceId/:filename', (req: Request, res: Response) => {
    try {
        const filePath = path.join(LOGS_DIR, req.params.deviceId, req.params.filename);
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

export default router;
