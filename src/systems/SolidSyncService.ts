/**
 * SolidSyncService — 基于 Solid POD 的可选远端存档同步
 * 浏览器端使用 @inrupt/solid-client-authn-browser 完成 OIDC 登录流程
 * 然后用 @inrupt/solid-client 读写用户 POD 上的 JSON 文件
 */

import type { ProfileSave } from '../types/index.js';

const POD_FILE_PATH = 'mini-games/profile.json';

export type SolidStatus = 'idle' | 'logging-in' | 'logged-in' | 'error';

export class SolidSyncService {
  private static _instance: SolidSyncService;
  private _status: SolidStatus = 'idle';
  private _webId: string | null = null;
  private _podUrl: string | null = null;
  private _lastError: string | null = null;

  /** Dynamic imports to avoid bundling Solid libs if unused */
  private _authn: typeof import('@inrupt/solid-client-authn-browser') | null = null;
  private _client: typeof import('@inrupt/solid-client') | null = null;

  private constructor() {}

  static getInstance(): SolidSyncService {
    if (!SolidSyncService._instance) SolidSyncService._instance = new SolidSyncService();
    return SolidSyncService._instance;
  }

  get status(): SolidStatus { return this._status; }
  get webId(): string | null { return this._webId; }
  get lastError(): string | null { return this._lastError; }

  private async _loadLibs(): Promise<boolean> {
    if (this._authn && this._client) return true;
    try {
      const [authn, client] = await Promise.all([
        import('@inrupt/solid-client-authn-browser'),
        import('@inrupt/solid-client'),
      ]);
      this._authn  = authn;
      this._client = client;
      return true;
    } catch (e) {
      this._lastError = 'Solid 库加载失败';
      this._status    = 'error';
      console.warn('[SolidSync] Failed to load Solid libraries', e);
      return false;
    }
  }

  /** Call this on app init to restore an existing session */
  async restoreSession(): Promise<void> {
    if (!await this._loadLibs()) return;
    try {
      await this._authn!.handleIncomingRedirect({ restorePreviousSession: true });
      const session = this._authn!.getDefaultSession();
      if (session.info.isLoggedIn && session.info.webId) {
        this._webId = session.info.webId;
        this._status = 'logged-in';
      }
    } catch (e) {
      console.warn('[SolidSync] restoreSession error', e);
    }
  }

  /** Initiate OIDC login redirect */
  async login(issuer: string): Promise<void> {
    if (!await this._loadLibs()) return;
    this._status = 'logging-in';
    try {
      await this._authn!.login({
        oidcIssuer: issuer,
        redirectUrl: window.location.href,
        clientName: '小游戏合集',
      });
    } catch (e) {
      this._status    = 'error';
      this._lastError = String(e);
    }
  }

  async logout(): Promise<void> {
    if (!this._authn) return;
    await this._authn.logout();
    this._webId = null; this._status = 'idle';
  }

  private _profileUrl(): string | null {
    if (!this._webId) return null;
    // Derive storage URL from WebID (common pattern)
    const base = this._webId.replace(/\/profile\/card#me$/, '/')
                            .replace(/#.*$/, '');
    this._podUrl = base;
    return `${base}${POD_FILE_PATH}`;
  }

  async pull(): Promise<ProfileSave | null> {
    if (!this._authn || !this._client || this._status !== 'logged-in') return null;
    const url = this._profileUrl(); if (!url) return null;
    try {
      const file = await this._client.getFile(url, { fetch: this._authn.fetch });
      const text = await (file as Blob).text();
      return JSON.parse(text) as ProfileSave;
    } catch { return null; }
  }

  async push(profile: ProfileSave): Promise<void> {
    if (!this._authn || !this._client || this._status !== 'logged-in') return;
    const url = this._profileUrl(); if (!url) return;
    try {
      const blob = new Blob([JSON.stringify(profile)], { type: 'application/json' });
      await this._client.overwriteFile(url, blob, {
        contentType: 'application/json',
        fetch: this._authn.fetch,
      });
    } catch (e) {
      console.warn('[SolidSync] push error', e);
    }
  }
}
