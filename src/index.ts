import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import Room from "./room";
import RoomRegistry from "./roomRegistry";
import { handleCommand } from "./commands";
import { ConnectionCounter, LIMITS, RateLimiter, getClientIp } from "./limits";

const port: number = Number(process.env.PORT) || 8080;

const wss: WebSocketServer = new WebSocketServer({
  port,
  maxPayload: LIMITS.maxPayloadBytes,
});
console.log("Listening on port " + port);

wss.on("error", (error: Error) => {
  console.error("Server error", error);
});

const rooms: RoomRegistry = new RoomRegistry();

const connectionCounter: ConnectionCounter = new ConnectionCounter(
  LIMITS.maxConnectionsPerIp
);
const connectionRate: RateLimiter = new RateLimiter(
  LIMITS.connectionsPerMinutePerIp,
  60 * 1000
);
const roomCreationRate: RateLimiter = new RateLimiter(
  LIMITS.roomCreationsPerHourPerIp,
  60 * 60 * 1000
);
const failedPins: RateLimiter = new RateLimiter(
  LIMITS.failedPinsPerWindow,
  LIMITS.failedPinWindowMs
);

let pendingPinChecks: number = 0;

// Sends an error code and closes the connection
function reject(ws: WebSocket, code: string): void {
  ws.send(code);
  ws.close();
}

// Drop connections that do not answer pings anymore
const aliveClients: WeakSet<WebSocket> = new WeakSet();
const heartbeat: ReturnType<typeof setInterval> = setInterval(() => {
  for (const ws of wss.clients) {
    if (!aliveClients.has(ws)) {
      ws.terminate();
      continue;
    }
    aliveClients.delete(ws);
    ws.ping();
  }
}, LIMITS.heartbeatIntervalMs);
wss.on("close", () => clearInterval(heartbeat));

wss.on("connection", function connection(ws: WebSocket, req: IncomingMessage) {
  // Without a listener a protocol error (e.g. too large message) would crash the process
  ws.on("error", () => {
    ws.terminate();
  });

  const ip: string = getClientIp(req);
  if (!connectionRate.hit(ip) || !connectionCounter.tryAcquire(ip)) {
    reject(ws, "RATE_LIMITED");
    return;
  }
  ws.on("close", () => connectionCounter.release(ip));

  aliveClients.add(ws);
  ws.on("pong", () => aliveClients.add(ws));

  const reqUrl: URL = new URL(req.url ?? "/", "http://localhost");
  let roomName: string = reqUrl.pathname;
  // Remove all leading slashes
  while (roomName.charAt(0) === "/") {
    roomName = roomName.substring(1);
  }

  const pin: string | null = reqUrl.searchParams.get("pin");
  if (
    roomName.length > LIMITS.maxRoomNameLength ||
    (pin !== null && pin.length > LIMITS.maxPinLength)
  ) {
    reject(ws, "INVALID_REQUEST");
    return;
  }

  let authenticated: boolean = false;
  let closed: boolean = false;
  let room: Room | null = null;

  // Registered before any asynchronous PIN check so no event is missed
  let messageWindowStart: number = Date.now();
  let messageCount: number = 0;
  ws.on("message", function message(data) {
    const now: number = Date.now();
    if (now - messageWindowStart >= 1000) {
      messageWindowStart = now;
      messageCount = 0;
    }
    if (++messageCount > LIMITS.messagesPerSecond) {
      ws.close(1008, "RATE_LIMITED");
      return;
    }
    if (!authenticated || room === null) {
      return;
    }
    handleCommand(room, data.toString());
  });

  ws.on("close", function close() {
    closed = true;
    if (room !== null) {
      rooms.leave(room, ws);
    }
  });

  // Adds the connection to the room and tells the client about the result
  function join(target: Room, isAuthenticated: boolean): void {
    if (!rooms.join(target, ws)) {
      reject(ws, "ROOM_NOT_FOUND");
      return;
    }
    room = target;
    authenticated = isAuthenticated;
    if (isAuthenticated) {
      ws.send("AUTHENTICATED");
    }
  }

  const existingRoom: Room | undefined = rooms.get(roomName);
  if (existingRoom === undefined) {
    if (pin === null) {
      reject(ws, "ROOM_NOT_FOUND");
      return;
    }
    if (!roomCreationRate.hit(ip)) {
      reject(ws, "RATE_LIMITED");
      return;
    }
    // Create room (registered synchronously, the PIN is hashed in the background)
    const newRoom: Room = rooms.create(roomName, pin);
    console.log("Room " + roomName + " created");
    join(newRoom, true);
    return;
  }

  if (pin === null) {
    // Read-only client
    join(existingRoom, false);
    return;
  }

  // Check PIN without blocking the event loop (and the timers of all rooms)
  // Every attempt counts as failed until it succeeds, so parallel attempts cannot bypass the limit
  if (!failedPins.hit(ip)) {
    reject(ws, "RATE_LIMITED");
    return;
  }
  if (pendingPinChecks >= LIMITS.maxConcurrentPinChecks) {
    reject(ws, "SERVER_BUSY");
    return;
  }
  pendingPinChecks++;
  existingRoom
    .checkPin(pin)
    .then((valid: boolean) => {
      if (valid) {
        failedPins.refund(ip);
      }
      if (closed) {
        return;
      }
      if (!valid) {
        console.log("Unsuccessful authentication for room " + roomName);
        reject(ws, "WRONG_PIN");
        return;
      }
      join(existingRoom, true);
    })
    .catch((error: unknown) => {
      console.error("PIN check failed for room " + roomName, error);
      ws.close();
    })
    .finally(() => {
      pendingPinChecks--;
    });
});
