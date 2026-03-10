import { HexParser } from "../../src/protocol/HexParser";

describe("HexParser", () => {
  describe("isValidHex()", () => {
    it("returns true for valid hex strings", () => {
      expect(HexParser.isValidHex("0102030A0B0C")).toBe(true);
      expect(HexParser.isValidHex("abcdef")).toBe(true);
      expect(HexParser.isValidHex("ABCDEF")).toBe(true);
      expect(HexParser.isValidHex("00")).toBe(true);
    });

    it("returns false for invalid hex strings", () => {
      expect(HexParser.isValidHex("0102030G")).toBe(false); // Invalid character 'G'
      expect(HexParser.isValidHex("123")).toBe(false); // Odd length
      expect(HexParser.isValidHex("")).toBe(false); // Empty string
      expect(HexParser.isValidHex(" ")).toBe(false); // Whitespace
      expect(HexParser.isValidHex(null as any)).toBe(false);
    });
  });

  describe("toBuffer()", () => {
    it("converts valid hex to buffer", () => {
      const buf = HexParser.toBuffer("0a0b");
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBe(2);
      expect(buf[0]).toBe(10);
      expect(buf[1]).toBe(11);
    });

    it("throws error for invalid hex", () => {
      expect(() => HexParser.toBuffer("0a0G")).toThrow("Invalid HEX string");
    });
  });

  describe("extractBytes()", () => {
    const buf = Buffer.from([10, 20, 30, 40, 50]);

    it("extracts bytes correctly", () => {
      const slice = HexParser.extractBytes(buf, 1, 3);
      expect(slice.length).toBe(3);
      expect(slice[0]).toBe(20);
      expect(slice[2]).toBe(40);
    });

    it("throws error on out-of-bounds offset", () => {
      expect(() => HexParser.extractBytes(buf, 4, 2)).toThrow("Cannot extract");
    });

    it("throws error on negative offsets", () => {
      expect(() => HexParser.extractBytes(buf, -1, 2)).toThrow("non-negative");
    });
  });

  describe("readUInt methods", () => {
    it("reads UInt32BE safely", () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00]);
      expect(HexParser.readUInt32BE(buf, 0)).toBe(66051);
      expect(() => HexParser.readUInt32BE(buf, 2)).toThrow();
    });

    it("reads UInt16BE safely", () => {
      const buf = Buffer.from([0x01, 0x02]);
      expect(HexParser.readUInt16BE(buf, 0)).toBe(258);
      expect(() => HexParser.readUInt16BE(buf, 1)).toThrow();
    });

    it("reads UInt8 safely", () => {
      const buf = Buffer.from([0xff]);
      expect(HexParser.readUInt8(buf, 0)).toBe(255);
      expect(() => HexParser.readUInt8(buf, 1)).toThrow();
    });
  });
});
