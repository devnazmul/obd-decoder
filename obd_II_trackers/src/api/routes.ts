import { Router, Request, Response } from "express";
import { SessionManager } from "../core";

/**
 * Setup REST API routes for health and monitoring.
 */
export function setupRoutes(sessionManager: SessionManager): Router {
  const router = Router();

  /**
   * GET /api/health
   * Basic system health check.
   */
  router.get("/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      activeDevices: sessionManager.getDeviceCount(),
      memory: process.memoryUsage(),
    });
  });

  /**
   * GET /api/devices
   * List all currently active device sessions.
   */
  router.get("/devices", (req: Request, res: Response) => {
    const devices = sessionManager.getActiveDevices();
    res.json({
      count: devices.length,
      devices,
    });
  });

  return router;
}
