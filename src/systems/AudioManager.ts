/**
 * AudioManager — Web Audio API 合成音效 + 文件音频
 * 优先从 public/assets/audio/ 加载文件；若文件缺失则回退程序音效。
 */

export type SfxKey =
  | 'click' | 'place' | 'error' | 'clear' | 'combo'
  | 'levelup' | 'merge' | 'diamond' | 'potcomplete' | 'win';

export class AudioManager {
  private static _instance: AudioManager;
  private _ctx!: AudioContext;
  private _gainNode!: GainNode;
  private _musicGain!: GainNode;
  private _sfxEnabled = true;
  private _musicEnabled = true;
  private _unlocked = false;
  private _fileBuffers = new Map<string, AudioBuffer>();
  private _currentMusic: AudioBufferSourceNode | null = null;
  private _baseUrl = '';

  private constructor() {}

  static getInstance(): AudioManager {
    if (!AudioManager._instance) AudioManager._instance = new AudioManager();
    return AudioManager._instance;
  }

  initialize(baseUrl: string, sfxEnabled = true, musicEnabled = true): void {
    this._sfxEnabled  = sfxEnabled;
    this._musicEnabled = musicEnabled;
    this._baseUrl     = baseUrl;
  }

  setSfxEnabled(v: boolean):   void { this._sfxEnabled  = v; }
  setMusicEnabled(v: boolean): void {
    this._musicEnabled = v;
    if (!v) this._currentMusic?.stop();
  }

  /** Try loading an audio file into the buffer cache */
  async loadFile(key: string, path: string): Promise<void> {
    if (this._fileBuffers.has(key)) return;
    try {
      const url = this._baseUrl + path;
      const resp = await fetch(url);
      if (!resp.ok) return;
      const arr  = await resp.arrayBuffer();
      // Wait for unlock to decode audio data? No, we can't context decode until unlocked.
      // Better: trigger decode as soon as unlocked. For now, store ArrayBuffer.
      this._decodeQueue.push({ key, arr });
      this._tryDecodeQueue();
    } catch { /* silently skip missing files */ }
  }

  private _decodeQueue: { key: string; arr: ArrayBuffer }[] = [];

  private async _tryDecodeQueue() {
    if (!this._unlocked || !this._ctx) return;
    const q = this._decodeQueue.splice(0, this._decodeQueue.length);
    for (const { key, arr } of q) {
      try {
        const buf = await this._ctx.decodeAudioData(arr);
        this._fileBuffers.set(key, buf);
      } catch { /* ignore */ }
    }
  }

  /** Must be called from a user-gesture handler to unlock Web Audio on mobile */
  unlock(): void {
    if (this._unlocked) return;
    try {
      this._ctx       = new AudioContext();
      this._gainNode  = this._ctx.createGain();
      this._musicGain = this._ctx.createGain();
      this._gainNode.connect(this._ctx.destination);
      this._musicGain.gain.value = 0.4;
      this._musicGain.connect(this._ctx.destination);
      this._unlocked = true;
      // Warm-up
      const buf = this._ctx.createBuffer(1, 1, 22050);
      const src = this._ctx.createBufferSource();
      src.buffer = buf; src.connect(this._ctx.destination); src.start(0);
      
      this._tryDecodeQueue();
    } catch (e) {
      console.warn('[AudioManager] Web Audio API unavailable', e);
    }
  }

  private _playBuffer(buf: AudioBuffer, gainNode: GainNode, volume = 1): void {
    if (!this._unlocked) return;
    const src = this._ctx.createBufferSource();
    const g   = this._ctx.createGain();
    g.gain.value = volume;
    src.buffer = buf;
    src.connect(g);
    g.connect(gainNode);
    src.start(0);
  }

  playSfx(key: SfxKey, volume = 1): void {
    if (!this._sfxEnabled || !this._unlocked) return;
    const fileKey = `sfx-${key}`;
    if (this._fileBuffers.has(fileKey)) {
      this._playBuffer(this._fileBuffers.get(fileKey)!, this._gainNode, volume);
    } else {
      this._synthSfx(key);
    }
  }

  playVoice(name: string): void {
    if (!this._sfxEnabled || !this._unlocked) return;
    const key = `voice-${name}`;
    if (this._fileBuffers.has(key)) {
      this._playBuffer(this._fileBuffers.get(key)!, this._gainNode, 1.0);
    }
  }

  /** Programmatic sound synthesis fallback */
  private _synthSfx(key: SfxKey): void {
    if (!this._unlocked) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    switch (key) {
      case 'click': this._beep(880, 0.08, 'sine', 0.3); break;
      case 'place': this._beep(440, 0.15, 'sine', 0.4); break;
      case 'error': this._beep(160, 0.2, 'sawtooth', 0.3); break;
      case 'merge': {
        this._beep(523, 0.1, 'sine', 0.5);
        setTimeout(() => this._beep(659, 0.1, 'sine', 0.5), 80);
        setTimeout(() => this._beep(783, 0.15, 'sine', 0.5), 160);
        break;
      }
      case 'clear': {
        [523, 659, 783, 1046].forEach((f, i) =>
          setTimeout(() => this._beep(f, 0.12, 'sine', 0.5), i * 70));
        break;
      }
      case 'combo': {
        const freqs = [523, 659, 783, 1046, 1318];
        freqs.forEach((f, i) => setTimeout(() => this._beep(f, 0.08, 'triangle', 0.4), i * 50));
        break;
      }
      case 'levelup': {
        [523, 659, 783, 1046, 1318, 1568].forEach((f, i) =>
          setTimeout(() => this._beep(f, 0.12, 'sine', 0.6), i * 80));
        break;
      }
      case 'diamond': {
        [1046, 1318, 1568, 2093].forEach((f, i) =>
          setTimeout(() => this._beep(f, 0.1, 'sine', 0.5), i * 50));
        break;
      }
      case 'potcomplete': {
        [659, 783, 1046].forEach((f, i) =>
          setTimeout(() => this._beep(f, 0.12, 'sine', 0.6), i * 90));
        break;
      }
      case 'win': {
        const seq = [523, 659, 783, 523, 659, 783, 1046];
        seq.forEach((f, i) => setTimeout(() => this._beep(f, 0.15, 'sine', 0.6), i * 100));
        break;
      }
    }
    void now; // suppress unused warning
  }

  private _beep(freq: number, duration: number, type: OscillatorType, volume: number): void {
    try {
      const ctx = this._ctx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      env.gain.setValueAtTime(volume, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(env);
      env.connect(this._gainNode);
      osc.start(now);
      osc.stop(now + duration);
    } catch { /* ignore */ }
  }
}
