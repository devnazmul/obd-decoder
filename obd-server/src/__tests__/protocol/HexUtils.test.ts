import { HexUtils } from '../../protocol/HexUtils';

describe('HexUtils', () => {
    // ─── createUniversalReply ──────────────────────────────────────────────────
    describe('createUniversalReply', () => {
        it('should return a Buffer', () => {
            const result = HexUtils.createUniversalReply('001234567890', '0001', '0002');
            expect(Buffer.isBuffer(result)).toBe(true);
        });

        it('should start and end with 0x7E byte', () => {
            const result = HexUtils.createUniversalReply('001234567890', '0001', '0002');
            expect(result[0]).toBe(0x7e);
            expect(result[result.length - 1]).toBe(0x7e);
        });

        it('should pad a short phone number to 12 characters', () => {
            // phone "123" should become "000000000123" in the payload
            const result = HexUtils.createUniversalReply('123', '0001', '0002');
            const hexStr = result.toString('hex').toUpperCase();
            expect(hexStr).toContain('000000000123');
        });

        it('should produce a correct checksum that makes the buffer self-consistent', () => {
            const result = HexUtils.createUniversalReply('001234567890', '0001', '0200');
            // Strip the surrounding 7E bytes (first and last byte)
            const innerHex = result.slice(1, result.length - 1).toString('hex').toUpperCase();
            // The payload is everything except the last 2 chars (checksum)
            const payload = innerHex.slice(0, -2);
            const embeddedChecksum = innerHex.slice(-2);

            let expected = 0;
            for (let i = 0; i < payload.length; i += 2) {
                expected ^= parseInt(payload.substring(i, i + 2), 16);
            }
            expect(parseInt(embeddedChecksum, 16)).toBe(expected);
        });

        it('should use the default result "00" when not specified', () => {
            const result = HexUtils.createUniversalReply('001234567890', '0001', '0002');
            const hexStr = result.toString('hex').toUpperCase();
            // The last data byte before checksum+7E should be "00"
            expect(hexStr).toContain('00');
        });

        it('should accept a custom result byte', () => {
            const result = HexUtils.createUniversalReply('001234567890', '0001', '0002', '01');
            const hexStr = result.toString('hex').toUpperCase();
            expect(hexStr).toContain('01');
        });
    });

    // ─── createRegistrationReply ──────────────────────────────────────────────
    describe('createRegistrationReply', () => {
        it('should return a Buffer', () => {
            const result = HexUtils.createRegistrationReply('001234567890', '0001');
            expect(Buffer.isBuffer(result)).toBe(true);
        });

        it('should start and end with 0x7E byte', () => {
            const result = HexUtils.createRegistrationReply('001234567890', '0001');
            expect(result[0]).toBe(0x7e);
            expect(result[result.length - 1]).toBe(0x7e);
        });

        it('should contain auth code "1111" (ASCII encoded as 31313131 hex)', () => {
            const result = HexUtils.createRegistrationReply('001234567890', '0001');
            const hexStr = result.toString('hex').toUpperCase();
            expect(hexStr).toContain('31313131');
        });

        it('should pad a short phone number to 12 characters', () => {
            const result = HexUtils.createRegistrationReply('99', '0001');
            const hexStr = result.toString('hex').toUpperCase();
            expect(hexStr).toContain('000000000099');
        });

        it('should produce a correct checksum', () => {
            const result = HexUtils.createRegistrationReply('001234567890', '0001');
            const innerHex = result.slice(1, result.length - 1).toString('hex').toUpperCase();
            const payload = innerHex.slice(0, -2);
            const embeddedChecksum = innerHex.slice(-2);

            let expected = 0;
            for (let i = 0; i < payload.length; i += 2) {
                expected ^= parseInt(payload.substring(i, i + 2), 16);
            }
            expect(parseInt(embeddedChecksum, 16)).toBe(expected);
        });
    });
});
