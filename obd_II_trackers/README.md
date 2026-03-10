# OBD-II Telemetry & Diagnostics Server

A production-grade Node.js telemetry server for receiving, parsing, and analyzing real-time vehicle data from OBD-II GPS devices.

## Features

- **Protocol Agnostic Interface**: Built for JT808/OBD-II HEX payloads over `Socket.IO`
- **Deterministic Parsing**: Safe handling of malformed messages to prevent server crashes
- **Real-Time Data Extraction**: GPS Location (Lat/Lon/Speed), OBD-II DTC Codes, Vehicle State
- **Per-Device Logging**: Async JSON logging locally with daily rotation
- **API Monitoring**: `/api/health` and `/api/devices` endpoints for system oversight

---

## 🚀 Setup & Installation

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Setup environment variables (or copy .env.example)
cp .env.example .env
```

---

## 🛠 Usage

### Development Mode

Runs the server with hot-reloading (via `ts-node-dev`).

```bash
npm run dev
```

### Production Build

Compiles TypeScript to standard JavaScript.

```bash
npm run build
npm start
```

---

## 🧪 Testing

The system employs a strict Test-Driven approach with **90% coverage** enforcement.

**Run unit tests:**

```bash
npm test
```

**Run tests with coverage report:**

```bash
npm run test:coverage
```

### Offline Analyzer Tool

An offline tool is provided to replay and analyze historical raw device logs:

```bash
npx ts-node scripts/offline-analyzer.ts ./path/to/logfile.log
```

---

## 📚 Architecture Protocol (Based on JT808 / OBD-II)

Supported Messages:

- `0x0100`: Device Registration
- `0x0102`: Device Authentication
- `0x0002`: Heartbeat
- `0x0200`: GPS Location Report
- `0x0900`: OBD Passthrough Data (DTC decoding)

---

## 🛡 System Constraints

_(As per `agent.md` guidelines)_

1. All HEX incoming data is validated strictly using `HexParser`.
2. `SessionManager` state isolates incoming data by unique device ID.
3. Disk I/O logs execute asynchronously and never block the Node.js event pool.
