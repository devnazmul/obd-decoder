/**
 * DtcDecoder — Decodes OBD-II Diagnostic Trouble Codes.
 *
 * Uses bitwise decoding per the OBD-II standard:
 *   Bits 14-15 determine the system prefix:
 *     00 = P (Powertrain)
 *     01 = C (Chassis)
 *     10 = B (Body)
 *     11 = U (Network)
 *
 * Example:
 *   0x0380 → P0380
 *   0x5234 → C1234
 */
export class DtcDecoder {
  private static readonly PREFIXES: Record<number, string> = {
    0: "P", // Powertrain
    1: "C", // Chassis
    2: "B", // Body
    3: "U", // Network / Communication
  };

  /**
   * Decode a single 2-byte DTC code from its HEX string representation.
   * Returns null for padding codes (0000).
   */
  static decodeSingle(hexCode: string): string | null {
    if (!hexCode || hexCode.length !== 4) {
      throw new Error(`Invalid DTC hex code: "${hexCode}"`);
    }

    // Ignore padding
    if (hexCode === "0000") return null;

    const value = parseInt(hexCode, 16);
    if (isNaN(value)) {
      throw new Error(`Invalid HEX value: "${hexCode}"`);
    }

    // Bits 14-15 → system prefix
    const prefixIndex = (value >> 14) & 0x03;
    const prefix = this.PREFIXES[prefixIndex];

    // Bits 12-13 → first digit
    const firstDigit = (value >> 12) & 0x03;

    // Bits 8-11 → second digit
    const secondDigit = (value >> 8) & 0x0f;

    // Bits 4-7 → third digit
    const thirdDigit = (value >> 4) & 0x0f;

    // Bits 0-3 → fourth digit
    const fourthDigit = value & 0x0f;

    return `${prefix}${firstDigit}${secondDigit}${thirdDigit}${fourthDigit}`;
  }

  /**
   * Decode multiple DTC codes from an array of HEX strings.
   * Ignores 0000 padding entries.
   */
  static decodeMultiple(hexCodes: string[]): string[] {
    const results: string[] = [];

    for (const code of hexCodes) {
      const decoded = this.decodeSingle(code);
      if (decoded !== null) {
        results.push(decoded);
      }
    }

    return results;
  }

  /**
   * Decode DTCs from a raw HEX payload string.
   * Splits the payload into 4-char chunks and decodes each.
   */
  static decodeFromPayload(payload: string): string[] {
    if (payload.length % 4 !== 0) {
      throw new Error("DTC payload length must be a multiple of 4");
    }

    const codes: string[] = [];
    for (let i = 0; i < payload.length; i += 4) {
      codes.push(payload.substring(i, i + 4));
    }

    return this.decodeMultiple(codes);
  }
}
