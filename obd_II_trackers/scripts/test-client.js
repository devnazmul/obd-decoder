const { io } = require('socket.io-client');

// Connect to the local OBD-II Telemetry Server
const URL = 'http://localhost:3000';
console.log(`[Test Client] Connecting to ${URL}...`);

const socket = io(URL, {
  transports: ['websocket'],
});

const DEVICE_PHONE = '012345678912';

socket.on('connect', () => {
  console.log(`[Test Client] Connected! Socket ID: ${socket.id}`);

  // 1. Explicitly register the device
  console.log(`[Test Client] Sending registration for device: ${DEVICE_PHONE}`);
  socket.emit('register', { deviceId: DEVICE_PHONE }, (response) => {
    console.log(`[Test Client] Registration Ack:`, response);

    // 2. Send a valid GPS Location telemetry payload
    // Header (0200): MsgId(2) + Attr(2) + Phone(6) + SeqNum(2) = 12 bytes
    // Body (28 bytes): Alarm(4) + Status(4) + Lat(4) + Lon(4) + Alt(2) + Speed(2) + Dir(2) + Time(6)

    const msgId = '0200';
    const attr = '001C'; // length = 28 bytes
    const phone = '012345678912'; // 12-digit phone matching BCD encoding
    const seqNum = '0001';

    const alarmFlags = '00000000'; // 4 bytes
    const statusFlags = '00000000'; // 4 bytes

    // Coordinates mapping to (34.123456, 118.123456)
    const lat = (34.123456 * 1e6).toString(16).padStart(8, '0');
    const lon = (118.123456 * 1e6).toString(16).padStart(8, '0');

    const alt = '0000'; // 2 bytes
    const speed = '0258'; // 2 bytes: 600 -> 60 km/h
    const dir = '0000'; // 2 bytes

    // Timestamp: YYMMDDHHmmss = 26-03-09 13:30:00 (6 bytes)
    const time = '260309133000';

    const hexPayload = msgId + attr + phone + seqNum + alarmFlags + statusFlags + lat + lon + alt + speed + dir + time;

    console.log(`\n[Test Client] Sending Telemetry Payload...`);
    console.log(`Payload: ${hexPayload}`);

    socket.emit('telemetry', hexPayload, (ack) => {
      console.log(`[Test Client] Telemetry Ack received:`, ack);

      console.log(`\n✅ View the server logs in your server terminal or inside the logs/ directory to see the structured output.`);

      // Close the connection after testing
      setTimeout(() => {
        console.log(`[Test Client] Closing connection...`);
        socket.disconnect();
        process.exit(0);
      }, 1000);
    });
  });
});

socket.on('connect_error', (error) => {
  console.log(`[Test Client] Connection Error:`, error.message);
});
