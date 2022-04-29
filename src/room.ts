import { Data, WebSocket } from "ws";

class Room {
  name: string;
  pin: string; // TODO argon2
  active: boolean = true;
  running: boolean = false;
  shotclockRemaining: number; // milliseconds

  initialShotclock: number; // seconds
  timeoutTime: number; // seconds
  quarterTime: number; // seconds

  // In-Memory only props
  lastTimerOrActionDate: Date;
  shotclockAtLastReset: number | null = null;
  clients: Array<WebSocket> = [];
  activeTimer: ReturnType<typeof setTimeout> | null = null;
  websocketKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
  title: string | null = null;

  // Additional properties for future use
  gameTime: number = 0;
  penalties: Array<any> = [];
  scoreHome: number = 0;
  scoreAway: number = 0;

  constructor(name: string, pin: string) {
    this.name = name;
    this.pin = pin;
    this.initialShotclock = 30;
    this.timeoutTime = 30;
    this.quarterTime = 180;
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
    if (index !== -1) this.clients.splice(index, 1);
    if (this.clients.length == 0) {
      this.pause();
      if (this.websocketKeepAliveTimer != null) {
        clearInterval(this.websocketKeepAliveTimer);
        this.websocketKeepAliveTimer = null;
      }
    }
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

  sendTitleToClients() {
    for (const client of this.clients) {
      this.sendTitleToClient(client);
    }
  }

  sendTitleToClient(client: WebSocket) {
    const sendTitle = this.title != null ? this.title : "";
    client.send("T;" + sendTitle);
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
      this.setNextSecondTimer();
      this.sendRunningToClients();
      this.lastTimerOrActionDate = new Date();
      if (this.websocketKeepAliveTimer != null) {
        clearInterval(this.websocketKeepAliveTimer);
        this.websocketKeepAliveTimer = null;
      }
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
      this.sendShotclockToClients();
      this.startWebsocketKeepAliveTimer();
    }
  }

  startWebsocketKeepAliveTimer() {
    this.websocketKeepAliveTimer =  setInterval(() => {
      this.sendShotclockToClients();
    }, 10000);
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
    if (restart) this.start();
    this.lastTimerOrActionDate = new Date();
  }

  saveTimeAtReset() {
    this.shotclockAtLastReset = this.shotclockRemaining - (Date.now() - this.lastTimerOrActionDate.getTime());
  }

  timeout() {
    this.pause();
    if (this.title == null) {
      this.saveTimeAtReset();
    }
    this.title = "Timeout";
    this.shotclockRemaining = this.timeoutTime * 1000;
    this.sendTitleToClients();
    this.sendShotclockToClients();
    this.start();
  }

  quarter() {
    this.pause();
    if (this.title == null) {
      this.saveTimeAtReset();
    }
    this.title = "Quarter";
    this.shotclockRemaining = this.quarterTime * 1000;
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
      this.shotclockRemaining = this.shotclockAtLastReset;
      this.sendShotclockToClients();
      if (this.running) {
        if (this.activeTimer !== null) clearTimeout(this.activeTimer);
        this.setNextSecondTimer();
      }
      this.lastTimerOrActionDate = new Date();
    }
  }

  updateTime(t: number) {
    this.shotclockRemaining = Math.max(0, this.shotclockRemaining + t * 1000);
    this.sendShotclockToClients();
    if (this.running) {
      if (this.activeTimer !== null) clearTimeout(this.activeTimer);
      this.setNextSecondTimer();
    }
    this.lastTimerOrActionDate = new Date();
  }

  horn() {
    if (this.shotclockRemaining > 2000) {
      for (const client of this.clients) {
        client.send("HORN");
      }
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
      this.sendRunningToClients();
    }
    this.sendShotclockToClients();
    this.setNextSecondTimer();
    this.lastTimerOrActionDate = new Date();
  }
}

export default Room;
