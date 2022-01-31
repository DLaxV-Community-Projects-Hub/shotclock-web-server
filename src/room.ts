import { Data, WebSocket } from "ws";

class Room {
  name: string;
  pin: string; // TODO argon2
  active: boolean = true;
  running: boolean = false;
  shotclockRemaining: number; // milliseconds

  // In-Memory only props
  initialShotclock: number; // seconds
  lastTimerOrActionDate: Date;
  clients: Array<WebSocket> = [];
  activeTimer: ReturnType<typeof setTimeout> | null = null;

  // Additional properties for future use
  gameTime: number = 0;
  penalties: Array<any> = [];
  scoreHome: number = 0;
  scoreAway: number = 0;

  constructor(name: string, pin: string, initialShotclock: number) {
    this.name = name;
    this.pin = pin;
    this.initialShotclock = initialShotclock;
    this.shotclockRemaining = initialShotclock * 1000;
    this.lastTimerOrActionDate = new Date();
  }

  joinClient(ws: WebSocket) {
    this.clients.push(ws);
    this.sendRunningToClient(ws);
    this.sendShotclockToClient(ws);
  }

  disconnectClient(ws: WebSocket) {
    const index: number = this.clients.indexOf(ws);
    if (index !== -1) this.clients.splice(index, 1);
    if (this.clients.length == 0) this.pause();
  }

  checkPin(pin: string): boolean {
    return pin === this.pin;
  }

  sendShotclockToClients() {
    const remainingSeconds: number = Math.round(this.shotclockRemaining / 1000);
    for (const client of this.clients) {
      this.sendShotclockToClient(client, remainingSeconds);
    }
  }

  sendShotclockToClient(
    client: WebSocket,
    remainingSeconds: number | null = null
  ) {
    if (remainingSeconds === null)
      remainingSeconds = Math.round(this.shotclockRemaining / 1000);
    client.send("t;" + this.gameTime + ";" + remainingSeconds);
  }

  sendRunningToClients() {
    for (const client of this.clients) {
      this.sendRunningToClient(client);
    }
  }

  sendRunningToClient(client: WebSocket) {
    client.send("r;" + (this.running ? 1 : 0));
  }

  start() {
    if (!this.running) {
      this.running = true;
      this.lastTimerOrActionDate = new Date();
      this.setNextSecondTimer();
      this.sendRunningToClients();
    }
  }

  pause() {
    if (this.running) {
      this.running = false;
      if (this.activeTimer !== null) clearTimeout(this.activeTimer);
      if (this.lastTimerOrActionDate !== null) {
        this.shotclockRemaining =
          this.shotclockRemaining -
          (Date.now() - this.lastTimerOrActionDate.getTime());
        this.lastTimerOrActionDate = new Date();
      }
      this.sendRunningToClients();
    }
  }

  reset() {
    this.lastTimerOrActionDate = new Date();
    this.shotclockRemaining = this.initialShotclock * 1000;
    this.sendShotclockToClients();
  }

  setNextSecondTimer() {
    if (this.running) {
      let timeout: number = this.shotclockRemaining % 1000;
      if (timeout == 0) timeout = 1000;
      this.activeTimer = setTimeout(() => {
        this.updateRemainingShotclockByDate();
      }, timeout);
    }
  }

  updateRemainingShotclockByDate() {
    this.shotclockRemaining =
      this.shotclockRemaining -
      (Date.now() - this.lastTimerOrActionDate.getTime());
    if (this.shotclockRemaining <= 0) {
      this.shotclockRemaining = 0;
      this.running = false;
    }
    this.lastTimerOrActionDate = new Date();
    this.sendShotclockToClients();
    this.setNextSecondTimer();
  }
}

export default Room;
