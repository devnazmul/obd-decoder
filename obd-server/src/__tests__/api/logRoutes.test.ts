import request from "supertest";
jest.mock("../../server", () => {
  const express = require("express");
  const app = express();
  app.use(require("express").json());

  // Minimal io mock
  const io = { emit: jest.fn() };

  // Mount real logRoutes on the mock app
  const logRoutes = require("../../api/logRoutes").default;
  app.use("/api/logs", logRoutes);

  app.get("/api/health", (_req: any, res: any) =>
    res.json({ status: "OK", uptime: 0 }),
  );

  return { app, io, httpServer: { listen: jest.fn() } };
});

jest.mock("fs");

import fs from "fs";
const mockedFs = fs as jest.Mocked<typeof fs>;

import { app } from "../../server";

jest.mock("../../core/SessionManager", () => {
  const actual = jest.requireActual("../../core/SessionManager");
  return {
    ...actual,
    sessionManager: {
      getAllSessions: jest.fn().mockReturnValue([]),
      getSession: jest.fn(),
      updateSession: jest.fn(),
      processTelemetry: jest.fn(),
      startTrip: jest.fn(),
      endTrip: jest.fn(),
      recordEvent: jest.fn(),
    },
  };
});

describe("logRoutes API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/health", () => {
    it('should return { status: "OK" }', async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("OK");
    });
  });

  describe("GET /api/logs", () => {
    it("should return { devices: [] } when LOGS_DIR does not exist", async () => {
      mockedFs.existsSync.mockReturnValue(false);
      const res = await request(app).get("/api/logs");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ devices: [] });
    });

    it("should filter out system entries and non-numeric device IDs", async () => {
      mockedFs.existsSync.mockReturnValue(true);
      (mockedFs.statSync as jest.Mock).mockImplementation((p: any) => ({
        isDirectory: () => p.includes("device_"),
        size: 20000, // > 10KB
      }));
      mockedFs.readdirSync.mockImplementation((p: any) => {
        if (typeof p === "string" && p.includes("device_12345678901")) {
          return ["device_12345678901_2026-03-25.log"] as any;
        }
        return [
          "device_SYSTEM",
          "device_UNKNOWN_DEVICE",
          "device_ABCDEF", // non-numeric
          "device_12345678901", // valid numeric, 11 digits
        ] as any;
      });

      const res = await request(app).get("/api/logs");
      expect(res.status).toBe(200);
      expect(res.body.devices).toContain("12345678901");
      expect(res.body.devices).not.toContain("SYSTEM");
      expect(res.body.devices).not.toContain("UNKNOWN_DEVICE");
    });
  });

  describe("GET /api/logs/devices", () => {
    it("should return { devices: [] } when LOGS_DIR does not exist", async () => {
      mockedFs.existsSync.mockReturnValue(false);
      const res = await request(app).get("/api/logs/devices");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ devices: [] });
    });
  });

  describe("GET /api/logs/v1.0/devices/status", () => {
    it("should return 0 devices when no sessions exist", async () => {
      const res = await request(app).get("/api/logs/v1.0/devices/status");
      expect(res.status).toBe(200);
      expect(res.body.total_devices).toBe(0);
      expect(res.body.devices).toEqual([]);
    });

    it("should return correct device status for a connected session", async () => {
      const { sessionManager } = require("../../core/SessionManager");
      (sessionManager.getAllSessions as jest.Mock).mockReturnValue([
        {
          deviceId: "12345678901",
          ipAddress: "1.2.3.4",
          connectedAt: Date.now() - 60000,
          lastSeen: Date.now() - 10000, // 10 seconds ago → ONLINE
          lastRpm: 500, // > 300 → engine ON
          lastVoltage: 12.0,
        },
      ]);

      const res = await request(app).get("/api/logs/v1.0/devices/status");
      expect(res.status).toBe(200);
      expect(res.body.total_devices).toBe(1);
      const device = res.body.devices[0];
      expect(device.vehicle_id).toBe("12345678901");
      expect(device.connection_status).toBe("ONLINE");
      expect(device.engine_status).toBe("ON");
    });

    it("should mark device as OFFLINE when lastSeen > 10 minutes ago", async () => {
      const { sessionManager } = require("../../core/SessionManager");
      (sessionManager.getAllSessions as jest.Mock).mockReturnValue([
        {
          deviceId: "12345678901",
          ipAddress: "1.2.3.4",
          connectedAt: Date.now() - 3600000,
          lastSeen: Date.now() - 700000, // ~11.6 minutes ago → OFFLINE
          lastRpm: 0,
          lastVoltage: 0,
        },
      ]);

      const res = await request(app).get("/api/logs/v1.0/devices/status");
      expect(res.body.devices[0].connection_status).toBe("OFFLINE");
      expect(res.body.devices[0].engine_status).toBe("OFF");
    });
  });

  describe("GET /api/logs/v1.0/trips", () => {
    it("should return 400 when required parameters are missing", async () => {
      const res = await request(app).get("/api/logs/v1.0/trips");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/vehicle_id/i);
    });

    it("should return 400 when only vehicle_id is provided", async () => {
      const res = await request(app)
        .get("/api/logs/v1.0/trips")
        .query({ vehicle_id: "12345678901" });
      expect(res.status).toBe(400);
    });

    it("should return empty trips when device dir does not exist", async () => {
      mockedFs.existsSync.mockReturnValue(false);
      const res = await request(app)
        .get("/api/logs/v1.0/trips")
        .query({
          vehicle_id: "12345678901",
          start_time: "2026-03-01",
          end_time: "2026-03-31",
        });
      expect(res.status).toBe(200);
      expect(res.body.trips).toEqual([]);
    });
  });

  describe("GET /api/logs/:deviceId", () => {
    it("should return 404 when device directory does not exist", async () => {
      mockedFs.existsSync.mockReturnValue(false);
      const res = await request(app).get("/api/logs/99999999999");
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it("should return a list of log files for a known device", async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        "device_99999999999_2026-03-25.log",
        "device_99999999999_2026-03-26.log",
      ] as any);
      const res = await request(app).get("/api/logs/99999999999");
      expect(res.status).toBe(200);
      expect(res.body.deviceId).toBe("99999999999");
      expect(res.body.logs).toHaveLength(2);
    });
  });

  describe("GET /api/logs/:deviceId/:filename", () => {
    it("should return 404 when log file does not exist", async () => {
      mockedFs.existsSync.mockReturnValue(false);
      const res = await request(app).get(
        "/api/logs/99999999999/device_99999999999_2026-03-25.log",
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it("should parse and return log entries from a valid log file", async () => {
      mockedFs.existsSync.mockReturnValue(true);
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        event: "Test",
      });
      mockedFs.readFileSync.mockReturnValue(`${entry}\n` as any);

      const res = await request(app).get(
        "/api/logs/99999999999/device_99999999999_2026-03-25.log",
      );
      expect(res.status).toBe(200);
      expect(res.body.totalEntries).toBe(1);
      expect(res.body.data[0].event).toBe("Test");
    });
  });

  describe("GET /api/logs/:deviceId/:filename/playback", () => {
    it("should return 404 when log file does not exist", async () => {
      mockedFs.existsSync.mockReturnValue(false);
      const res = await request(app).get(
        "/api/logs/99999999999/device_99999999999_2026-03-25.log/playback",
      );
      expect(res.status).toBe(404);
    });

    it("should return trips extracted from log file", async () => {
      mockedFs.existsSync.mockReturnValue(true);
      const tripStart = JSON.stringify({
        event: "Trip Started",
        time: "2026-03-25 08:00:00",
      });
      const location = JSON.stringify({
        event: "Decoded Location & OBD",
        lat: 23.5,
        lon: 45.1,
        speed: 60,
        direction: 90,
        time: "2026-03-25 08:01:00",
      });
      const tripEnd = JSON.stringify({
        event: "Trip Ended",
        endTime: "2026-03-25 09:00:00",
      });
      mockedFs.readFileSync.mockReturnValue(
        `${tripStart}\n${location}\n${tripEnd}\n` as any,
      );

      const res = await request(app).get(
        "/api/logs/99999999999/device_99999999999_2026-03-25.log/playback",
      );
      expect(res.status).toBe(200);
      expect(res.body.totalTrips).toBeGreaterThanOrEqual(1);
      expect(res.body.trips[0].path).toHaveLength(1);
      expect(res.body.trips[0].path[0].lat).toBe(23.5);
    });
  });

  describe("GET /api/logs/v1.0/:deviceId/playback/duration", () => {
    it("should return 400 when start/end are missing", async () => {
      const res = await request(app).get(
        "/api/logs/v1.0/12345678901/playback/duration",
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/start and end/i);
    });

    it("should return 404 when device logs dir does not exist", async () => {
      mockedFs.existsSync.mockReturnValue(false);
      const res = await request(app)
        .get("/api/logs/v1.0/12345678901/playback/duration")
        .query({ start: "2026-03-25T00:00:00Z", end: "2026-03-25T23:59:59Z" });
      expect(res.status).toBe(404);
    });

    it("should return matching location points within the time range", async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        "device_12345678901_2026-03-25.log",
      ] as any);
      const point = JSON.stringify({
        event: "Decoded Location & OBD",
        timestamp: "2026-03-25T10:00:00.000Z",
        lat: 23.5,
        lon: 45.1,
        speed: 60,
        direction: 90,
        vehicleCondition: {},
      });
      mockedFs.readFileSync.mockReturnValue(`${point}\n` as any);

      const res = await request(app)
        .get("/api/logs/v1.0/12345678901/playback/duration")
        .query({ start: "2026-03-25T09:00:00Z", end: "2026-03-25T11:00:00Z" });
      expect(res.status).toBe(200);
      expect(res.body.totalPoints).toBe(1);
      expect(res.body.points[0].lat).toBe(23.5);
    });
  });
});
