export class HexUtils {
    /**
     * Calculates the JT808 XOR Checksum (BCC)
     * It XORs every byte in the hex string sequentially.
     */
    private static calculateChecksum(hexStr: string): string {
        let checksum = 0;
        for (let i = 0; i < hexStr.length; i += 2) {
            checksum ^= parseInt(hexStr.substring(i, i + 2), 16);
        }
        // Return as a 2-character uppercase hex string (e.g., "0A", "C7")
        return checksum.toString(16).padStart(2, '0').toUpperCase();
    }

    /**
     * Creates a Platform Universal Reply (0x8001)
     */
    public static createUniversalReply(phoneNum: string, seqNumber: string, responseToMsgId: string, result: string = "00"): Buffer {
        // Ensure phone number is exactly 12 chars (6 bytes BCD)
        const paddedPhone = phoneNum.padStart(12, '0');
        
        // Build payload without 7E flags and without checksum
        const payload = `80010005${paddedPhone}0000${seqNumber}${responseToMsgId}${result}`;
        
        // Calculate the dynamic XOR checksum
        const checkSum = this.calculateChecksum(payload); 
        
        // Wrap in 7E flags
        return Buffer.from(`7E${payload}${checkSum}7E`, 'hex');
    }

    /**
     * Creates a Registration Reply (0x8100)
     */
    public static createRegistrationReply(phoneNum: string, seqNumber: string): Buffer {
        const paddedPhone = phoneNum.padStart(12, '0');
        
        // Result 00 (Success), AuthCode "31313131" (ASCII for "1111")
        const payload = `81000007${paddedPhone}0000${seqNumber}0031313131`;
        
        // Calculate the dynamic XOR checksum
        const checkSum = this.calculateChecksum(payload);
        
        return Buffer.from(`7E${payload}${checkSum}7E`, 'hex');
    }
}
