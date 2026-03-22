import express from 'express';
import cors from 'cors';
import logRoutes from './api/logRoutes';

export const app = express();
app.use(cors());
app.use(express.json());

// API Endpoints
app.use('/api/logs', logRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', uptime: process.uptime() });
});
