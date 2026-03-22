import dotenv from 'dotenv';
dotenv.config();

import * as net from 'net';
import { app } from './server';
import { SessionManager } from './core/SessionManager';
import { TcpHandler } from './tcp/TcpHandler';
import { DeviceLogger } from './core/DeviceLogger';

const API_PORT = process.env.API_PORT || 4031;
const TCP_PORT = process.env.TCP_PORT || 4030;

// 1. Start the HTTP Server for the API
app.listen(API_PORT, () => {
    console.log(`🌐 HTTP API Server running on port ${API_PORT}`);
    console.log(`👉 View logs at: http://localhost:${API_PORT}/api/logs`);
});

// 2. Start the TCP Server for the OBD-II Devices
const sessionManager = new SessionManager();
const tcpHandler = new TcpHandler(sessionManager);

const tcpServer = net.createServer((socket) => {
    tcpHandler.handleConnection(socket);
});

tcpServer.listen(TCP_PORT, () => {
    console.log(`📡 TCP Device Server running on port ${TCP_PORT}`);
});

DeviceLogger.log('SYSTEM', 'INFO', 'Server Started Successfully');
