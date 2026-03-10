import fs from "fs";
import readline from "readline";
import { ObdParser } from "../src/protocol/ObdParser";

async function analyzeLogFile(filePath: string) {
  console.log(`\n======================================================`);
  console.log(`🚀 Starting Offline OBD-II Log Analysis: ${filePath}`);
  console.log(`======================================================\n`);

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let locationCount = 0;
  let dtcCount = 0;

  for await (const line of rl) {
    lineCount++;

    // We only care about data sent by the Client (Device). Server acks (#S) are ignored.
    const clientMatch = line.match(/(?:#C|#C_Start_.*):(.*7E)/);

    if (clientMatch && clientMatch[1]) {
      const rawHex = clientMatch[1].trim();
      const header = ObdParser.parseHeader(rawHex);

      // Log time prefix if available in your txt file (e.g., 00:36:43.162)
      const logTimeMatch = line.match(/^([\d:\.]+)/);
      const logTime = logTimeMatch ? logTimeMatch[1] : `Line ${lineCount}`;

      switch (header.msgId) {
        case "0100":
          console.log(
            `[${logTime}] 📡 REGISTRATION | Device: ${header.deviceId}`,
          );
          break;
        case "0102":
          console.log(
            `[${logTime}] 🔐 AUTHENTICATION | Device: ${header.deviceId}`,
          );
          break;
        case "0002":
          console.log(`[${logTime}] 💓 HEARTBEAT | Device: ${header.deviceId}`);
          break;
        case "0200":
          const locData = ObdParser.parse0200(header.body);
          locationCount++;
          console.log(
            `[${logTime}] 📍 LOCATION (${locationCount}) | Time: ${locData.timestamp} | Lat: ${locData.lat}, Lon: ${locData.lon} | Speed: ${locData.speedKmH} km/h | Dir: ${locData.direction}°`,
          );
          break;
        case "0900":
          const passthroughData = ObdParser.parse0900(header.body);
          dtcCount++;

          // Highlight important ASCII decodes like DTCs or VINs
          let alertType = "EVENT";
          if (
            passthroughData.decodedAscii?.startsWith("P") ||
            passthroughData.decodedAscii?.startsWith("C")
          ) {
            alertType = "🚨 DTC DETECTED";
          } else if (passthroughData.decodedAscii?.length === 17) {
            alertType = "🚘 VIN DETECTED";
          }

          console.log(
            `[${logTime}] ${alertType} | ASCII Extracted: [ ${passthroughData.decodedAscii} ]`,
          );
          break;
        default:
          console.log(`[${logTime}] ❓ UNKNOWN MSG | ID: ${header.msgId}`);
      }
    }
  }

  console.log(`\n======================================================`);
  console.log(`✅ Analysis Complete!`);
  console.log(`Total Lines Parsed: ${lineCount}`);
  console.log(`Total Location Reports: ${locationCount}`);
  console.log(`Total OBD Events/DTCs: ${dtcCount}`);
  console.log(`======================================================\n`);
}

// Execute the analyzer against your log file
const logFilePath = process.argv[2] || "./device_logs.txt";
if (!fs.existsSync(logFilePath)) {
  console.error(`❌ Error: Log file not found at ${logFilePath}`);
  process.exit(1);
}

analyzeLogFile(logFilePath);
