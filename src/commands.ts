import Room from "./room";

// Handles a text command ("name" or "name;argument") sent by an authenticated client
export function handleCommand(room: Room, message: string): void {
  const separator: number = message.indexOf(";");
  const command: string =
    separator === -1 ? message : message.substring(0, separator);
  const commandData: string | null =
    separator === -1 ? null : message.substring(separator + 1);
  // Parsed numeric argument, or null if missing/invalid
  const num: number | null = commandData ? parseInt(commandData) : null;
  const value: number | null = num === null || isNaN(num) ? null : num;

  switch (command) {
    case "start":
      room.start();
      break;
    case "pause":
      room.pause();
      break;
    case "reset":
      room.reset();
      break;
    case "rewind":
      room.rewindToLastReset();
      break;
    case "updateTime":
      if (value !== null) {
        room.updateTime(value);
      }
      break;
    case "setInitialShotclock":
      if (value !== null && value > 0) {
        room.initialShotclock = value;
        if (!room.running) {
          room.reset();
        }
      }
      break;
    case "setTimeout":
      if (value !== null && value > 0) {
        room.timeoutTime = value;
      }
      break;
    case "setQuarter":
      if (value !== null) {
        room.quarterTime = value;
      }
      break;
    case "setHalftime":
      if (value !== null) {
        room.halftimeTime = value;
      }
      break;
    case "horn":
      room.horn();
      break;
    case "timeout":
      room.timeout();
      break;
    case "quarter":
      room.quarter();
      break;
    case "halftime":
      room.halftime();
      break;
  }
}
