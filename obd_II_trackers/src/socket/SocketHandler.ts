import { Server as SocketIOServer, Socket } from "socket.io";
import { SessionManager, DeviceLogger } from "../core";
import { ObdParser, ParsedMessage } from "../protocol";

/**
 * SocketHandler — Real-time event transport layer for OBD devices.
 *
 * Responsibilities:
 * - Accept device connections
 * - Register devices and maintain sessions
 * - Receive and acknowledge telemetry events
 * - Handle disconnect events
 */
export class SocketHandler {
  private io: SocketIOServer;
  private sessionManager: SessionManager;
  private logger: DeviceLogger;

  constructor(
    io: SocketIOServer,
    sessionManager: SessionManager,
    logger: DeviceLogger,
  ) {
    this.io = io;
    this.sessionManager = sessionManager;
    this.logger = logger;
  }

  /** Initialize transport layer events. */
  init(): void {
    this.io.on("connection", (socket: Socket) => {
      // Default placeholder device until registered
      let currentDeviceId = `unregistered_${socket.id}`;

      this.logger.info(currentDeviceId, "Device socket connected", {
        socketId: socket.id,
      });

      /**
       * Handle incoming raw telemetry data (string/hex payload)
       */
      socket.on(
        "telemetry",
        async (hexPayload: string, ack?: (res: any) => void) => {
          try {
            if (!hexPayload || typeof hexPayload !== "string") {
              throw new Error("Invalid telemetry payload format");
            }

            // 1. Parse payload
            const parsed = ObdParser.parse(hexPayload);

            // 2. Identify and register device if not already done
            if (
              parsed.deviceId &&
              parsed.deviceId !== "unknown" &&
              currentDeviceId.startsWith("unregistered_")
            ) {
              currentDeviceId = parsed.deviceId;
              this.sessionManager.registerDevice(currentDeviceId, socket.id);
              this.logger.info(
                currentDeviceId,
                "Device registered via telemetry",
                { type: parsed.type },
              );
            }

            // 3. Update activity
            if (!currentDeviceId.startsWith("unregistered_")) {
              this.sessionManager.updateActivity(currentDeviceId);
            }

            // 4. Log and handle specific message types
            await this.handleParsedMessage(currentDeviceId, parsed);

            // 5. Deterministic acknowledgment
            if (ack && typeof ack === "function") {
              ack({ status: "ok", ts: Date.now() });
            }
          } catch (error) {
            this.logger.error(currentDeviceId, "Telemetry processing error", {
              error: error instanceof Error ? error.message : String(error),
              raw: hexPayload,
            });

            if (ack && typeof ack === "function") {
              ack({ status: "error", reason: "processing_failed" });
            }
          }
        },
      );

      /**
       * Handle explicit registration event
       */
      socket.on(
        "register",
        (data: { deviceId: string }, ack?: (res: any) => void) => {
          if (data && data.deviceId) {
            currentDeviceId = data.deviceId;
            this.sessionManager.registerDevice(currentDeviceId, socket.id);
            this.logger.info(currentDeviceId, "Device explicitly registered");

            if (ack && typeof ack === "function") {
              ack({ status: "registered", deviceId: currentDeviceId });
            }
          } else {
            if (ack && typeof ack === "function") {
              ack({ status: "error", reason: "missing_deviceId" });
            }
          }
        },
      );

      /**
       * Clean up on disconnect
       */
      socket.on("disconnect", (reason) => {
        if (!currentDeviceId.startsWith("unregistered_")) {
          this.sessionManager.removeDevice(currentDeviceId);
          this.logger.info(currentDeviceId, "Device disconnected", { reason });
        } else {
          // Fallback if not registered
          this.sessionManager.removeBySocketId(socket.id);
        }
      });
    });
  }

  /** Specific routing for parsed messages. */
  private async handleParsedMessage(
    deviceId: string,
    msg: ParsedMessage,
  ): Promise<void> {
    if (msg.type === "UNKNOWN") {
      await this.logger.warn(deviceId, "Unknown protocol message received", {
        raw: msg.raw,
      });
      return;
    }

    // Structured logging of the telemetry
    await this.logger.info(deviceId, `Received ${msg.type}`, msg.data || {});

    // Further domain event logic could be dispatched here (e.g. to Apache Kafka or alerting engine).
    // For now, logging to disk suffices per spec.
  }
}
