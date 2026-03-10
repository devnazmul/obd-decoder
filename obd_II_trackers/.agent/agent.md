# AGENT.md

## Project: OBD-II Telemetry & Diagnostics Server

### Project Overview

This repository implements a **production-grade Node.js telemetry server** for receiving, parsing, and analyzing **vehicle data from OBD-II GPS devices**.

Devices connect to the server via **Socket.IO**, transmit **HEX protocol messages**, and the system decodes them into structured telemetry and diagnostic data.

The server supports:

- Real-time device connections
- OBD-II Diagnostic Trouble Code (DTC) decoding
- Vehicle location telemetry
- Deterministic HEX protocol parsing
- Per-device structured logging
- Offline log analysis

The architecture follows **Clean Architecture principles**, separating:

- Transport Layer
- Protocol Parsing Layer
- Core Domain Logic
- Logging Layer
- API Layer

---

# Core Architecture

```
Device (OBD Tracker)
        │
        ▼
Socket.IO Transport
        │
        ▼
Session Manager
        │
        ▼
Protocol Parser
 ├─ HexParser
 ├─ ObdParser
 └─ DtcDecoder
        │
        ▼
Domain Events
        │
        ▼
Device Logger
        │
        ▼
API / Monitoring
```

---

# Main Responsibilities

## 1. Transport Layer

Handles real-time communication with vehicle devices.

**File**

```
src/socket/SocketHandler.ts
```

Responsibilities:

- Accept device connections
- Register devices
- Receive telemetry events
- Acknowledge messages
- Handle disconnect events

Technologies:

- Socket.IO
- HTTP server

---

## 2. Session Management

**File**

```
src/core/SessionManager.ts
```

Responsibilities:

- Track connected devices
- Map deviceId → socketId
- Update device activity
- Remove sessions on disconnect
- Provide active device list

Key rule:
Sessions must always remain **isolated per device**.

---

## 3. Protocol Parsing Layer

Located in:

```
src/protocol/
```

Components:

### HexParser

Strict validation for incoming HEX payloads.

Responsibilities:

- Validate HEX strings
- Convert HEX → Buffer
- Extract byte segments

Rule:
All incoming payloads must pass `HexParser.isValidHex()` before parsing.

---

### DtcDecoder

Decodes **OBD-II Diagnostic Trouble Codes**.

Example:

```
0380 → P0380
5234 → C1234
```

Uses bitwise decoding according to the **OBD-II standard**.

Responsibilities:

- Decode single DTC
- Decode multiple codes
- Ignore `0000` padding

---

### ObdParser

Handles **JT808 protocol messages**.

Supported message types:

| Message | Purpose               |
| ------- | --------------------- |
| 0100    | Device registration   |
| 0102    | Device authentication |
| 0002    | Heartbeat             |
| 0200    | GPS location report   |
| 0900    | OBD passthrough data  |

Location packets contain:

- Latitude
- Longitude
- Speed
- Direction
- Timestamp

Passthrough packets may contain:

- DTC codes
- VIN numbers
- Alerts

---

# Logging System

File:

```
src/core/DeviceLogger.ts
```

Logging format:

```
logs/device_<deviceId>/device_<deviceId>_<date>.log
```

Example:

```
logs/device_123/device_123_2026-03-09.log
```

Each entry is stored as JSON:

```
{
  "timestamp": "...",
  "level": "INFO",
  "deviceId": "123",
  "message": "Device Registered"
}
```

Rules:

- Logging must **never block the main event loop**
- Always use async file writes
- Never remove structured JSON format

---

# API Layer

Basic monitoring endpoints exist:

```
GET /api/health
GET /api/devices
```

Purpose:

- System health check
- Active device monitoring

---

# Offline Log Analyzer

Script:

```
scripts/offline-analyzer.ts
```

Purpose:

- Analyze historical device logs
- Decode telemetry
- Verify protocol offsets
- Validate parser accuracy

Usage:

```
npx ts-node scripts/offline-analyzer.ts ./device_logs.txt
```

This tool should be used **before connecting production devices**.

---

# Development Setup

Install dependencies:

```
npm install
```

Run development server:

```
npm run dev
```

Build project:

```
npm run build
```

Start production server:

```
npm run start
```

---

# Testing

Run automated tests:

```
npm run test
```

Coverage:

```
npm run test:coverage
```

Tests exist for:

- HexParser
- DtcDecoder
- SessionManager

Coverage requirement:

```
90% minimum
```

---

# Important Engineering Rules

Agents must follow these rules when modifying the system.

### Protocol Safety

Never modify existing parsing offsets without protocol documentation.

Incorrect offsets can break production devices.

---

### Deterministic Parsing

All protocol parsers must be:

- deterministic
- validated
- fail-safe

Malformed payloads must never crash the server.

---

### Logging Integrity

Device logs must:

- remain per-device
- rotate daily
- remain JSON structured

---

### Transport Stability

Socket events must remain idempotent.

Every device message should receive deterministic acknowledgment.

---

# Future Improvements

Potential extensions:

### Kafka / Redis Streams

For large-scale telemetry pipelines.

### Web Dashboard

For real-time monitoring of vehicles.

### Alert Engine

Trigger alerts for:

- Engine errors
- Speed violations
- Geo-fence events

### Data Storage

Persist telemetry into:

- PostgreSQL
- TimescaleDB
- ClickHouse

---

# Summary

This system provides a **scalable real-time backend for vehicle telemetry and diagnostics**.

Key characteristics:

- Clean architecture
- deterministic protocol parsing
- strict HEX validation
- real-time Socket.IO transport
- per-device logging
- offline analysis tools

Agents modifying this project must preserve **protocol accuracy, deterministic parsing, and system stability**.
