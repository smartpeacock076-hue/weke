// مدير اتصال WebSocket للبثّ الصوتي اللحظي + الحضور، مع إعادة اتصال تلقائية
import {getServerUrl, getToken} from './api';

type Handler = (payload: any) => void;

class RadioSocket {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<Handler>> = new Map();
  private currentChannel: number | null = null;
  private shouldRun = false;
  private reconnectTimer: any = null;
  private authed = false;

  connect() {
    this.shouldRun = true;
    this.open();
  }

  private open() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const url = getServerUrl().replace(/^http/, 'ws');
    this.authed = false;
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.send({type: 'auth', token: getToken()});
    };

    this.ws.onmessage = e => {
      let msg: any;
      try {
        msg = JSON.parse(e.data as string);
      } catch {
        return;
      }
      if (msg.type === 'auth_ok') {
        this.authed = true;
        this.emit('open', msg);
        // إعادة الانضمام للقناة الحالية بعد إعادة الاتصال
        if (this.currentChannel != null) {
          this.send({type: 'join', channelId: this.currentChannel});
        }
      }
      this.emit(msg.type, msg);
    };

    this.ws.onclose = () => {
      this.authed = false;
      this.emit('close', {});
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose سيُستدعى بعدها
    };
  }

  private scheduleReconnect() {
    if (!this.shouldRun || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, 2000);
  }

  private send(obj: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  isReady() {
    return this.authed && this.ws?.readyState === WebSocket.OPEN;
  }

  join(channelId: number) {
    this.currentChannel = channelId;
    this.send({type: 'join', channelId});
  }

  leave() {
    if (this.currentChannel != null) {
      this.send({type: 'leave', channelId: this.currentChannel});
    }
    this.currentChannel = null;
  }

  talkStart() {
    this.send({type: 'talk_start', channelId: this.currentChannel});
  }

  sendAudio(chunk: string) {
    this.send({type: 'audio', channelId: this.currentChannel, chunk});
  }

  talkEnd() {
    this.send({type: 'talk_end', channelId: this.currentChannel});
  }

  on(type: string, cb: Handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
    return () => this.off(type, cb);
  }

  off(type: string, cb: Handler) {
    this.listeners.get(type)?.delete(cb);
  }

  private emit(type: string, payload: any) {
    this.listeners.get(type)?.forEach(cb => cb(payload));
  }

  disconnect() {
    this.shouldRun = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.currentChannel = null;
    this.ws?.close();
    this.ws = null;
  }
}

// نسخة واحدة مشتركة لكامل التطبيق
export const radio = new RadioSocket();
