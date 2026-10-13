import { WebSocket } from "ws";
import { PinHash, hashPin, verifyPin } from "./pin";

class Room {
  name: string;
  pinHash: Promise<PinHash>;
  active: boolean = true;
  running: boolean = false;
  shotclockRemaining: number; // milliseconds

  initialShotclock: number; // seconds
  timeoutTime: number; // seconds
  quarterTime: number; // seconds
  halftimeTime: number; // seconds

  // In-Memory only props
  lastTimerOrActionDate: Date;
  shotclockAtLastReset: number | null = null;
  clients: Array<WebSocket> = [];
  activeTimer: ReturnType<typeof setTimeout> | null = null;
  websocketKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
  title: string | null = null;
  titleResetTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // Additional properties for future use
  gameTime: number = 0;
  penalties: Array<any> = [];
  scoreHome: number = 0;
  scoreAway: number = 0;

  constructor(name: string, pin: string) {
    this.name = name;
    this.pinHash = hashPin(pin);
    // Failures are reported when the hash is awaited in checkPin
    this.pinHash.catch(() => {});
    this.initialShotclock = 30;
    this.timeoutTime = 30;
    this.quarterTime = 120;
    this.halftimeTime = 300;
    this.shotclockRemaining = this.initialShotclock * 1000;
    this.lastTimerOrActionDate = new Date();
  }

  joinClient(ws: WebSocket) {
    this.clients.push(ws);
    this.sendRunningToClient(ws);
    this.sendShotclockToClient(ws);
    this.sendTitleToClient(ws);
  }

  disconnectClient(ws: WebSocket) {
    const index: number = this.clients.indexOf(ws);
    if (index !== -1) {
      this.clients.splice(index, 1);
    }
    if (this.clients.length == 0) {
      this.pause();
      this.stopWebsocketKeepAliveTimer();
    }
  }

  async checkPin(pin: string): Promise<boolean> {
    return verifyPin(pin, await this.pinHash);
  }

  private broadcast(message: string) {
    for (const client of this.clients) {
      client.send(message);
    }
  }

  sendShotclockToClients() {
    this.broadcast(this.shotclockMessage());
  }

  sendShotclockToClient(client: WebSocket) {
    client.send(this.shotclockMessage());
  }

  private shotclockMessage(): string {
    const remainingSeconds: number = Math.round(this.shotclockRemaining / 1000);
    return "t;" + this.gameTime + ";" + remainingSeconds;
  }

  sendTitleToClients() {
    this.broadcast(this.titleMessage());
  }

  sendTitleToClient(client: WebSocket) {
    client.send(this.titleMessage());
  }

  private titleMessage(): string {
    return "T;" + (this.title ?? "");
  }

  sendRunningToClients() {
    this.broadcast(this.runningMessage());
  }

  sendRunningToClient(client: WebSocket) {
    client.send(this.runningMessage());
  }

  private runningMessage(): string {
    return "r;" + (this.running ? 1 : 0);
  }

  start() {
    if (!this.running) {
      this.running = true;
      this.setNextSecondTimer();
      this.sendRunningToClients();
      this.lastTimerOrActionDate = new Date();
      this.stopWebsocketKeepAliveTimer();
    }
  }

  pause() {
    if (this.running) {
      this.running = false;
      if (this.activeTimer !== null) {
        clearTimeout(this.activeTimer);
      }
      this.shotclockRemaining = this.currentShotclockRemaining();
      this.lastTimerOrActionDate = new Date();
      this.sendRunningToClients();
      this.sendShotclockToClients();
      this.startWebsocketKeepAliveTimer();
    }
  }

  // Stops all timers, the room must not be used afterwards
  destroy() {
    this.running = false;
    if (this.activeTimer !== null) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    if (this.titleResetTimeoutTimer !== null) {
      clearTimeout(this.titleResetTimeoutTimer);
      this.titleResetTimeoutTimer = null;
    }
    this.stopWebsocketKeepAliveTimer();
  }

  startWebsocketKeepAliveTimer() {
    this.websocketKeepAliveTimer = setInterval(() => {
      this.sendShotclockToClients();
    }, 10000);
  }

  private stopWebsocketKeepAliveTimer() {
    if (this.websocketKeepAliveTimer != null) {
      clearInterval(this.websocketKeepAliveTimer);
      this.websocketKeepAliveTimer = null;
    }
  }

  // Remaining time including the time elapsed since the last update
  private currentShotclockRemaining(): number {
    return (
      this.shotclockRemaining -
      (Date.now() - this.lastTimerOrActionDate.getTime())
    );
  }

  private restartSecondTimer() {
    if (this.running) {
      if (this.activeTimer !== null) {
        clearTimeout(this.activeTimer);
      }
      this.setNextSecondTimer();
    }
  }

  reset() {
    // Auto restart when reset after it hit 0
    let restart: boolean = this.shotclockRemaining == 0;

    // Remove title
    if (this.title != null) {
      this.title = null;
      this.sendTitleToClients();
      // Don't auto restart after timeout/quarter
      restart = false;
    } else {
      this.saveTimeAtReset();
    }

    this.shotclockRemaining = this.initialShotclock * 1000;
    this.sendShotclockToClients();
    if (restart) {
      this.start();
    }
    this.lastTimerOrActionDate = new Date();
  }

  saveTimeAtReset() {
    this.shotclockAtLastReset = this.running
      ? this.currentShotclockRemaining()
      : this.shotclockRemaining;
  }

  timeout() {
    this.startTitled("Timeout", this.timeoutTime);
  }

  quarter() {
    this.startTitled("Quarter", this.quarterTime);
  }

  halftime() {
    this.startTitled("Halftime", this.halftimeTime);
  }

  private startTitled(title: string, seconds: number) {
    this.pause();
    if (this.title == null) {
      this.saveTimeAtReset();
    }
    this.title = title;
    this.shotclockRemaining = seconds * 1000;
    this.sendTitleToClients();
    this.sendShotclockToClients();
    this.start();
  }

  rewindToLastReset() {
    if (this.shotclockAtLastReset) {
      if (this.title != null) {
        this.title = null;
        this.sendTitleToClients();
      }
      if (this.titleResetTimeoutTimer != null) {
        clearTimeout(this.titleResetTimeoutTimer);
        this.titleResetTimeoutTimer = null;
      }
      this.shotclockRemaining = this.shotclockAtLastReset;
      this.sendShotclockToClients();
      this.restartSecondTimer();
      this.lastTimerOrActionDate = new Date();
    }
  }

  updateTime(t: number) {
    this.shotclockRemaining = Math.min(this.initialShotclock * 1000, Math.max(0, this.shotclockRemaining + t * 1000));
    this.sendShotclockToClients();
    this.restartSecondTimer();
    this.lastTimerOrActionDate = new Date();
  }

  horn() {
    if (this.shotclockRemaining > 2000) {
      this.broadcast("HORN");
    }
  }

  setNextSecondTimer() {
    if (this.running) {
      let timeout: number = this.shotclockRemaining % 1000;
      if (timeout == 0) {
        timeout = 1000;
      }
      this.activeTimer = setTimeout(() => {
        this.updateRemainingShotclockByDate();
      }, timeout);
    }
  }

  updateRemainingShotclockByDate() {
    this.shotclockRemaining = this.currentShotclockRemaining();
    if (this.shotclockRemaining <= 0) {
      this.shotclockRemaining = 0;
      this.running = false;
      this.sendRunningToClients();
      if (this.title != null) {
        this.titleResetTimeoutTimer = setTimeout(() => {
          this.titleResetTimeoutTimer = null;
          this.rewindToLastReset();
        }, 3000);
      }
    }
    this.sendShotclockToClients();
    this.setNextSecondTimer();
    this.lastTimerOrActionDate = new Date();
  }
}

export default Room;
