import { WebSocketServer, WebSocket } from "ws";
const url = require("url");
import { URLSearchParams } from "url";
import Room from "./room";

const port: number = 8080;

const wss: WebSocketServer = new WebSocketServer({ port });
console.log("Listening on port " + port);

let rooms: Record<string, Room> = {};

wss.on("connection", function connection(ws: WebSocket, req: any) {
  const reqUrl: any = url.parse(req["url"]);
  let roomName: string = reqUrl["pathname"];
  // Remove all leading slashes
  while (roomName.charAt(0) === "/") roomName = roomName.substring(1);

  let authenticated: boolean = false;

  const searchParams: URLSearchParams = new URLSearchParams(reqUrl["search"]);
  let room: Room;
  if (!(roomName in rooms)) {
    if (searchParams.has("pin")) {
      // Create room
      const pin: string = searchParams.get("pin") as string;
      room = new Room(roomName, pin);
      authenticated = true;
      rooms[roomName] = room;
      console.log("Room " + roomName + " created with PIN " + pin);
    } else {
      ws.send("ROOM_NOT_FOUND");
      ws.close();
      return;
    }
  } else {
    room = rooms[roomName];
  }

  if (searchParams.has("pin")) {
    // Check PIN
    const pin: string = searchParams.get("pin") as string;
    if (!(authenticated = room.checkPin(pin))) {
      console.log(
        "Unsuccessful authentication for room " +
          room.name +
          " with wrong PIN " +
          pin
      );
      ws.send("WRONG_PIN");
      ws.close();
      return;
    } else {
      ws.send("AUTHENTICATED");
    }
  }

  room.joinClient(ws);

  ws.on("message", function message(data) {
    if (!authenticated) return;
    const message: string = new String(data).toString();
    let command: string = message;
    let commandData: string | null = null;
    if (message.includes(";")) {
      command = message.substring(0, message.indexOf(";"));
      commandData = message.substring(message.indexOf(";") + 1, message.length);
    }
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
        if (commandData) {
          const t: number = parseInt(commandData);
          if (!isNaN(t)) room.updateTime(t);
        }
        break;
      case "setInitialShotclock":
        if (commandData) {
          const t: number = parseInt(commandData);
          if (!isNaN(t)) room.initialShotclock = t;
          if (!room.running)
            room.reset();
        }
        break;
      case "setTimeout":
        if (commandData) {
          const t: number = parseInt(commandData);
          if (!isNaN(t)) room.timeoutTime = t;
        }
        break;
      case "setQuarter":
        if (commandData) {
          const t: number = parseInt(commandData);
          if (!isNaN(t)) room.quarterTime = t;
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
    }
  });

  ws.on("close", function close() {
    room.disconnectClient(ws);
  });
});
