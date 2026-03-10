import { DtcRecord } from "../types";

/**
 * Decodes standard 2-byte OBD-II Diagnostic Trouble Codes.
 * Implements strict bitwise deterministic decoding.
 */
export class DtcDecoder {
  public static decode(hexStr: string): DtcRecord {
    if (hexStr.length !== 4) {
      throw new Error("DTC HEX must be exactly 2 bytes (4 hex characters)");
    }

    const byte1 = parseInt(hexStr.substring(0, 2), 16);
    const byte2 = parseInt(hexStr.substring(2, 4), 16);

    // Standard OBD-II Bitwise extraction
    // Bits 15-14 define the system (P, C, B, U)
    const systemBits = (byte1 >> 6) & 0x03;
    let systemChar = "U";
    let systemName: DtcRecord["type"] = "Unknown";

    switch (systemBits) {
      case 0x00:
        systemChar = "P";
        systemName = "Powertrain";
        break;
      case 0x01:
        systemChar = "C";
        systemName = "Chassis";
        break;
      case 0x02:
        systemChar = "B";
        systemName = "Body";
        break;
      case 0x03:
        systemChar = "U";
        systemName = "Network";
        break;
    }

    // Bits 13-12 define the second character (0-3)
    const digit2 = (byte1 >> 4) & 0x03;

    // Bits 11-8 define the third character (Hex 0-F)
    const digit3 = byte1 & 0x0f;

    // Byte 2 represents the last two hex characters
    const bottomHex = hexStr.substring(2, 4).toUpperCase();

    const code = `${systemChar}${digit2}${digit3.toString(16).toUpperCase()}${bottomHex}`;

    return { code, type: systemName, rawHex: hexStr.toUpperCase() };
  }

  public static parseMultiple(hexPayload: string): DtcRecord[] {
    const dtcs: DtcRecord[] = [];
    for (let i = 0; i < hexPayload.length; i += 4) {
      const chunk = hexPayload.substring(i, i + 4);
      if (chunk.length === 4 && chunk !== "0000") {
        dtcs.push(this.decode(chunk));
      }
    }
    return dtcs;
  }
}
