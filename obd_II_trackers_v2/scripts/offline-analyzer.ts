import fs from "fs";
import readline from "readline";
import { ObdParser } from "../src/protocol/ObdParser";

// Stateful Trip Tracker (To generate Image 2 data)
interface TripState {
  isActive: boolean;
  startTime: string;
  startMileage: number;
  maxSpeed: number;
  maxTemp: number;
  hardBrakes: number;
  hardAccels: number;
  idleSeconds: number;
  speedingSeconds: number;
}

async function analyzeLogFile(filePath: string) {
  console.log(`\n======================================================`);
  console.log(`🚀 Starting Advanced OBD-II Log Analysis: ${filePath}`);
  console.log(`======================================================\n`);

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let currentTrip: TripState = {
    isActive: false,
    startTime: "",
    startMileage: 0,
    maxSpeed: 0,
    maxTemp: 0,
    hardBrakes: 0,
    hardAccels: 0,
    idleSeconds: 0,
    speedingSeconds: 0,
  };

  let lastLocation = "";

  for await (const line of rl) {
    // Only process Client (#C) messages
    const clientMatch = line.match(/(?:#C|#C_Start_.*):(.*7E)/);
    if (!clientMatch) continue;

    const rawHex = clientMatch[1].trim();
    const header = ObdParser.parseHeader(rawHex);

    // Safely extract log time, ignoring [ ] brackets if they exist
    const logTimeMatch = line.match(/^\[?([\d:\.]+)\]?/);
    const logTime = logTimeMatch ? logTimeMatch[1] : `Log`;

    switch (header.msgId) {
      case "0200":
        // Use the NEW deep parser we created
        const data = ObdParser.parse0200WithObd(header.body);
        const locKey = `${data.lat},${data.lon}`;

        // --- PROCESS TRIP DATA (IMAGE 2 LOGIC) ---
        if (currentTrip.isActive) {
          if (data.speedKmH > currentTrip.maxSpeed) {
            currentTrip.maxSpeed = data.speedKmH;
          }

          // Note: Since we are using Raw PIDs now, we rely on the parser to extract raw data.
          // For idle calculation, we'll assume RPM is in PID "000C" if available.
          const rpmRaw = data.obd?.rawPids ? data.obd.rawPids["000C"] : 0;

          // Idle Calculation: Speed is 0, but Engine RPM is > 0
          if (data.speedKmH === 0 && rpmRaw && rpmRaw > 0) {
            currentTrip.idleSeconds += 10; // Assuming 10 sec log interval
          }
          if (data.speedKmH > 120) {
            // Assuming 120km/h is the limit
            currentTrip.speedingSeconds += 10;
          }
        }

        // --- PRINT IMAGE 1 DATA (OBD CONDITION) ---
        if (locKey !== lastLocation || currentTrip.isActive) {
          console.log(`\n[${data.deviceTime || logTime}] 🚗 VEHICLE DATA`); // <--- Uses real Date!
          console.log(
            `   ├─ Location: Lat ${data.lat}, Lon ${data.lon} | Speed: ${data.speedKmH} km/h`,
          );

          if (data.obd && data.obd.totalMileage !== undefined) {
            console.log(`   ├─ Total Mileage: ${data.obd.totalMileage} km`);
          }

          // Print the RAW Proprietary PIDs so we can map them correctly
          if (
            data.obd &&
            data.obd.rawPids &&
            Object.keys(data.obd.rawPids).length > 0
          ) {
            console.log(
              `   └─ Proprietary OBD Data (Raw Decimal):`,
              JSON.stringify(data.obd.rawPids),
            );
          } else {
            console.log(
              `   └─ (No proprietary OBD data attached to this packet)`,
            );
          }

          lastLocation = locKey;
        }
        break;

      case "0900":
        const bodyHex = header.body;
        const passthroughType = bodyHex.substring(0, 2);

        // J63S Passthrough format: F8 0008 [Length] [PID] [Data...]
        if (passthroughType === "F8") {
          const lengthHex = bodyHex.substring(6, 10);
          const lengthDec = parseInt(lengthHex, 16);

          if (lengthDec > 15) {
            const eventPid = bodyHex.substring(10, 12);

            // Extract the time from the event hex!
            const eventTimeBcd = bodyHex.substring(12, 24);
            const realEventTime =
              ObdParser.parseBcdTime(eventTimeBcd) || logTime;

            if (eventPid === "01") {
              // 行程开始 - TRIP START
              currentTrip.isActive = true;
              currentTrip.startTime = realEventTime;
              console.log(`\n[${realEventTime}] 🟢 DEVICE REPORTED TRIP START`);
            } else if (eventPid === "02") {
              // 行程结束 - TRIP END
              if (
                currentTrip.maxSpeed === 0 &&
                currentTrip.idleSeconds === 0 &&
                currentTrip.hardAccels === 0
              ) {
                console.log(
                  `\n[${realEventTime}] 👻 GHOST TRIP IGNORED (Device stationary, 0 km/h)`,
                );
              } else {
                console.log(`\n[${realEventTime}] 🛑 VALID TRIP ENDED`);
                console.log(`   ├─ Time for Start: ${currentTrip.startTime}`);
                console.log(`   ├─ Time for End: ${realEventTime}`);
                console.log(`   ├─ Max Speed: ${currentTrip.maxSpeed} KM/H`);
                console.log(
                  `   ├─ Idle Driving Time: ${currentTrip.idleSeconds} Seconds`,
                );
                console.log(
                  `   ├─ Speedover Seconds: ${currentTrip.speedingSeconds} Seconds`,
                );
                console.log(
                  `   ├─ Emergency Brake Times: ${currentTrip.hardBrakes} Count`,
                );
                console.log(
                  `   └─ Emergency Speedup Times: ${currentTrip.hardAccels} Count`,
                );
              }

              // Reset trip state
              currentTrip = {
                isActive: false,
                startTime: "",
                startMileage: 0,
                maxSpeed: 0,
                maxTemp: 0,
                hardBrakes: 0,
                hardAccels: 0,
                idleSeconds: 0,
                speedingSeconds: 0,
              };
            } else if (eventPid === "06") {
              currentTrip.hardAccels++;
              console.log(
                `[${realEventTime}] ⚠️ EVENT: Rapid Acceleration Detected`,
              );
            } else if (eventPid === "0E") {
              currentTrip.hardBrakes++;
              console.log(
                `[${realEventTime}] ⚠️ EVENT: Rapid Braking Detected`,
              );
            }
          } else {
            // It's a short payload like a DTC or VIN (from your original log)
            const payloadHex = bodyHex.substring(24);
            let asciiPayload = "";
            for (let i = 0; i < payloadHex.length; i += 2) {
              const charCode = parseInt(payloadHex.substring(i, i + 2), 16);
              if (charCode >= 32 && charCode <= 126)
                asciiPayload += String.fromCharCode(charCode);
            }

            if (asciiPayload.startsWith("P") || asciiPayload.startsWith("C")) {
              console.log(
                `\n[${logTime}] 🚨 DTC FAULT CODE EXTRACTED: ${asciiPayload}\n`,
              );
            }
          }
        }
        break;
    }
  }
  console.log(`\n======================================================`);
  console.log(`✅ Log Analysis Complete!`);
  console.log(`======================================================\n`);
}

// Execute
const logFilePath = process.argv[2] || "./device_logs.txt";
analyzeLogFile(logFilePath);
