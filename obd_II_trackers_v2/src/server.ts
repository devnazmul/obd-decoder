import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { SessionManager } from "./core/SessionManager";
import { SocketHandler } from "./socket/SocketHandler";

export const app = express();
app.use(cors());
app.use(express.json());

export const httpServer = createServer(app);
export const io = new Server(httpServer, { cors: { origin: "*" } });

const sessionManager = new SessionManager();
const socketHandler = new SocketHandler(io, sessionManager);

io.on("connection", (socket) => {
  socketHandler.handleConnection(socket);
});

// Simple API Layer for Health & Monitoring
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", uptime: process.uptime() });
});

app.get("/api/devices", (req, res) => {
  res.json({ activeDevices: sessionManager.getAllActiveDevices() });
});
