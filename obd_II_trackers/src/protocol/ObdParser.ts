import { HexParser } from "./HexParser";
import { DtcDecoder } from "./DtcDecoder";

/**
 * Parsed message envelope from a JT808 device.
 */
export interface ParsedMessage {
  messageId: string;
  type: MessageType;
  deviceId: string;
  raw: string;
  data:
    | LocationData
    | RegistrationData
    | AuthData
    | HeartbeatData
    | PassthroughData
    | TerminalAttributesData
    | RegistrationResponseData
    | PlatformAckData
    | null;
}

export type MessageType =
  | "REGISTRATION"
  | "AUTHENTICATION"
  | "HEARTBEAT"
  | "LOCATION"
  | "PASSTHROUGH"
  | "TERMINAL_ATTRIBUTES"
  | "REGISTRATION_RESPONSE"
  | "PLATFORM_ACK"
  | "UNKNOWN";

export interface LocationData {
  latitude: number;
  longitude: number;
  speed: number;
  direction: number;
  timestamp: string;
  alarmFlags: number;
  statusFlags: number;
  additionalInfo?: Record<number, any>;
  mileage?: number; // in 1/10 km
  fuel?: number; // in 1/10 L
}

export interface RegistrationData {
  provinceId: number;
  cityId: number;
  manufacturerId: string;
  terminalModel: string;
  terminalId: string;
  plateColor: number;
  plate: string;
}

export interface AuthData {
  authCode: string;
}

export interface HeartbeatData {
  timestamp: string;
}

export interface PassthroughData {
  subType: string;
  dtcCodes?: string[];
  vin?: string;
  rawPayload: string;
}

export interface TerminalAttributesData {
  terminalType: number;
  manufacturerId: string;
  terminalModel: string;
  terminalId: string;
  iccid: string;
  hardwareVersion: string;
  firmwareVersion: string;
  gnssAttributes: number;
  communicationAttributes: number;
}

export interface RegistrationResponseData {
  flowId: number;
  result: number;
  authCode?: string;
}

export interface PlatformAckData {
  flowId: number;
  ackFlowId: number;
  ackMessageId: string;
  result: number;
}

export interface ParsedObdData {
  rpm?: number;
  coolantTemp?: number;
  engineLoad?: number;
  throttlePos?: number;
  intakePressure?: number;
  intakeTemp?: number;
  ignitionAdvance?: number;
  totalMileage?: number;
  fuelUsed?: number;
}

/**
 * ObdParser — JT808 Protocol message parser.
 *
 * Supported message types:
 *   0x0100 — Device registration
 *   0x0102 — Device authentication
 *   0x0002 — Heartbeat
 *   0x0200 — GPS location report
 *   0x0900 — OBD passthrough data
 *
 * All parsing is deterministic and fail-safe.
 * Malformed payloads will never crash the server.
 */
export class ObdParser {
  private static readonly MSG_REGISTRATION = "0100";
  private static readonly MSG_AUTHENTICATION = "0102";
  private static readonly MSG_HEARTBEAT = "0002";
  private static readonly MSG_LOCATION = "0200";
  private static readonly MSG_PASSTHROUGH = "0900";
  private static readonly MSG_TERMINAL_ATTRIBUTES = "0107";
  private static readonly MSG_REGISTRATION_RESPONSE = "8100";
  private static readonly MSG_PLATFORM_ACK = "8001";

  /**
   * Parse a raw HEX payload into a structured message.
   * Returns a ParsedMessage with type UNKNOWN for unsupported message ids.
   */
  static parse(hexPayload: string): ParsedMessage {
    if (!HexParser.isValidHex(hexPayload)) {
      return this.unknownMessage(hexPayload, "Invalid HEX payload");
    }

    try {
      // 1. Initial Buffer conversion (required for JT808 header check)
      const rawBuffer = HexParser.toBuffer(hexPayload);

      // 2. JT808 un-escaping (required for accurate body parsing and checksum)
      const buffer = HexParser.unEscape(rawBuffer);

      // JT808 minimum frame: 1 byte header (0x7e) + 2 byte msg id + ...
      if (buffer.length < 12) {
        return this.unknownMessage(hexPayload, "Payload too short");
      }

      // Extract message ID (bytes 1-2 after 0x7E marker or directly at offset 0)
      let msgIdOffset = 0;
      if (buffer[0] === 0x7e) {
        msgIdOffset = 1;
      }

      const msgIdValue = HexParser.readUInt16BE(buffer, msgIdOffset);
      const messageId = msgIdValue.toString(16).padStart(4, "0");

      // Extract device ID from header (BCD encoded phone number, bytes 5-10 after msg ID)
      const phoneOffset = msgIdOffset + 4;
      let deviceId = "unknown";

      if (buffer.length >= phoneOffset + 6) {
        const phoneBytes = HexParser.extractBytes(buffer, phoneOffset, 6);
        deviceId = phoneBytes.toString("hex").replace(/^0+/, "") || "0";
      }

      // Body starts after header
      const bodyOffset = msgIdOffset + 12;
      const bodyEnd =
        buffer[buffer.length - 1] === 0x7e ? buffer.length - 1 : buffer.length;
      const body = buffer.subarray(bodyOffset, bodyEnd);

      switch (messageId) {
        case this.MSG_REGISTRATION:
          return this.parseRegistration(hexPayload, deviceId, messageId, body);

        case this.MSG_AUTHENTICATION:
          return this.parseAuthentication(
            hexPayload,
            deviceId,
            messageId,
            body,
          );

        case this.MSG_HEARTBEAT:
          return this.parseHeartbeat(hexPayload, deviceId, messageId);

        case this.MSG_LOCATION:
          return this.parseLocation(hexPayload, deviceId, messageId, body);

        case this.MSG_PASSTHROUGH:
          return this.parsePassthrough(hexPayload, deviceId, messageId, body);

        case this.MSG_TERMINAL_ATTRIBUTES:
          return this.parseTerminalAttributes(
            hexPayload,
            deviceId,
            messageId,
            body,
          );

        case this.MSG_REGISTRATION_RESPONSE:
          return this.parseRegistrationResponse(
            hexPayload,
            deviceId,
            messageId,
            body,
          );

        case this.MSG_PLATFORM_ACK:
          return this.parsePlatformAck(hexPayload, deviceId, messageId, body);

        default:
          return {
            messageId,
            type: "UNKNOWN",
            deviceId,
            raw: hexPayload,
            data: null,
          };
      }
    } catch (error) {
      return this.unknownMessage(hexPayload, "Parse error");
    }
  }

  /** Parse 0x0100 — Device registration. */
  private static parseRegistration(
    raw: string,
    deviceId: string,
    messageId: string,
    body: Buffer,
  ): ParsedMessage {
    try {
      const data: RegistrationData = {
        provinceId: body.length >= 2 ? body.readUInt16BE(0) : 0,
        cityId: body.length >= 4 ? body.readUInt16BE(2) : 0,
        manufacturerId:
          body.length >= 9 ? body.subarray(4, 9).toString("ascii").trim() : "",
        terminalModel:
          body.length >= 29
            ? body.subarray(9, 29).toString("ascii").trim()
            : "",
        terminalId:
          body.length >= 36
            ? body.subarray(29, 36).toString("ascii").trim()
            : "",
        plateColor: body.length >= 37 ? body.readUInt8(36) : 0,
        plate:
          body.length > 37 ? body.subarray(37).toString("utf8").trim() : "",
      };

      return { messageId, type: "REGISTRATION", deviceId, raw, data };
    } catch {
      return { messageId, type: "REGISTRATION", deviceId, raw, data: null };
    }
  }

  /** Parse 0x0102 — Device authentication. */
  private static parseAuthentication(
    raw: string,
    deviceId: string,
    messageId: string,
    body: Buffer,
  ): ParsedMessage {
    try {
      const data: AuthData = {
        authCode: body.toString("ascii").trim(),
      };
      return { messageId, type: "AUTHENTICATION", deviceId, raw, data };
    } catch {
      return { messageId, type: "AUTHENTICATION", deviceId, raw, data: null };
    }
  }

  /** Parse 0x0107 — Terminal attributes. */
  private static parseTerminalAttributes(
    raw: string,
    deviceId: string,
    messageId: string,
    body: Buffer,
  ): ParsedMessage {
    try {
      // Attributes structure:
      // Type(2) + Manufacturer(5) + Model(20) + ID(7) + ICCID(10) +
      // HW_Len(1) + HW_Ver(N) + FW_Len(1) + FW_Ver(N) + GNSS(1) + Comm(1)
      if (body.length < 44) {
        return {
          messageId,
          type: "TERMINAL_ATTRIBUTES",
          deviceId,
          raw,
          data: null,
        };
      }

      const terminalType = body.readUInt16BE(0);
      const manufacturerId = body.subarray(2, 7).toString("ascii").trim();
      const terminalModel = body.subarray(7, 27).toString("ascii").trim();
      const terminalId = body.subarray(27, 34).toString("ascii").trim();
      const iccid = body.subarray(34, 44).toString("hex");

      let offset = 44;
      const hwLen = body.readUInt8(offset++);
      const hardwareVersion = body
        .subarray(offset, offset + hwLen)
        .toString("ascii");
      offset += hwLen;

      const fwLen = body.readUInt8(offset++);
      const firmwareVersion = body
        .subarray(offset, offset + fwLen)
        .toString("ascii");
      offset += fwLen;

      const gnssAttributes = body.readUInt8(offset++);
      const communicationAttributes = body.readUInt8(offset++);

      const data: TerminalAttributesData = {
        terminalType,
        manufacturerId,
        terminalModel,
        terminalId,
        iccid,
        hardwareVersion,
        firmwareVersion,
        gnssAttributes,
        communicationAttributes,
      };

      return { messageId, type: "TERMINAL_ATTRIBUTES", deviceId, raw, data };
    } catch {
      return {
        messageId,
        type: "TERMINAL_ATTRIBUTES",
        deviceId,
        raw,
        data: null,
      };
    }
  }

  /** Parse 0x0002 — Heartbeat. */
  private static parseHeartbeat(
    raw: string,
    deviceId: string,
    messageId: string,
  ): ParsedMessage {
    const data: HeartbeatData = {
      timestamp: new Date().toISOString(),
    };
    return { messageId, type: "HEARTBEAT", deviceId, raw, data };
  }

  /** Parse 0x0200 — GPS location report. */
  private static parseLocation(
    raw: string,
    deviceId: string,
    messageId: string,
    body: Buffer,
  ): ParsedMessage {
    try {
      // Location body: AlarmFlags(4) + StatusFlags(4) + Lat(4) + Lon(4) +
      //                Altitude(2) + Speed(2) + Direction(2) + Timestamp(6) = 28 bytes
      if (body.length < 28) {
        return { messageId, type: "LOCATION", deviceId, raw, data: null };
      }

      const alarmFlags = body.readUInt32BE(0);
      const statusFlags = body.readUInt32BE(4);

      // Latitude and longitude are in units of 1e-6 degrees
      const latitude = body.readUInt32BE(8) / 1e6;
      const longitude = body.readUInt32BE(12) / 1e6;

      // Altitude in meters (unused for now but in protocol)
      // const altitude = body.readUInt16BE(16);

      // Speed in 1/10 km/h
      const speed = body.readUInt16BE(18) / 10;

      // Direction in degrees (0-359)
      const direction = body.readUInt16BE(20);

      // BCD-encoded timestamp: YYMMDDHHmmss (6 bytes)
      const tsBytes = body.subarray(22, 28);
      const bcdStr = tsBytes.toString("hex");
      const year = 2000 + parseInt(bcdStr.substring(0, 2));
      const month = bcdStr.substring(2, 4);
      const day = bcdStr.substring(4, 6);
      const hour = bcdStr.substring(6, 8);
      const min = bcdStr.substring(8, 10);
      const sec = bcdStr.substring(10, 12);
      const timestamp = `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;

      const data: LocationData = {
        latitude,
        longitude,
        speed,
        direction,
        timestamp,
        alarmFlags,
        statusFlags,
      };

      // Handle additional information TLV (Starting from offset 28)
      if (body.length > 28) {
        data.additionalInfo = {};
        let offset = 28;
        while (offset + 1 < body.length) {
          const id = body.readUInt8(offset++);
          const len = body.readUInt8(offset++);
          if (offset + len > body.length) break;

          const val = body.subarray(offset, offset + len);
          data.additionalInfo[id] = val.toString("hex");

          // Specifically handle mileage (0x01) and fuel (0x02)
          if (id === 0x01 && len === 4) {
            data.mileage = val.readUInt32BE(0);
          } else if (id === 0x02 && len === 2) {
            data.fuel = val.readUInt16BE(0);
          }

          offset += len;
        }
      }

      return { messageId, type: "LOCATION", deviceId, raw, data };
    } catch {
      return { messageId, type: "LOCATION", deviceId, raw, data: null };
    }
  }

  /** Parse 0x8100 — Terminal registration response. */
  private static parseRegistrationResponse(
    raw: string,
    deviceId: string,
    messageId: string,
    body: Buffer,
  ): ParsedMessage {
    try {
      if (body.length < 3) {
        return {
          messageId,
          type: "REGISTRATION_RESPONSE",
          deviceId,
          raw,
          data: null,
        };
      }

      const flowId = body.readUInt16BE(0);
      const result = body.readUInt8(2);
      const authCode =
        body.length > 3 ? body.subarray(3).toString("ascii").trim() : undefined;

      const data: RegistrationResponseData = {
        flowId,
        result,
        authCode,
      };

      return { messageId, type: "REGISTRATION_RESPONSE", deviceId, raw, data };
    } catch {
      return {
        messageId,
        type: "REGISTRATION_RESPONSE",
        deviceId,
        raw,
        data: null,
      };
    }
  }

  /** Parse 0x8001 — Platform universal response. */
  private static parsePlatformAck(
    raw: string,
    deviceId: string,
    messageId: string,
    body: Buffer,
  ): ParsedMessage {
    try {
      if (body.length < 5) {
        return { messageId, type: "PLATFORM_ACK", deviceId, raw, data: null };
      }

      const flowId = body.readUInt16BE(0);
      const ackFlowId = body.readUInt16BE(2);
      const ackMessageId = body.readUInt16BE(4).toString(16).padStart(4, "0");
      const result = body.length > 6 ? body.readUInt8(6) : 0;

      const data: PlatformAckData = {
        flowId,
        ackFlowId,
        ackMessageId,
        result,
      };

      return { messageId, type: "PLATFORM_ACK", deviceId, raw, data };
    } catch {
      return { messageId, type: "PLATFORM_ACK", deviceId, raw, data: null };
    }
  }

  /** Parse 0x0900 — OBD passthrough data. */
  private static parsePassthrough(
    raw: string,
    deviceId: string,
    messageId: string,
    body: Buffer,
  ): ParsedMessage {
    try {
      const rawPayload = body.toString("hex");

      // Sub-type is the first byte
      const subType =
        body.length > 0
          ? body.readUInt8(0).toString(16).padStart(2, "0")
          : "unknown";

      const data: PassthroughData = {
        subType,
        rawPayload,
      };

      // Try to extract DTCs if payload has enough data
      if (body.length > 2) {
        const dtcPayload = body.subarray(1).toString("hex");
        try {
          const dtcCodes = DtcDecoder.decodeFromPayload(dtcPayload);
          if (dtcCodes.length > 0) {
            data.dtcCodes = dtcCodes;
          }
        } catch {
          // Not all passthrough data contains DTCs — that's fine
        }
      }

      // Try to extract VIN (17 ASCII chars)
      if (body.length >= 18) {
        const possibleVin = body.subarray(1, 18).toString("ascii");
        if (/^[A-HJ-NPR-Z0-9]{17}$/.test(possibleVin)) {
          data.vin = possibleVin;
        }
      }

      return { messageId, type: "PASSTHROUGH", deviceId, raw, data };
    } catch {
      return { messageId, type: "PASSTHROUGH", deviceId, raw, data: null };
    }
  }

  /** Create an UNKNOWN message for failed/unsupported parsing. */
  private static unknownMessage(raw: string, reason: string): ParsedMessage {
    return {
      messageId: "unknown",
      type: "UNKNOWN",
      deviceId: "unknown",
      raw,
      data: null,
    };
  }

  /**
   * Parses the 0200 body AND the attached OBD/Status blocks
   */
  public static parse0200WithObd(bodyHex: string) {
    // Parse base GPS (First 28 bytes / 56 hex chars)
    const baseData = this.parseBaseLocation(bodyHex.substring(0, 56));

    // Parse appended blocks (Hex string after 56 chars)
    const additionalHex = bodyHex.substring(56);
    const obdData = this.parseAppendedBlocks(additionalHex);

    return { ...baseData, obd: obdData };
  }

  private static parseBaseLocation(hex: string) {
    const lat = parseInt(hex.substring(16, 24), 16) / 1000000;
    const lon = parseInt(hex.substring(24, 32), 16) / 1000000;
    const speedKmH = parseInt(hex.substring(36, 40), 16) / 10;
    return { lat, lon, speedKmH };
  }

  private static parseAppendedBlocks(hex: string): ParsedObdData {
    let pointer = 0;
    const obd: ParsedObdData = {};

    while (pointer < hex.length) {
      const blockId = hex.substring(pointer, pointer + 2);
      const lengthHex = hex.substring(pointer + 2, pointer + 4);
      if (!lengthHex) break;

      const length = parseInt(lengthHex, 16) * 2; // in hex chars
      const dataHex = hex.substring(pointer + 4, pointer + 4 + length);

      // Parse JT808 Standard Blocks
      if (blockId === "01") {
        obd.totalMileage = parseInt(dataHex, 16) / 10;
      }
      // Parse J63S Custom OBD Block (Usually F3 or E3)
      else if (blockId === "F3") {
        Object.assign(obd, this.parseInnerObdPids(dataHex));
      }

      pointer += 4 + length;
    }
    return obd;
  }

  /**
   * Extracts standard OBD-II formulas from the custom CAN block
   */
  private static parseInnerObdPids(f3Hex: string): Partial<ParsedObdData> {
    let p = 0;
    const result: Partial<ParsedObdData> = {};

    while (p < f3Hex.length) {
      const pid = f3Hex.substring(p, p + 4); // 2-byte PID ID
      const len = parseInt(f3Hex.substring(p + 4, p + 6), 16) * 2;
      const valHex = f3Hex.substring(p + 6, p + 6 + len);

      const decVal = parseInt(valHex, 16);

      switch (pid) {
        case "0004":
          result.engineLoad = Math.round((decVal * 100) / 255);
          break; // PID 04
        case "0005":
          result.coolantTemp = decVal - 40;
          break; // PID 05
        case "000B":
          result.intakePressure = decVal;
          break; // PID 0B
        case "000C":
          result.rpm = decVal / 4;
          break; // PID 0C
        case "000E":
          result.ignitionAdvance = decVal / 2 - 64;
          break; // PID 0E
        case "000F":
          result.intakeTemp = decVal - 40;
          break; // PID 0F
        case "0011":
          result.throttlePos = Math.round((decVal * 100) / 255);
          break; // PID 11
      }
      p += 6 + len;
    }
    return result;
  }
}
