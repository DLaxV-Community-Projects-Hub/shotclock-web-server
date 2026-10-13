import { WebSocket } from "ws";
import Room from "./room";
import { hashPin } from "./pin";
import RoomStore from "./store";
import { LIMITS } from "./limits";

const SAVE_DEBOUNCE_MS: number = 1000;

// Keeps the active rooms in memory and the rest in the database.
// Empty rooms are dropped from memory after a while and restored on demand.
export default class RoomRegistry {
  private rooms: Map<string, Room> = new Map();
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private dirty: Set<Room> = new Set();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly store: RoomStore) {
    this.purgeExpired();
    const purgeTimer = setInterval(
      () => this.purgeExpired(),
      60 * 60 * 1000
    );
    purgeTimer.unref();
  }

  get(name: string): Room | undefined {
    let room: Room | undefined = this.rooms.get(name);
    if (room === undefined) {
      const record = this.store.load(name);
      if (record !== undefined) {
        room = Room.restore(record);
        this.rooms.set(name, room);
        this.scheduleCleanup(room);
        console.log("Room " + name + " restored");
      }
    }
    return room;
  }

  create(name: string, pin: string): Room {
    const room: Room = new Room(name, hashPin(pin));
    this.rooms.set(name, room);
    this.scheduleCleanup(room);
    this.markDirty(room);
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
      this.markDirty(room);
      this.scheduleCleanup(room);
    }
  }

  // Remember to write the room to the database soon
  markDirty(room: Room): void {
    this.dirty.add(room);
    if (this.saveTimer === null) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        void this.flush();
      }, SAVE_DEBOUNCE_MS);
    }
  }

  // Writes all changed rooms to the database
  async flush(): Promise<void> {
    const rooms: Room[] = [...this.dirty];
    this.dirty.clear();
    await Promise.all(rooms.map((room) => this.save(room)));
  }

  // Saves every room and closes the database, used on shutdown
  async shutdown(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await Promise.all([...this.rooms.values()].map((room) => this.save(room)));
    this.store.close();
  }

  private async save(room: Room): Promise<void> {
    try {
      this.store.save(await room.snapshot());
    } catch (error) {
      console.error("Saving room " + room.name + " failed", error);
    }
  }

  private purgeExpired(): void {
    const removed: number = this.store.purge(LIMITS.roomRetentionMs);
    if (removed > 0) {
      console.log("Removed " + removed + " expired rooms from the database");
    }
  }

  private scheduleCleanup(room: Room): void {
    this.cancelCleanup(room);
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(room.name);
      void this.save(room).then(() => {
        // Somebody may have joined while saving
        if (room.clients.length === 0 && this.rooms.get(room.name) === room) {
          room.destroy();
          this.rooms.delete(room.name);
          this.dirty.delete(room);
          console.log("Room " + room.name + " unloaded");
        }
      });
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
