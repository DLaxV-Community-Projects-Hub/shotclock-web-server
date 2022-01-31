import { WebSocketServer, WebSocket } from "ws";
const url = require("url");
import { URLSearchParams } from "url";
import Room from "./room";

const initialShotclock: number = 30;

const wss: WebSocketServer = new WebSocketServer({ port: 8888 });

let rooms: Record<string, Room> = {};

wss.on("connection", function connection(ws: WebSocket, req: any) {
  const reqUrl: any = url.parse(req["url"]);
  const roomName: string = reqUrl["pathname"].substring(1);
  const searchParams: URLSearchParams = new URLSearchParams(reqUrl["search"]);
  let room: Room;
  if (!(roomName in rooms)) {
    if (searchParams.has("pin")) {
      // Create room
      const pin: string = searchParams.get("pin") as string;
      room = new Room(roomName, pin, initialShotclock);
      room.authenticateClient(ws, pin);
      rooms[roomName] = room;
      console.log("Room " + roomName + " created with PIN " + pin);
      room.start();
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
    if (!room.authenticateClient(ws, pin)) {
      console.log(
        "Unsuccessful authentication for room " +
          room.name +
          " with wrong PIN " +
          pin
      );
      ws.send("WRONG_PIN");
      ws.close();
      return;
    }
  }

  room.joinClient(ws);

  ws.on("message", function message(data) {});
});
