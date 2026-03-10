/**
 * Deterministic HEX string parser.
 * Strict validation ensures no malformed payloads crash the system.
 */
export class HexParser {
  public static isValidHex(input: string): boolean {
    if (!input || input.length === 0) return false;
    if (input.length % 2 !== 0) return false; // Must be even length bytes
    const hexRegex = /^[0-9A-Fa-f]+$/;
    return hexRegex.test(input);
  }

  public static toBuffer(hexStr: string): Buffer {
    if (!this.isValidHex(hexStr)) {
      throw new Error(`Invalid HEX payload: ${hexStr}`);
    }
    return Buffer.from(hexStr, "hex");
  }

  public static extractBytes(
    hexStr: string,
    startByte: number,
    length: number,
  ): string {
    if (!this.isValidHex(hexStr)) throw new Error("Invalid HEX");
    const startIndex = startByte * 2;
    const endIndex = startIndex + length * 2;

    if (endIndex > hexStr.length) {
      throw new Error("Out of bounds HEX extraction");
    }
    return hexStr.substring(startIndex, endIndex).toUpperCase();
  }
}
