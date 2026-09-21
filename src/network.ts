export type Message = Record<string, any>;
export class Connection {
  socket?: WebSocket;
  stopped = false;
  delay = 700;
  timer?: ReturnType<typeof setTimeout>;
  handshake: Message;
  onMessage: (m: Message) => void;
  onStatus: (status: string) => void;
  constructor(handshake: Message, onMessage: (m: Message) => void, onStatus: (status: string) => void) {
    this.handshake = handshake; this.onMessage = onMessage; this.onStatus = onStatus; this.connect();
  }
  connect() {
    if (this.stopped) return;
    this.onStatus('Connecting…');
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`);
    this.socket = ws;
    ws.onopen = () => { this.delay = 700; this.send(this.handshake); };
    ws.onmessage = event => {
      try {
        const m = JSON.parse(event.data);
        if (m.type === 'created') this.handshake = { type: 'host', room: m.room, secret: m.secret };
        if (m.type === 'joined' || m.type === 'created') this.onStatus('Connected');
        if (m.type === 'error') { this.onStatus(m.message); this.stopped = true; ws.close(); }
        this.onMessage(m);
      } catch { /* Ignore malformed frames. */ }
    };
    ws.onclose = () => {
      if (this.stopped) return;
      this.onStatus('Reconnecting…'); this.timer = setTimeout(() => this.connect(), this.delay);
      this.delay = Math.min(this.delay * 1.7, 8000);
    };
    ws.onerror = () => ws.close();
  }
  send(message: Message) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  close() { this.stopped = true; clearTimeout(this.timer); this.socket?.close(); }
}
