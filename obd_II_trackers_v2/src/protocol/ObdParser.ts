export interface ParsedObdData {
  totalMileage?: number;
  rawPids?: Record<string, number>;

  // Optional legacy fields for future mapping
  rpm?: number;
  coolantTemp?: number;
  engineLoad?: number;
  throttlePos?: number;
  intakePressure?: number;
  intakeTemp?: number;
  ignitionAdvance?: number;
  fuelUsed?: number;
}

export class ObdParser {
  /**
   * Extracts Header Information (Common for all JT808 messages)
   */
  public static parseHeader(hexStr: string) {
    // Remove 7E markers if present
    const cleanHex =
      hexStr.startsWith("7E") && hexStr.endsWith("7E")
        ? hexStr.substring(2, hexStr.length - 2)
        : hexStr;

    return {
      msgId: cleanHex.substring(0, 4),
      attributes: cleanHex.substring(4, 8),
      deviceId: cleanHex.substring(8, 20),
      seqNumber: cleanHex.substring(20, 24),
      body: cleanHex.substring(24, cleanHex.length - 2), // Exclude check code at the very end
      raw: hexStr,
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

  /**
   * Decode JT808 BCD Time format (YYMMDDHHMMSS)
   */
  public static parseBcdTime(bcd: string): string {
    if (!bcd || bcd === "000000000000" || bcd.length !== 12) return "";
    const year = `20${bcd.substring(0, 2)}`;
    const month = bcd.substring(2, 4);
    const day = bcd.substring(4, 6);
    const hour = bcd.substring(6, 8);
    const min = bcd.substring(8, 10);
    const sec = bcd.substring(10, 12);
    return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
  }

  private static parseBaseLocation(hex: string) {
    const lat = parseInt(hex.substring(16, 24), 16) / 1000000;
    const lon = parseInt(hex.substring(24, 32), 16) / 1000000;
    const speedKmH = parseInt(hex.substring(36, 40), 16) / 10;
    const dirHex = hex.substring(40, 44);
    const direction = parseInt(dirHex, 16);

    // Extract 12-character BCD time (Bytes 22-27)
    const timeBcd = hex.substring(44, 56);
    const deviceTime = this.parseBcdTime(timeBcd);

    return { lat, lon, speedKmH, direction, deviceTime };
  }

  private static parseAppendedBlocks(hex: string): ParsedObdData {
    let pointer = 0;
    const obd: ParsedObdData = { rawPids: {} };

    while (pointer < hex.length - 4) {
      // Ensure there is enough hex left
      const blockId = hex.substring(pointer, pointer + 2);
      const lengthHex = hex.substring(pointer + 2, pointer + 4);
      const length = parseInt(lengthHex, 16) * 2;

      const dataHex = hex.substring(pointer + 4, pointer + 4 + length);

      try {
        // 01 is standard JT808 Mileage
        if (blockId === "01" && dataHex) {
          const mil = parseInt(dataHex, 16) / 10;
          if (!isNaN(mil)) obd.totalMileage = mil;
        }
        // F3 is the J63S Proprietary OBD Block
        else if (blockId === "F3") {
          obd.rawPids = this.parseInnerObdPids(dataHex);
        }
      } catch (e) {
        // Safely skip malformed blocks instead of crashing
      }
      pointer += 4 + length;
    }
    return obd;
  }

  private static parseInnerObdPids(f3Hex: string): Record<string, number> {
    let p = 0;
    const rawPids: Record<string, number> = {};

    // Extract raw decimal values without applying incorrect standard OBD math
    while (p < f3Hex.length - 6) {
      const pid = f3Hex.substring(p, p + 4);
      const lenHex = f3Hex.substring(p + 4, p + 6);
      const len = parseInt(lenHex, 16) * 2;

      const valHex = f3Hex.substring(p + 6, p + 6 + len);
      if (valHex.length === len) {
        rawPids[pid] = parseInt(valHex, 16);
      }
      p += 6 + len;
    }
    return rawPids;
  }
}
