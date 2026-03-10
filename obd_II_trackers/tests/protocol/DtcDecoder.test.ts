import { DtcDecoder } from "../../src/protocol/DtcDecoder";

describe("DtcDecoder", () => {
  describe("decodeSingle()", () => {
    it("decodes P (Powertrain) codes", () => {
      expect(DtcDecoder.decodeSingle("0380")).toBe("P0380");
      expect(DtcDecoder.decodeSingle("0123")).toBe("P0123");
    });

    it("decodes C (Chassis) codes", () => {
      expect(DtcDecoder.decodeSingle("4123")).toBe("C0123");
      expect(DtcDecoder.decodeSingle("5234")).toBe("C1234");
    });

    it("decodes B (Body) codes", () => {
      expect(DtcDecoder.decodeSingle("8123")).toBe("B0123");
    });

    it("decodes U (Network) codes", () => {
      expect(DtcDecoder.decodeSingle("C123")).toBe("U0123");
      expect(DtcDecoder.decodeSingle("D123")).toBe("U1123");
    });

    it("ignores 0000 padding", () => {
      expect(DtcDecoder.decodeSingle("0000")).toBeNull();
    });

    it("throws error for invalid length", () => {
      expect(() => DtcDecoder.decodeSingle("123")).toThrow(
        "Invalid DTC hex code",
      );
      expect(() => DtcDecoder.decodeSingle("12345")).toThrow(
        "Invalid DTC hex code",
      );
    });

    it("throws error for invalid hex characters", () => {
      expect(() => DtcDecoder.decodeSingle("XXYY")).toThrow();
    });
  });

  describe("decodeMultiple()", () => {
    it("decodes multiple and filters padding", () => {
      const codes = ["0380", "0000", "5234"];
      const result = DtcDecoder.decodeMultiple(codes);
      expect(result).toHaveLength(2);
      expect(result).toEqual(["P0380", "C1234"]);
    });
  });

  describe("decodeFromPayload()", () => {
    it("decodes raw payload strings chunked by 4 chars", () => {
      const payload = "038000005234";
      const result = DtcDecoder.decodeFromPayload(payload);
      expect(result).toHaveLength(2);
      expect(result).toEqual(["P0380", "C1234"]);
    });

    it("throws error if payload length is not multiple of 4", () => {
      expect(() => DtcDecoder.decodeFromPayload("123456")).toThrow(
        "multiple of 4",
      );
    });
  });
});
