import { DtcDecoder } from "../../src/protocol/DtcDecoder";

describe("DtcDecoder", () => {
  it("should correctly decode a standard Powertrain P-Code (P0380)", () => {
    // Hex 0380 -> 0000 0011 1000 0000 -> P0380
    const result = DtcDecoder.decode("0380");
    expect(result.code).toBe("P0380");
    expect(result.type).toBe("Powertrain");
  });

  it("should correctly decode a Chassis C-Code (C1234)", () => {
    // Hex 5234 -> 0101 0010 0011 0100 -> C1234
    const result = DtcDecoder.decode("5234");
    expect(result.code).toBe("C1234");
    expect(result.type).toBe("Chassis");
  });

  it("should throw an error on invalid lengths", () => {
    expect(() => DtcDecoder.decode("038")).toThrow(
      "DTC HEX must be exactly 2 bytes",
    );
    expect(() => DtcDecoder.decode("03801")).toThrow(
      "DTC HEX must be exactly 2 bytes",
    );
  });

  it("should decode multiple codes successfully ignoring 0000 padding", () => {
    const payload = "038052340000"; // P0380, C1234, padding
    const dtcs = DtcDecoder.parseMultiple(payload);
    expect(dtcs).toHaveLength(2);
    expect(dtcs[0].code).toBe("P0380");
    expect(dtcs[1].code).toBe("C1234");
  });
});
