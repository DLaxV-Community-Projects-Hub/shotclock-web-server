import { Data, WebSocket } from "ws";

class Room {
  name: string;
  pin: string; // TODO argon2
  active: boolean = true;
  running: boolean = false;
  lastTimerOrActionDate: Date;
  shotclockRemaining: number; // milliseconds

  // In-Memory only props
  clients: Array<WebSocket> = [];
  authenticatedClients: Array<WebSocket> = [];
  activeTimer: ReturnType<typeof setTimeout> | null = null;

  // Additional properties for future use
  gameTime: number = 0;
  penalties: Array<any> = [];
  scoreHome: number = 0;
  scoreAway: number = 0;

  constructor(name: string, pin: string, initialShotclock: number) {
    this.name = name;
    this.pin = pin;
    this.shotclockRemaining = initialShotclock * 1000;
    this.lastTimerOrActionDate = new Date();
  }

  joinClient(ws: WebSocket) {
    this.clients.push(ws);
    this.sendShotclockToClient(ws);
  }

  authenticateClient(ws: WebSocket, pin: string): boolean {
    if (pin === this.pin) {
      this.authenticatedClients.push(ws);
      return true;
    }
    return false;
  }

  sendShotclockToClients() {
    for (const client of this.clients) this.sendShotclockToClient(client);
  }

  sendShotclockToClient(client: WebSocket) {
    const remainingSeconds: number = Math.round(this.shotclockRemaining / 1000);
    console.log(remainingSeconds);
    client.send("t;" + this.gameTime + ";" + remainingSeconds);
  }

  start() {
    console.log("Start " + this.name);
    this.running = true;
    this.lastTimerOrActionDate = new Date();
    this.setNextSecondTimer();
  }

  pause() {
    this.running = false;
    if (this.activeTimer !== null) clearTimeout(this.activeTimer);
    if (this.lastTimerOrActionDate !== null) {
      this.shotclockRemaining =
        Date.now() - this.lastTimerOrActionDate.getTime();
      this.lastTimerOrActionDate = new Date();
    }
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
    console.log(
      "Shotclock remaining in " + this.name + ": " + this.shotclockRemaining
    );
    this.lastTimerOrActionDate = new Date();
    this.sendShotclockToClients();
    this.setNextSecondTimer();
  }

  reset() {}
}

export default Room;
