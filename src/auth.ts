/**
 * Sign-in for the paper-trading service.
 *
 * A phone signs in with its Trader ID + personal PIN and gets a device session
 * token. The token lives in the OS keychain (expo-secure-store; AsyncStorage on
 * web, where SecureStore has no implementation) and goes out with every
 * paper-service call as `Authorization: Bearer <token>` via `paperFetch`.
 *
 * A 401 from any paper call means the token is invalid, expired or revoked:
 * `paperFetch` clears the local session and notifies `onSignedOut` listeners
 * (RootNavigator resets to Login). USER_ID stays in AsyncStorage while signed
 * in because many screens read it.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

const TOKEN_KEY = 'PAPER_SESSION_TOKEN';
const useSecureStore = Platform.OS !== 'web';

/** Prefix of the string encoded in TradeMaster Web's login QR code. */
export const QR_PREFIX = 'trademaster-login:';

export interface DeviceSession {
    token: string;
    user_id: string;
    session_id: string;
    kind: 'device';
    label: string;
    ip?: string | null;
    created_at: string;
    last_seen_at?: string | null;
    expires_at: string;
}

export interface SessionInfo {
    session_id: string;
    kind: 'device' | 'web';
    label: string;
    ip?: string | null;
    created_at: string;
    last_seen_at?: string | null;
    expires_at: string;
    current: boolean;
}

// --- token storage -----------------------------------------------------------------
// In-memory copy so every request doesn't hit the keychain. `undefined` = not loaded yet.
let cachedToken: string | null | undefined;
let loading: Promise<string | null> | null = null;

export function getToken(): Promise<string | null> {
    if (cachedToken !== undefined) return Promise.resolve(cachedToken);
    if (!loading) {
        loading = (async () => {
            let t: string | null = null;
            try {
                t = useSecureStore ? await SecureStore.getItemAsync(TOKEN_KEY) : await AsyncStorage.getItem(TOKEN_KEY);
            } catch {
                t = null;
            }
            // A sign-in/sign-out may have set the token while we were reading.
            if (cachedToken === undefined) cachedToken = t;
            loading = null;
            return cachedToken;
        })();
    }
    return loading;
}

async function writeToken(token: string | null) {
    cachedToken = token;
    try {
        if (useSecureStore) {
            if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
            else await SecureStore.deleteItemAsync(TOKEN_KEY);
        } else if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
        else await AsyncStorage.removeItem(TOKEN_KEY);
    } catch (e) {
        console.warn('Could not persist the session token:', e);
    }
}

/** Store a fresh device session (after PIN setup/login). */
export async function saveSession(session: DeviceSession) {
    await writeToken(session.token);
    await AsyncStorage.multiSet([
        ['USER_ID', session.user_id],
        ['LAST_TRADER_ID', session.user_id],
        ['IS_REAL', 'true'],
    ]);
}

/** Forget the token and the signed-in user on this device (keeps LAST_TRADER_ID for "Continue as"). */
export async function clearLocalSession() {
    await writeToken(null);
    await AsyncStorage.removeItem('USER_ID').catch(() => { });
}

// --- sign-out notifications ----------------------------------------------------------
type Listener = () => void;
const listeners = new Set<Listener>();

/** Called when the server rejected our token (401). Returns an unsubscribe function. */
export function onSignedOut(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

let handling401 = false;
async function handleUnauthorized(tokenUsed: string | null) {
    // Ignore a stale 401 for a token that has since been replaced (e.g. a request
    // sent before sign-in that came back after it).
    if (handling401 || tokenUsed !== cachedToken) return;
    handling401 = true;
    try {
        if (tokenUsed) await clearLocalSession();
        listeners.forEach(fn => { try { fn(); } catch { /* listener errors are not ours */ } });
    } finally {
        handling401 = false;
    }
}

/** A failed auth call: the server's message plus the HTTP status. */
export class AuthRequestError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        // Keep `instanceof` working when the class is compiled down to ES5.
        Object.setPrototypeOf(this, AuthRequestError.prototype);
        this.name = 'AuthRequestError';
        this.status = status;
    }
}

const fail = async (res: Response, fallback: string) => new AuthRequestError(res.status, await errorMessage(res, fallback));

/** User-facing text for an error from an auth call (network failures get a plain message). */
export function authErrorText(e: unknown): string {
    if (e instanceof AuthRequestError) return e.message;
    if (e instanceof TypeError || /network|abort|failed to fetch/i.test(String((e as any)?.message ?? e))) {
        return "Can't reach the server. Check your connection and try again.";
    }
    return (e as any)?.message || 'Something went wrong. Try again.';
}

// --- requests --------------------------------------------------------------------------
export interface PaperFetchOptions {
    /** Default true. Set false where a 401 means something else (wrong PIN) or must not sign out. */
    signOutOn401?: boolean;
    /** Abort the request after this many ms. */
    timeoutMs?: number;
}

/**
 * `fetch` for the paper-trading service. `pathOrUrl` is a path relative to
 * API_URL ("/orders") or a full URL. Adds the bearer token.
 */
export async function paperFetch(pathOrUrl: string, init: RequestInit = {}, opts: PaperFetchOptions = {}): Promise<Response> {
    const url = /^https?:\/\//i.test(pathOrUrl)
        ? pathOrUrl
        : `${API_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
    const token = await getToken();
    const headers: Record<string, string> = { ...((init.headers as Record<string, string> | undefined) || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let signal = init.signal;
    if (opts.timeoutMs && !signal) {
        const ctl = new AbortController();
        timer = setTimeout(() => ctl.abort(), opts.timeoutMs);
        signal = ctl.signal;
    }
    try {
        const res = await fetch(url, { ...init, headers, signal });
        if (res.status === 401 && opts.signOutOn401 !== false) {
            handleUnauthorized(token);
        }
        return res;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** The server's `{detail}` message, or `fallback`. */
export async function errorMessage(res: Response, fallback = 'Something went wrong. Try again.'): Promise<string> {
    try {
        const body = await res.json();
        if (typeof body?.detail === 'string' && body.detail) return body.detail;
        // FastAPI validation errors: [{msg: ...}]
        if (Array.isArray(body?.detail) && body.detail[0]?.msg) return String(body.detail[0].msg);
    } catch {
        // not JSON
    }
    return fallback;
}

/** JSON POST that never triggers the global sign-out (sign-in endpoints). */
const postPublic = (path: string, body: unknown) => paperFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
}, { signOutOn401: false });

/** A readable label for this phone in the sessions list. */
export function deviceLabel(): string {
    if (Platform.OS === 'ios') return (Platform as any).isPad ? 'iPad' : 'iPhone';
    if (Platform.OS === 'android') return 'Android phone';
    if (Platform.OS === 'web') return 'TradeMaster app (browser)';
    return 'TradeMaster app';
}

// --- auth API --------------------------------------------------------------------------
export async function getUserStatus(userId: string): Promise<{ user_id: string; has_pin: boolean }> {
    const res = await paperFetch(`/auth/users/${encodeURIComponent(userId)}`, {}, { signOutOn401: false });
    if (!res.ok) throw await fail(res, "Couldn't check this Trader ID. Try again.");
    return res.json();
}

/** First sign-in: create the PIN. Throws with the server's message on failure. */
export async function setupPin(userId: string, pin: string): Promise<DeviceSession> {
    const res = await postPublic('/auth/pin/setup', { user_id: userId, pin, device_label: deviceLabel() });
    if (!res.ok) throw await fail(res, "Couldn't create your PIN. Try again.");
    const session: DeviceSession = await res.json();
    await saveSession(session);
    return session;
}

/** Sign in with an existing PIN. Throws with the server's message ("Incorrect PIN. 2 tries left.") on failure. */
export async function loginWithPin(userId: string, pin: string): Promise<DeviceSession> {
    const res = await postPublic('/auth/pin/login', { user_id: userId, pin, device_label: deviceLabel() });
    if (!res.ok) throw await fail(res, "Couldn't sign in. Try again.");
    const session: DeviceSession = await res.json();
    await saveSession(session);
    return session;
}

/**
 * App start: is the stored token still good? Offline or a server error lets the
 * user in with the cached USER_ID; a 401 signs out.
 */
export async function restoreSession(): Promise<'signed-in' | 'signed-out'> {
    const token = await getToken();
    if (!token) return 'signed-out';
    // Returning user: open the app right away and verify in the background. A 401
    // there goes through paperFetch's normal sign-out (toast + reset to Login).
    if (await AsyncStorage.getItem('USER_ID')) {
        verifySessionInBackground();
        return 'signed-in';
    }
    try {
        const res = await paperFetch('/auth/me', {}, { signOutOn401: false, timeoutMs: 8000 });
        if (res.status === 401) {
            await clearLocalSession();
            return 'signed-out';
        }
        if (res.ok) {
            const me = await res.json();
            if (me?.user_id) {
                await AsyncStorage.multiSet([['USER_ID', me.user_id], ['LAST_TRADER_ID', me.user_id]]);
                if (me.full_name && me.full_name !== 'Trader') AsyncStorage.setItem('LAST_TRADER_NAME', me.full_name).catch(() => { });
                return 'signed-in';
            }
        }
    } catch {
        // Offline / timeout: fall back to the cached account below.
    }
    return (await AsyncStorage.getItem('USER_ID')) ? 'signed-in' : 'signed-out';
}

function verifySessionInBackground() {
    paperFetch('/auth/me', {}, { timeoutMs: 15000 })   // signOutOn401 (default): revoked -> Login
        .then(async res => {
            if (!res.ok) return;
            const me = await res.json();
            if (me?.user_id) {
                await AsyncStorage.multiSet([['USER_ID', me.user_id], ['LAST_TRADER_ID', me.user_id]]);
                if (me.full_name && me.full_name !== 'Trader') AsyncStorage.setItem('LAST_TRADER_NAME', me.full_name).catch(() => { });
            }
        })
        .catch(() => { /* offline: keep the cached account, as before */ });
}

/** Revoke this token on the server (best effort), then forget it locally. */
export async function signOut() {
    try {
        await paperFetch('/auth/logout', { method: 'POST' }, { signOutOn401: false, timeoutMs: 6000 });
    } catch {
        // Offline: the token still gets forgotten here; it can be revoked from another device.
    }
    await clearLocalSession();
}

export async function changePin(oldPin: string, newPin: string): Promise<void> {
    const res = await paperFetch('/auth/pin/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_pin: oldPin, new_pin: newPin }),
    }, { signOutOn401: false }); // 401 here = wrong current PIN
    if (!res.ok) throw await fail(res, "Couldn't change your PIN. Try again.");
}

export async function listSessions(): Promise<SessionInfo[]> {
    const res = await paperFetch('/auth/sessions');
    if (!res.ok) throw await fail(res, "Couldn't load your signed-in devices.");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

export async function revokeSession(sessionId: string): Promise<void> {
    const res = await paperFetch(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    if (!res.ok) throw await fail(res, "Couldn't sign that device out.");
}

/** Server timestamps are naive UTC ("2026-11-21T10:00:00"); mark them as UTC before parsing. */
export function serverDate(s?: string | null): Date | null {
    if (!s) return null;
    const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
}
