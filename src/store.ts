import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

// Everything about a room that survives a server restart
export interface RoomRecord {
  name: string;
  pinSalt: Buffer;
  pinHash: Buffer;
  initialShotclock: number; // seconds
  timeoutTime: number; // seconds
  quarterTime: number; // seconds
  halftimeTime: number; // seconds
  shotclockRemaining: number; // milliseconds
  title: string | null;
  shotclockAtLastReset: number | null; // milliseconds
}

interface RoomRow {
  name: string;
  pin_salt: Uint8Array;
  pin_hash: Uint8Array;
  initial_shotclock: number;
  timeout_time: number;
  quarter_time: number;
  halftime_time: number;
  shotclock_remaining: number;
  title: string | null;
  shotclock_at_last_reset: number | null;
}

// SQLite storage for rooms (node:sqlite, no external dependency)
export default class RoomStore {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        name TEXT PRIMARY KEY,
        pin_salt BLOB NOT NULL,
        pin_hash BLOB NOT NULL,
        initial_shotclock INTEGER NOT NULL,
        timeout_time INTEGER NOT NULL,
        quarter_time INTEGER NOT NULL,
        halftime_time INTEGER NOT NULL,
        shotclock_remaining INTEGER NOT NULL,
        title TEXT,
        shotclock_at_last_reset INTEGER,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  load(name: string): RoomRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM rooms WHERE name = ?")
      .get(name) as unknown as RoomRow | undefined;
    if (row === undefined) {
      return undefined;
    }
    return {
      name: row.name,
      pinSalt: Buffer.from(row.pin_salt),
      pinHash: Buffer.from(row.pin_hash),
      initialShotclock: row.initial_shotclock,
      timeoutTime: row.timeout_time,
      quarterTime: row.quarter_time,
      halftimeTime: row.halftime_time,
      shotclockRemaining: row.shotclock_remaining,
      title: row.title,
      shotclockAtLastReset: row.shotclock_at_last_reset,
    };
  }

  save(record: RoomRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO rooms (
          name, pin_salt, pin_hash, initial_shotclock, timeout_time,
          quarter_time, halftime_time, shotclock_remaining, title,
          shotclock_at_last_reset, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.name,
        record.pinSalt,
        record.pinHash,
        record.initialShotclock,
        record.timeoutTime,
        record.quarterTime,
        record.halftimeTime,
        Math.round(record.shotclockRemaining),
        record.title,
        record.shotclockAtLastReset === null
          ? null
          : Math.round(record.shotclockAtLastReset),
        Date.now()
      );
  }

  // Removes rooms that have not been saved for the given time
  purge(olderThanMs: number): number {
    const result = this.db
      .prepare("DELETE FROM rooms WHERE updated_at < ?")
      .run(Date.now() - olderThanMs);
    return Number(result.changes);
  }

  close(): void {
    this.db.close();
  }
}
