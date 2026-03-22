import dotenv from "dotenv";
dotenv.config();
import { httpServer } from "./server";

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`🚀 OBD-II Telemetry Server running on port ${PORT}`);
});
