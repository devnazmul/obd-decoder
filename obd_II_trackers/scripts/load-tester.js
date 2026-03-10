const { io } = require('socket.io-client');

const URL = 'http://localhost:3000';
const TOTAL_DEVICES = 10000;
const BATCH_SIZE = 50; // Connect in batches to avoid overwhelming the OS port limits
const BATCH_DELAY_MS = 200; // Delay between batches
const ACTIVE_SOCKETS = [];

console.log(`[Load Test] Preparing to simulate ${TOTAL_DEVICES} devices...`);

let connectedCount = 0;
let registeredCount = 0;
let telemetrySentCount = 0;
let errorsCount = 0;

// Helper to generate a 12 digit zero-padded string from an index
const generateDeviceId = (index) => {
  return index.toString().padStart(12, '0');
};

const connectDevice = (index) => {
  return new Promise((resolve) => {
    const deviceId = generateDeviceId(index);
    const socket = io(URL, { transports: ['websocket'], reconnection: false });

    ACTIVE_SOCKETS.push(socket);

    socket.on('connect', () => {
      connectedCount++;

      // Step 1: Register
      socket.emit('register', { deviceId }, (regResponse) => {
        if (regResponse?.status === 'registered') {
          registeredCount++;

          // Step 2: Send Telemetry
          const msgId = '0200';
          const attr = '001C';
          const phone = deviceId; // Unique per device
          const seqNum = '0001';
          const alarmFlags = '00000000';
          const statusFlags = '00000000';

          // Slightly offset GPS per device to simulate different locations
          const latFloat = 34.123456 + (index * 0.0001);
          const lonFloat = 118.123456 + (index * 0.0001);
          const lat = Math.floor(latFloat * 1e6).toString(16).padStart(8, '0');
          const lon = Math.floor(lonFloat * 1e6).toString(16).padStart(8, '0');

          const alt = '0000';
          const speed = '0258';
          const dir = '0000';
          const time = '260309133000';

          const hexPayload = msgId + attr + phone + seqNum + alarmFlags + statusFlags + lat + lon + alt + speed + dir + time;

          socket.emit('telemetry', hexPayload, (telResponse) => {
            if (telResponse?.status === 'ok') {
              telemetrySentCount++;
            } else {
              errorsCount++;
            }
            resolve();
          });
        } else {
          errorsCount++;
          resolve();
        }
      });
    });

    socket.on('connect_error', () => {
      errorsCount++;
      resolve();
    });

    // Safety timeout in case server doesn't ack
    setTimeout(() => resolve(), 5000);
  });
};

const runBatch = async (startIndex) => {
  const promises = [];
  const endIndex = Math.min(startIndex + BATCH_SIZE, TOTAL_DEVICES);

  for (let i = startIndex; i < endIndex; i++) {
    promises.push(connectDevice(i));
  }

  await Promise.all(promises);
  console.log(`[Load Test] Batch finished. Progress: ${endIndex}/${TOTAL_DEVICES} devices deployed...`);

  if (endIndex < TOTAL_DEVICES) {
    setTimeout(() => runBatch(endIndex), BATCH_DELAY_MS);
  } else {
    finishTest();
  }
};

const finishTest = () => {
  console.log(`\n===========================================`);
  console.log(`[Load Test] 🏁 SIMULATION COMPLETE`);
  console.log(`===========================================`);
  console.log(`Total Target    : ${TOTAL_DEVICES}`);
  console.log(`Connected       : ${connectedCount}`);
  console.log(`Registered      : ${registeredCount}`);
  console.log(`Telemetry Sent  : ${telemetrySentCount}`);
  console.log(`Errors / Drops  : ${errorsCount}`);
  console.log(`===========================================\n`);

  console.log(`Checking live server state via HTTP...`);
  const http = require('http');
  http.get('http://localhost:3000/api/health', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`Server Health Response: \n`, JSON.parse(data));
      console.log(`\nCleaning up connections...`);

      // Cleanup sockets
      ACTIVE_SOCKETS.forEach(s => s.disconnect());

      setTimeout(() => {
        console.log(`Done.`);
        process.exit(0);
      }, 1000);
    });
  }).on('error', (e) => {
    console.log(`Error checking server health: ${e.message}`);
    process.exit(1);
  });
};

// Start the simulation
console.log(`[Load Test] Starting simulation loop...`);
const startTime = Date.now();
runBatch(0);
