/**
 * HexParser — Strict validation and conversion for HEX protocol payloads.
 *
 * All incoming payloads must pass isValidHex() before parsing.
 */
export class HexParser {
  private static readonly HEX_REGEX = /^[0-9a-fA-F]+$/;

  /** Validate that a string is a valid HEX representation. */
  static isValidHex(hex: string): boolean {
    if (!hex || typeof hex !== "string") return false;
    if (hex.length % 2 !== 0) return false;
    return this.HEX_REGEX.test(hex);
  }

  /** Convert a validated HEX string to a Buffer. */
  static toBuffer(hex: string): Buffer {
    if (!this.isValidHex(hex)) {
      throw new Error(`Invalid HEX string: "${hex}"`);
    }
    return Buffer.from(hex, "hex");
  }

  /** Extract a segment of bytes from a buffer at a given offset. */
  static extractBytes(buffer: Buffer, offset: number, length: number): Buffer {
    if (offset < 0 || length < 0) {
      throw new Error("Offset and length must be non-negative");
    }
    if (offset + length > buffer.length) {
      throw new Error(
        `Cannot extract ${length} bytes at offset ${offset} from buffer of length ${buffer.length}`,
      );
    }
    return buffer.subarray(offset, offset + length);
  }

  /** Read an unsigned 32-bit big-endian integer from buffer at offset. */
  static readUInt32BE(buffer: Buffer, offset: number): number {
    if (offset + 4 > buffer.length) {
      throw new Error(`Cannot read UInt32BE at offset ${offset}`);
    }
    return buffer.readUInt32BE(offset);
  }

  /** Read an unsigned 16-bit big-endian integer from buffer at offset. */
  static readUInt16BE(buffer: Buffer, offset: number): number {
    if (offset + 2 > buffer.length) {
      throw new Error(`Cannot read UInt16BE at offset ${offset}`);
    }
    return buffer.readUInt16BE(offset);
  }

  /** Read a single unsigned byte from buffer at offset. */
  static readUInt8(buffer: Buffer, offset: number): number {
    if (offset >= buffer.length) {
      throw new Error(`Cannot read UInt8 at offset ${offset}`);
    }
    return buffer.readUInt8(offset);
  }

  /**
   * JT808 Un-escape logic:
   * 0x7d 0x01 -> 0x7d
   * 0x7d 0x02 -> 0x7e
   */
  static unEscape(buffer: Buffer): Buffer {
    const result = Buffer.alloc(buffer.length);
    let writeOffset = 0;

    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0x7d && i + 1 < buffer.length) {
        const next = buffer[i + 1];
        if (next === 0x01) {
          result[writeOffset++] = 0x7d;
          i++;
          continue;
        } else if (next === 0x02) {
          result[writeOffset++] = 0x7e;
          i++;
          continue;
        }
      }
      result[writeOffset++] = buffer[i];
    }

    return result.subarray(0, writeOffset);
  }

  /**
   * Calculate XOR checksum of a buffer.
   */
  static calculateChecksum(buffer: Buffer): number {
    let checksum = 0;
    for (let i = 0; i < buffer.length; i++) {
      checksum ^= buffer[i];
    }
    return checksum;
  }
}
