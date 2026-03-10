import { Server, Socket } from "socket.io";
import { SessionManager } from "../core/SessionManager";
import { HexParser } from "../protocol/HexParser";
import { DtcDecoder } from "../protocol/DtcDecoder";
import { DeviceLogger } from "../core/DeviceLogger";

export class SocketHandler {
  private io: Server;
  private sessionManager: SessionManager;

  constructor(io: Server, sessionManager: SessionManager) {
    this.io = io;
    this.sessionManager = sessionManager;
  }

  public handleConnection(socket: Socket) {
    socket.on("device:register", (data: { deviceId: string }) => {
      try {
        if (!data || !data.deviceId) throw new Error("Missing deviceId");
        this.sessionManager.registerDevice(data.deviceId, socket.id);
        DeviceLogger.log(data.deviceId, "INFO", "Device Registered", {
          socketId: socket.id,
        });
        socket.emit("device:ack", { status: "registered" });
      } catch (error: any) {
        console.error("Registration Error", error.message);
      }
    });

    socket.on(
      "device:dtc",
      (data: { deviceId: string; hexPayload: string }) => {
        try {
          this.sessionManager.updateActivity(data.deviceId);

          if (!HexParser.isValidHex(data.hexPayload)) {
            throw new Error("Invalid HEX payload format");
          }

          const dtcs = DtcDecoder.parseMultiple(data.hexPayload);
          DeviceLogger.log(data.deviceId, "INFO", "DTC Data Received", {
            rawHex: data.hexPayload,
            decodedDtcs: dtcs,
          });

          // Acknowledge receipt deterministically
          socket.emit("device:ack", {
            event: "device:dtc",
            status: "success",
            parsedCount: dtcs.length,
          });
        } catch (error: any) {
          DeviceLogger.log(data.deviceId, "ERROR", "DTC Parse Error", {
            error: error.message,
            payload: data.hexPayload,
          });
          socket.emit("device:error", { message: "Malformed DTC Payload" });
        }
      },
    );

    socket.on("disconnect", () => {
      const deviceId = this.sessionManager.removeSessionBySocket(socket.id);
      if (deviceId) {
        DeviceLogger.log(deviceId, "INFO", "Device Disconnected", {
          socketId: socket.id,
        });
      }
    });
  }
}
