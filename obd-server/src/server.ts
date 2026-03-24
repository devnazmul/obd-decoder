import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import logRoutes from './api/logRoutes';

export const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP and Socket.IO servers
export const httpServer = createServer(app);
export const io = new Server(httpServer, { cors: { origin: '*' } });

// Socket.io Connection Logic
io.on('connection', (socket: any) => {
    console.log(`🟢 Frontend UI Connected via WebSocket: ${socket.id}`);
    
    socket.on('disconnect', () => {
        console.log(`🔴 Frontend UI Disconnected: ${socket.id}`);
    });
});

// API Endpoints
app.use('/api/logs', logRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', uptime: process.uptime() });
});
