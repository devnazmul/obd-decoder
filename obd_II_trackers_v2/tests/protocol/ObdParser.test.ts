import { ObdParser } from "../../src/protocol/ObdParser";

describe("ObdParser", () => {
  describe("parseHeader", () => {
    it("should parse JT808 registration message header (0100)", () => {
      const hex =
        "7E0100002D069252500651000800010001534B455254473532424100000000000000000000000000000032353030363531003132333435363738C07E";
      const header = ObdParser.parseHeader(hex);

      expect(header.msgId).toBe("0100");
      expect(header.deviceId).toBe("069252500651");
      expect(header.seqNumber).toBe("0008");
      expect(header.body).toBeDefined();
    });

    it("should parse JT808 location message header (0200)", () => {
      const hex =
        "7E020000E00692525006510001000000000000000003129740000138B20000000000942603060504590104000032D302020000030200002504000000002A0200002B040000000030010D310100E3060000059C01A7F39600020200000003020000000402381D000504000032D300060200000007020000000801000009020000000B020000000C020000000D020000000E0100000F01000052040000009C0100020000010104000032D30102020000010304000000000104020000010C020017010D020000010E020000010F02008F011002028C01110200000112020000011302000001140200000116020000007E";
      const header = ObdParser.parseHeader(hex);

      expect(header.msgId).toBe("0200");
      expect(header.deviceId).toBe("069252500651");
    });
  });

  describe("parse0200", () => {
    it("should parse real location from logs", () => {
      // Line 9 in device_logs.txt body
      const body = "00000000000C000103129740000138B2000000000094260307003623";
      const locData: any = ObdParser.parse0200(body);

      // 03129740 (hex) = 51550016. 51550016 / 1000000 = 51.550016
      // 000138B2 (hex) = 80050. 80050 / 1000000 = 0.08005
      // 260307003623 (BCD) = 2026-03-07 00:36:23

      expect(locData.lat).toBe(51.550016);
      expect(locData.lon).toBe(0.08005);
      expect(locData.timestamp).toBe("2026-03-07 00:36:23");
    });
  });

  describe("parse0900", () => {
    it("should detect DTCs from passthrough data", () => {
      // Line 35: F8 0008 000C 20260307003950 5030333830
      // 5030333830 -> "P0380"
      const body = "F80008000C202603070039505030333830";
      const passthrough: any = ObdParser.parse0900(body);

      expect(passthrough.type).toBe("OBD_Passthrough");
      expect(passthrough.decodedAscii).toBe("P0380");
    });

    it("should detect VIN from passthrough data", () => {
      // Line 37: F8 0008 0018 21260307003952 564631464C303030353635363436323630
      const body = "F80008001821260307003952564631464C303030353635363436323630";
      const passthrough: any = ObdParser.parse0900(body);

      expect(passthrough.type).toBe("OBD_Passthrough");
      expect(passthrough.decodedAscii).toBe("VF1FL000565646260");
    });
  });

  describe("ObdParser Deep Extraction", () => {
    it("should correctly parse OBD PIDs from an F3 block", () => {
      // Hex breakdown:
      // 000C (PID 12 / RPM), Len 02, Data 0C50 (3152 dec -> 788 RPM)
      // 0005 (PID 05 / Temp), Len 01, Data 52 (82 dec -> 42 C)
      const mockF3Block = "000C020C5000050152";

      // Use any to test private method (or make it public for testing)
      const result = (ObdParser as any).parseInnerObdPids(mockF3Block);

      expect(result.rpm).toBe(788);
      expect(result.coolantTemp).toBe(42);
    });

    it("should calculate Throttle Position accurately", () => {
      // 0011 (PID 17 / Throttle), Len 01, Data FF (255 dec -> 100% or 255% depending on ECU)
      const mockF3Block = "001101FF";
      const result = (ObdParser as any).parseInnerObdPids(mockF3Block);
      expect(result.throttlePos).toBe(100);
    });
  });
});
