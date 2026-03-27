import { ObdParser } from '../../protocol/ObdParser';

describe('ObdParser', () => {
    // ─── parseHeader ──────────────────────────────────────────────────────────
    describe('parseHeader', () => {
        // A minimal hex message: 7E + msgId(4) + attr(4) + deviceId(12) + seq(4) + body + CS(2) + 7E
        const sampleMsg = '7E0200002001234567890100010203040506070809101112137E';

        it('should correctly extract msgId', () => {
            const h = ObdParser.parseHeader(sampleMsg);
            expect(h.msgId).toBe('0200');
        });

        it('should correctly extract attributes', () => {
            const h = ObdParser.parseHeader(sampleMsg);
            expect(h.attributes).toBe('0020');
        });

        it('should correctly extract deviceId (12 hex chars = 6 bytes BCD)', () => {
            const h = ObdParser.parseHeader(sampleMsg);
            expect(h.deviceId).toBe('012345678901');
        });

        it('should correctly extract seqNumber', () => {
            const h = ObdParser.parseHeader(sampleMsg);
            expect(h.seqNumber).toBe('0001');
        });

        it('should strip 7E wrappers before parsing', () => {
            // Without 7E wrapper should give same result
            const noWrapper = sampleMsg.slice(2, sampleMsg.length - 2);
            const h = ObdParser.parseHeader(noWrapper);
            expect(h.msgId).toBe('0200');
        });

        it('should preserve the raw hex in the result', () => {
            const h = ObdParser.parseHeader(sampleMsg);
            expect(h.raw).toBe(sampleMsg);
        });
    });

    // ─── parseBcdTime ─────────────────────────────────────────────────────────
    describe('parseBcdTime', () => {
        it('should parse a valid BCD time string', () => {
            // YY MM DD HH mm SS → "260325" = 2026-03-25 at 14:30:00
            expect(ObdParser.parseBcdTime('260325143000')).toBe('2026-03-25 14:30:00');
        });

        it('should return empty string for all-zero BCD', () => {
            expect(ObdParser.parseBcdTime('000000000000')).toBe('');
        });

        it('should return empty string for undefined/null-like input', () => {
            expect(ObdParser.parseBcdTime('')).toBe('');
        });

        it('should return empty string for a BCD string with incorrect length', () => {
            expect(ObdParser.parseBcdTime('26032514')).toBe(''); // too short
        });

        it('should prepend "20" to the year part', () => {
            const result = ObdParser.parseBcdTime('260101000000');
            expect(result.startsWith('2026')).toBe(true);
        });
    });

    // ─── parse0200WithObd ─────────────────────────────────────────────────────
    describe('parse0200WithObd', () => {
        /**
         * Build a synthetic 0200 body hex.
         * Layout (counting from offset 0):
         * - Alarm/Status flags: 8 bytes (4 each) — we fill with zeros
         * - Latitude: 4 bytes  (28 degrees = 0x01B00000 / 1e6 → 28.311552)
         * - Longitude: 4 bytes (39 degrees = 0x02535200 / 1e6 → 39.000064? let's use raw)
         * - Speed: 2 bytes 10ths of km/h (0x00C8 = 200 → 20.0 km/h)
         * - Direction: 2 bytes (0x0059 = 89 degrees)
         * - Timestamp BCD 6 bytes: 260325143000
         *
         * timeIndex detected by regex 260325...
         * latHex = timeIndex-28 to timeIndex-20
         * lonHex = timeIndex-20 to timeIndex-12
         * altHex = timeIndex-12 to timeIndex-8
         * speedHex = timeIndex-8 to timeIndex-4
         * dirHex = timeIndex-4 to timeIndex
         *
         * We put the timestamp at index 36 (character position) which is the default.
         * That means we need 36 chars before timestamp:
         *   alarm(8) status(8) lat(8) lon(8) alt(4) speed(4) dir(4) = 44 chars → use 44
         * Let's keep it simple and let timeIndex be 44.
         */
        const LAT_RAW = 28000000; // 28.0 degrees
        const LON_RAW = 39000000; // 39.0 degrees
        const SPEED_RAW = 200;    // 20.0 km/h
        const DIR_RAW = 90;

        function toHex(n: number, bytes: number) {
            return n.toString(16).padStart(bytes * 2, '0').toUpperCase();
        }

        // 4 bytes padding before all real GPS data
        const body =
            '00000000' +                        // alarm flags (4 bytes)
            '00000000' +                        // status flags (4 bytes)
            toHex(LAT_RAW, 4) +                 // lat
            toHex(LON_RAW, 4) +                 // lon
            toHex(0, 2) +                       // alt (0)
            toHex(SPEED_RAW, 2) +               // speed
            toHex(DIR_RAW, 2) +                 // direction
            '260325143000' +                    // BCD time
            // No OBD appended blocks → empty
            'FF';                               // checksum placeholder (won't be parsed)

        it('should extract correct latitude', () => {
            const result = ObdParser.parse0200WithObd(body);
            expect(result.lat).toBeCloseTo(28.0, 3);
        });

        it('should extract correct longitude', () => {
            const result = ObdParser.parse0200WithObd(body);
            expect(result.lon).toBeCloseTo(39.0, 3);
        });

        it('should extract correct speed in km/h', () => {
            const result = ObdParser.parse0200WithObd(body);
            expect(result.speedKmH).toBeCloseTo(20.0, 1);
        });

        it('should extract correct direction', () => {
            const result = ObdParser.parse0200WithObd(body);
            expect(result.direction).toBe(90);
        });

        it('should extract correct device time', () => {
            const result = ObdParser.parse0200WithObd(body);
            expect(result.deviceTime).toBe('2026-03-25 14:30:00');
        });

        it('should return an obd object even when no OBD blocks are present', () => {
            const result = ObdParser.parse0200WithObd(body);
            expect(result.obd).toBeDefined();
            expect(result.obd.rawPids).toBeDefined();
        });
    });

    // ─── parseAppendedBlocks via parse0200WithObd ─────────────────────────────
    describe('OBD block parsing (via parse0200WithObd)', () => {
        function toHex(n: number, bytes: number) {
            return n.toString(16).padStart(bytes * 2, '0').toUpperCase();
        }

        // Build a body with a block ID 01 (totalMileage) → value 5000 * 10 = 50000 raw → 5000.0 km
        const mileageRaw = 50000; // 50000 / 10 = 5000.0 km
        const block01 = '01' + '04' + toHex(mileageRaw, 4); // id + 4-byte length + value

        const gpsPrefix =
            '00000000' +
            '00000000' +
            toHex(28000000, 4) +
            toHex(39000000, 4) +
            toHex(0, 2) +
            toHex(200, 2) +
            toHex(90, 2) +
            '260325143000'; // BCD time

        it('should parse block 01 and return totalMileage', () => {
            const body = gpsPrefix + block01 + 'FF';
            const result = ObdParser.parse0200WithObd(body);
            expect(result.obd.totalMileage).toBeCloseTo(5000.0, 1);
        });

        it('should parse F3 block and populate rawPids', () => {
            // F3 block with one inner PID: pid=0003, len=02, value=0BB8 (3000 RPM)
            const innerPid = '0003' + '02' + '0BB8';
            const f3Block = 'F3' + toHex(innerPid.length / 2, 1) + innerPid;
            const body = gpsPrefix + f3Block + 'FF';
            const result = ObdParser.parse0200WithObd(body);
            expect(result.obd.rawPids?.['0003']).toBe(0x0BB8); // 3000
        });
    });
});
