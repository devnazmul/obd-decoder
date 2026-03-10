import { HexParser } from "../../src/protocol/HexParser";

describe("HexParser", () => {
  it("should validate correct HEX strings", () => {
    expect(HexParser.isValidHex("7E020000E006")).toBe(true);
  });

  it("should reject odd-length strings", () => {
    expect(HexParser.isValidHex("7E020000E00")).toBe(false);
  });

  it("should reject non-hex characters", () => {
    expect(HexParser.isValidHex("7EXZ")).toBe(false);
  });

  it("should correctly extract specific byte boundaries", () => {
    const hex = "AABBCCDD";
    expect(HexParser.extractBytes(hex, 1, 2)).toBe("BBCC"); // Start byte 1, length 2 bytes
  });

  it("should throw when extracting out of bounds", () => {
    const hex = "AABB";
    expect(() => HexParser.extractBytes(hex, 1, 5)).toThrow(
      "Out of bounds HEX extraction",
    );
  });
});
