import { ParsedObdData } from '../types';

export class ObdParser {
    public static parseHeader(hexStr: string) {
        const cleanHex = hexStr.startsWith("7E") && hexStr.endsWith("7E") ? hexStr.substring(2, hexStr.length - 2) : hexStr;
        return {
            msgId: cleanHex.substring(0, 4),
            attributes: cleanHex.substring(4, 8),
            deviceId: cleanHex.substring(8, 20),
            seqNumber: cleanHex.substring(20, 24),
            body: cleanHex.substring(24, cleanHex.length - 2),
            raw: hexStr,
        };
    }

    public static parse0200WithObd(bodyHex: string) {
        const baseData = this.parseBaseLocation(bodyHex);
        const additionalHex = bodyHex.substring(baseData.obdStartOffset);
        const obdData = this.parseAppendedBlocks(additionalHex);

        return { ...baseData, obd: obdData };
    }

    public static parseBcdTime(bcd: string): string {
        if (!bcd || bcd === '000000000000' || bcd.length !== 12) return "";
        const year = `20${bcd.substring(0, 2)}`;
        const month = bcd.substring(2, 4);
        const day = bcd.substring(4, 6);
        const hour = bcd.substring(6, 8);
        const min = bcd.substring(8, 10);
        const sec = bcd.substring(10, 12);
        return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
    }

    private static parseBaseLocation(hex: string) {
        // Find the BCD Timestamp (e.g., 260325... for Year 2026, Month 03, Day 25)
        // This is a bulletproof way to align the parser because the time format is strictly fixed.
        const timeMatch = hex.match(/(260[1-9][0-3][0-9][0-2][0-9][0-5][0-9][0-5][0-9])/);
        const timeBcd = timeMatch ? timeMatch[1] : "";
        const timeIndex = timeMatch ? timeMatch.index! : 36;

        // Count BACKWARDS from the timestamp to get perfect GPS alignment
        const dirHex = hex.substring(timeIndex - 4, timeIndex);
        const speedHex = hex.substring(timeIndex - 8, timeIndex - 4);
        const altHex = hex.substring(timeIndex - 12, timeIndex - 8);
        const lonHex = hex.substring(timeIndex - 20, timeIndex - 12);
        const latHex = hex.substring(timeIndex - 28, timeIndex - 20);

        const lat = parseInt(latHex, 16) / 1000000;
        const lon = parseInt(lonHex, 16) / 1000000;
        const speedKmH = parseInt(speedHex, 16) / 10;
        const direction = parseInt(dirHex, 16);
        const deviceTime = this.parseBcdTime(timeBcd);

        // Mark where the OBD TLV blocks start (immediately after the timestamp)
        const obdStartOffset = timeIndex + 12;

        return { lat, lon, speedKmH, direction, deviceTime, obdStartOffset };
    }

    private static parseAppendedBlocks(hex: string): ParsedObdData {
        let pointer = 0;
        const obd: ParsedObdData = { rawPids: {} };

        while (pointer < hex.length - 4) {
            const blockId = hex.substring(pointer, pointer + 2);
            const lengthHex = hex.substring(pointer + 2, pointer + 4);
            const length = parseInt(lengthHex, 16) * 2;
            const dataHex = hex.substring(pointer + 4, pointer + 4 + length);

            try {
                if (blockId === "01" && dataHex) {
                    const mil = parseInt(dataHex, 16) / 10;
                    if (!isNaN(mil)) obd.totalMileage = mil;
                } else if (blockId === "F3") {
                    obd.rawPids = this.parseInnerObdPids(dataHex);
                }
            } catch (e) {}
            pointer += 4 + length;
        }
        return obd;
    }

    private static parseInnerObdPids(f3Hex: string): Record<string, number> {
        let p = 0;
        const rawPids: Record<string, number> = {};
        while (p < f3Hex.length - 6) {
            const pid = f3Hex.substring(p, p + 4);
            const lenHex = f3Hex.substring(p + 4, p + 6);
            const len = parseInt(lenHex, 16) * 2;
            const valHex = f3Hex.substring(p + 6, p + 6 + len);
            if (valHex.length === len) rawPids[pid] = parseInt(valHex, 16);
            p += 6 + len;
        }
        return rawPids;
    }
}
