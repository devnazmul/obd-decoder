import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { SessionManager, DeviceLogger } from "./core";
import { SocketHandler } from "./socket/SocketHandler";
import { setupRoutes } from "./api/routes";

// Load environment config
dotenv.config();

const app = express();
const server = http.createServer(app);

// Setup Express Middleware
app.use(cors());
app.use(express.json());

// Initialize Core Services
const sessionManager = new SessionManager();
const logger = new DeviceLogger("logs");

// Setup Socket.IO Server
const io = new SocketIOServer(server, {
  cors: { origin: "*" },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Initialize Transport Layer
const socketHandler = new SocketHandler(io, sessionManager, logger);
socketHandler.init();

// Mount API Routes
app.use("/api", setupRoutes(sessionManager));

// Start Server
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`[Server] OBD-II Telemetry Server running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`[Server] Core architecture initialized (Socket.IO + Express)`);
  console.log(
    `[Server] Socket.IO server initialized on http://localhost:${PORT}`,
  );
});

// Graceful Shutdown
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received. Shutting down gracefully.");
  server.close(() => {
    console.log("[Server] Process terminated.");
    process.exit(0);
  });
});
