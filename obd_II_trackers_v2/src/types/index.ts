export interface DeviceSession {
  deviceId: string;
  socketId: string;
  connectedAt: number;
  lastSeen: number;
}

export interface DtcRecord {
  code: string;
  type: "Powertrain" | "Chassis" | "Body" | "Network" | "Unknown";
  rawHex: string;
}

export interface ObdMessage {
  type: "telemetry" | "dtc" | "ack" | "unknown";
  payload: any;
}
