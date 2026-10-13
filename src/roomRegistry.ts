import { WebSocket } from "ws";
import Room from "./room";
import { LIMITS } from "./limits";

// Keeps all rooms and removes them again once they have been empty for a while
export default class RoomRegistry {
  private rooms: Map<string, Room> = new Map();
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  get(name: string): Room | undefined {
    return this.rooms.get(name);
  }

  create(name: string, pin: string): Room {
    const room: Room = new Room(name, pin);
    this.rooms.set(name, room);
    this.scheduleCleanup(room);
    return room;
  }

  // Returns false if the room has been removed in the meantime
  join(room: Room, ws: WebSocket): boolean {
    if (this.rooms.get(room.name) !== room) {
      return false;
    }
    this.cancelCleanup(room);
    room.joinClient(ws);
    return true;
  }

  leave(room: Room, ws: WebSocket): void {
    room.disconnectClient(ws);
    if (room.clients.length === 0) {
      this.scheduleCleanup(room);
    }
  }

  private scheduleCleanup(room: Room): void {
    this.cancelCleanup(room);
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(room.name);
      room.destroy();
      this.rooms.delete(room.name);
      console.log("Room " + room.name + " removed");
    }, LIMITS.emptyRoomTtlMs);
    timer.unref();
    this.cleanupTimers.set(room.name, timer);
  }

  private cancelCleanup(room: Room): void {
    const timer = this.cleanupTimers.get(room.name);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.cleanupTimers.delete(room.name);
    }
  }
}
