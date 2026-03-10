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
   * Parses the 0200 Location Information Report
   */
  public static parse0200(bodyHex: string) {
    try {
      // JT808 Standard offsets for 0200 message body
      const alarmHex = bodyHex.substring(0, 8);
      const statusHex = bodyHex.substring(8, 16);

      const latHex = bodyHex.substring(16, 24);
      const lonHex = bodyHex.substring(24, 32);

      const altHex = bodyHex.substring(32, 36);
      const speedHex = bodyHex.substring(36, 40);
      const dirHex = bodyHex.substring(40, 44);
      const timeBcd = bodyHex.substring(44, 56);

      // Decode to readable values
      const lat = parseInt(latHex, 16) / 1000000;
      const lon = parseInt(lonHex, 16) / 1000000;
      const speedKmH = parseInt(speedHex, 16) / 10;
      const direction = parseInt(dirHex, 16);

      // BCD Time format: YYMMDDHHMMSS -> 20YY-MM-DD HH:MM:SS
      const year = `20${timeBcd.substring(0, 2)}`;
      const month = timeBcd.substring(2, 4);
      const day = timeBcd.substring(4, 6);
      const hour = timeBcd.substring(6, 8);
      const min = timeBcd.substring(8, 10);
      const sec = timeBcd.substring(10, 12);
      const timestamp = `${year}-${month}-${day} ${hour}:${min}:${sec}`;

      return { timestamp, lat, lon, speedKmH, direction };
    } catch (e) {
      return { error: "Failed to parse 0200 Location Data" };
    }
  }

  /**
   * Parses the 0900 Passthrough Data (DTC Codes, VIN, Alerts)
   */
  public static parse0900(bodyHex: string) {
    try {
      const passthroughType = bodyHex.substring(0, 2); // e.g., F8
      const dataId = bodyHex.substring(2, 6); // e.g., 0008

      // DTC extraction logic based on the log provided
      // P0380 log format: F8 0008 000C 20260307003950 5030333830
      if (passthroughType === "F8") {
        const dataLengthHex = bodyHex.substring(6, 10);
        const timeBcd = bodyHex.substring(10, 24); // 7-byte BCD Time

        // Extract trailing payload (ASCII)
        const payloadHex = bodyHex.substring(24);
        let asciiPayload = "";
        for (let i = 0; i < payloadHex.length; i += 2) {
          const charCode = parseInt(payloadHex.substring(i, i + 2), 16);
          if (charCode >= 32 && charCode <= 126) {
            // Printable ASCII
            asciiPayload += String.fromCharCode(charCode);
          }
        }

        return {
          type: "OBD_Passthrough",
          timestamp: timeBcd,
          decodedAscii: asciiPayload,
        };
      }
      return { type: "Unknown_Passthrough", raw: bodyHex };
    } catch (e) {
      return { error: "Failed to parse 0900 Passthrough Data" };
    }
  }
}
