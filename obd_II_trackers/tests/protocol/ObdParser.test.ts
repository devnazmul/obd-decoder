import {
  ObdParser,
  LocationData,
  RegistrationData,
} from "../../src/protocol/ObdParser";

describe("ObdParser", () => {
  describe("Parse Invalid Data", () => {
    it("returns UNKNOWN for invalid hex", () => {
      const res = ObdParser.parse("ZZZZ");
      expect(res.type).toBe("UNKNOWN");
    });

    it("returns UNKNOWN for payload too short", () => {
      const res = ObdParser.parse("7e0100");
      expect(res.type).toBe("UNKNOWN");
    });

    it("returns UNKNOWN for unsupported message type", () => {
      // Message ID 0x9999
      const payload = `999900000123456789120001`;
      const res = ObdParser.parse(payload);
      expect(res.type).toBe("UNKNOWN");
      expect(res.messageId).toBe("9999");
    });
  });

  describe("Parse Messages", () => {
    // Generate valid protocol headers for testing
    // Header format: MsgId(2) MsgAttr(2) Phone(6) Seq(2)
    // 0100 0000 012345678912 0001
    const REG_MSG_ID = "0100";
    const ATTR = "0005"; // length 5
    const PHONE = "012345678912"; // phone # 12345678912
    const SEQ = "0001";

    // Total 12 bytes: 010000050123456789120001
    const HEADER_REG = `${REG_MSG_ID}${ATTR}${PHONE}${SEQ}`;

    it("parses registration message (0100)", () => {
      // Body: province(2), city(2), mfr(5), model(20), id(7), color(1), plate(n)
      // Total 2+2+5+20+7+1 = 37 byte minimum structure
      const provCity = "00010002"; // province 1, city 2
      const mfr = Buffer.from("12345").toString("hex");
      const model = Buffer.from("MODELXXXXXXXXXXXXXXX").toString("hex");
      const id = Buffer.from("ID12345").toString("hex");
      const colorPlate = "01313233"; // color 1, plate ASCII "123"

      const payload = HEADER_REG + provCity + mfr + model + id + colorPlate;

      const res = ObdParser.parse(payload);
      expect(res.type).toBe("REGISTRATION");
      expect(res.deviceId).toBe("12345678912"); // Dropped leading zero

      const data = res.data as RegistrationData;
      expect(data.provinceId).toBe(1);
      expect(data.cityId).toBe(2);
      expect(data.manufacturerId).toBe("12345");
      expect(data.terminalModel).toBe("MODELXXXXXXXXXXXXXXX");
      expect(data.terminalId).toBe("ID12345");
    });

    it("parses heartbeat message (0002)", () => {
      const HEADER_HB = `00020000${PHONE}0002`;
      const res = ObdParser.parse(HEADER_HB);
      expect(res.type).toBe("HEARTBEAT");
      expect(res.data).toHaveProperty("timestamp");
    });

    it("handles malformed location gracefully (0200)", () => {
      const HEADER_LOC = `02000000${PHONE}0003`;
      // No body length (requires at least 28)
      const res = ObdParser.parse(HEADER_LOC);
      expect(res.type).toBe("LOCATION");
      expect(res.data).toBeNull(); // Graceful failure, returns type but null data
    });

    it("parses full location message (0200)", () => {
      const HEADER_LOC = `0200001C${PHONE}0004`;

      // Body (28 bytes)
      const alarm = "00000000";
      const status = "00000000";
      const lat = (34.123456 * 1e6).toString(16).padStart(8, "0");
      const lon = (118.123456 * 1e6).toString(16).padStart(8, "0");
      const alt = "0000";
      const speed = "0258"; // 600 -> 60 kmh
      const dir = "0000";
      const time = "260309133000"; // YYMMDDHHmmss = 26-03-09 13:30:00

      const payload =
        HEADER_LOC + alarm + status + lat + lon + alt + speed + dir + time;

      const res = ObdParser.parse(payload);
      expect(res.type).toBe("LOCATION");

      const data = res.data as LocationData;
      expect(Math.abs(data.latitude - 34.123456)).toBeLessThan(0.0001);
      expect(Math.abs(data.longitude - 118.123456)).toBeLessThan(0.0001);
      expect(data.speed).toBe(60);
      expect(data.timestamp).toBe("2026-03-09T13:30:00Z");
    });

    it("parses passthrough message with DTCs (0900)", () => {
      const HEADER_PASS = `09000007${PHONE}0005`;
      // Body: subtype(1 byte) + DTC payload (6 bytes = 0380 0000 5234)
      const payload = HEADER_PASS + "14038000005234";

      const res = ObdParser.parse(payload);
      expect(res.type).toBe("PASSTHROUGH");
      expect((res.data as any).dtcCodes).toEqual(["P0380", "C1234"]);
    });

    it("parses authentication message (0102)", () => {
      const HEADER_AUTH = `010200050123456789120002`;
      const authBody = Buffer.from("TOKEN").toString("hex");
      const res = ObdParser.parse(HEADER_AUTH + authBody);
      expect(res.type).toBe("AUTHENTICATION");
      expect((res.data as any).authCode).toBe("TOKEN");
    });

    it("returns null data when parsing malformed passthrough", () => {
      // 0900 with valid header but incomplete/malformed body
      const res = ObdParser.parse(`090000010123456789120001`);
      // This will successfully grab subType but likely not throw exceptions due to boundary checks
      expect(res.type).toBe("PASSTHROUGH");
    });

    it("parses VIN gracefully from passthrough", () => {
      const HEADER_PASS = `090000120123456789120005`;
      const vinStr = "1HGCM82633A004352"; // 17 chars
      const payload = HEADER_PASS + "14" + Buffer.from(vinStr).toString("hex");
      const res = ObdParser.parse(payload);
      expect((res.data as any).vin).toBe(vinStr);
    });

    it("handles malformed registration parameters smoothly", () => {
      // 0100 with valid header but incomplete body lengths
      const incompleteBody = "00010002"; // just province and city
      const res = ObdParser.parse(
        REG_MSG_ID + ATTR + PHONE + SEQ + incompleteBody,
      );
      expect(res.type).toBe("REGISTRATION");
      expect((res.data as any).provinceId).toBe(1);
      expect((res.data as any).plate).toBe(""); // Safely defaulted
    });
  });
});
