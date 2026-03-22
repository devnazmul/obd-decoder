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

export default router;
