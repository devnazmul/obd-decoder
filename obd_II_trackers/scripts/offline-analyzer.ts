import * as fs from "fs";
import * as path from "path";
import { ObdParser, LocationData, PassthroughData } from "../src/protocol";

/**
 * Offline Log Analyzer
 *
 * Reads historical device log files, decodes the raw telemetry hex payloads,
 * verifies parser accuracy, and outputs human-readable results.
 *
 * Usage:
 *   npx ts-node scripts/offline-analyzer.ts <path-to-logfile>
 */
async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage: npx ts-node scripts/offline-analyzer.ts <path-to-logfile>",
    );
    process.exit(1);
  }

  const logFilePath = path.resolve(args[0]);
  if (!fs.existsSync(logFilePath)) {
    console.error(`Error: Log file not found at ${logFilePath}`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`🚀 Starting Offline OBD-II Log Analysis: ${logFilePath}`);
  console.log(`======================================================\n`);

  const content = await fs.promises.readFile(logFilePath, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);

  let locationCount = 0;
  let dtcCount = 0;
  let successCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract timestamp from the beginning of the line
    const logTimeMatch = line.match(/^([\d:\.]+)/);
    const logTime = logTimeMatch ? logTimeMatch[1] : `Line ${i + 1}`;

    // Look for Client data sent by the Device (#C or #C_Start_ markers)
    const clientMatch = line.match(/(?:#C|#C_Start_.*):(.*7E)/);

    if (clientMatch && clientMatch[1]) {
      try {
        const rawPayload = clientMatch[1].trim();
        const parsed = ObdParser.parse(rawPayload);

        if (parsed.type === "UNKNOWN") {
          console.log(`[${logTime}] ❓ UNKNOWN MSG | ID: ${parsed.messageId}`);
          continue;
        }

        successCount++;

        switch (parsed.type) {
          case "REGISTRATION":
            console.log(
              `[${logTime}] 📡 REGISTRATION | Device: ${parsed.deviceId}`,
            );
            break;
          case "AUTHENTICATION":
            console.log(
              `[${logTime}] 🔐 AUTHENTICATION | Device: ${parsed.deviceId}`,
            );
            break;
          case "HEARTBEAT":
            console.log(
              `[${logTime}] 💓 HEARTBEAT | Device: ${parsed.deviceId}`,
            );
            break;
          case "LOCATION":
            locationCount++;
            const loc = parsed.data as LocationData;
            console.log(
              `[${logTime}] 📍 LOCATION (${locationCount}) | Time: ${loc.timestamp} | Lat: ${loc.latitude.toFixed(6)}, Lon: ${loc.longitude.toFixed(6)} | Speed: ${loc.speed} km/h | Dir: ${loc.direction}°`,
            );
            break;
          case "PASSTHROUGH":
            const passthrough = parsed.data as PassthroughData;
            dtcCount++;

            let alertType = "EVENT";
            let displayValue = passthrough.rawPayload;

            if (passthrough.vin) {
              alertType = "🚘 VIN DETECTED";
              displayValue = passthrough.vin;
            } else if (
              passthrough.dtcCodes &&
              passthrough.dtcCodes.length > 0
            ) {
              alertType = "🚨 DTC DETECTED";
              displayValue = passthrough.dtcCodes.join(", ");
            }

            console.log(
              `[${logTime}] ${alertType} | Extracted: [ ${displayValue} ]`,
            );
            break;
          default:
            console.log(`[${logTime}] ❓ UNHANDLED MSG | Type: ${parsed.type}`);
        }
      } catch (err) {
        console.log(
          `[${logTime}] ❌ Parse Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  console.log(`\n======================================================`);
  console.log(`✅ Analysis Complete!`);
  console.log(`Total Lines Parsed: ${lines.length}`);
  console.log(`Total Location Reports: ${locationCount}`);
  console.log(`Total OBD Events/DTCs: ${dtcCount}`);
  console.log(`Success Rate        : ${successCount} / ${lines.length}`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error("[Offline Analyzer] Fatal error", err);
  process.exit(1);
});
