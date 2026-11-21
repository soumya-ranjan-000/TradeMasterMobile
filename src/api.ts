/**
 * Market data client: every market-data call goes through TradeMasterBackend,
 * authenticated with BACKEND_API_KEY. Responses are normalised to the shapes
 * the screens already consume (they were written against the Breeze service).
 */
import { BACKEND_API_KEY, ORCHESTRATOR_URL, ORCHESTRATOR_WS_URL } from './config';

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

const authHeaders = (): Record<string, string> =>
    BACKEND_API_KEY ? { 'X-API-Key': BACKEND_API_KEY } : {};

export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/v1${path}`, {
        ...init,
        headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
    });
    if (res.status === 401) {
        console.warn('Backend rejected the request (401): EXPO_PUBLIC_BACKEND_API_KEY must equal the backend SERVICE_API_KEY.');
    }
    return res;
}

async function backendJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await backendFetch(path, init);
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { detail = (await res.json()).detail || detail; } catch { /* not JSON */ }
        throw new ApiError(res.status, detail);
    }
    return res.json();
}

/** Socket URL for live ticks. Handshakes cannot carry headers, so the key rides as ?api_key=. */
export const marketWsUrl = () =>
    `${ORCHESTRATOR_WS_URL}/api/v1/market_data/ws` +
    (BACKEND_API_KEY ? `?api_key=${encodeURIComponent(BACKEND_API_KEY)}` : '');

// --- types the screens use -----------------------------------------------------
export interface SearchResult {
    symbol: string;          // bare NSE code, e.g. "TCS"
    description: string;
    source?: string;
}

export interface Candle {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface Quote {
    symbol: string;          // "TCS.NS"
    name: string;            // "TCS"
    price: number;
    change: number;          // percent
}

export interface MarketStatus {
    is_open: boolean;
    halted: boolean;
    message: string;
}

// --- market status ---------------------------------------------------------------
const IST_OFFSET_MIN = 330;

/** NSE cash session 09:15-15:30 IST, Mon-Fri. Exchange holidays are not modelled. */
export function isExchangeOpen(now: Date = new Date()): boolean {
    const ist = new Date(now.getTime() + (now.getTimezoneOffset() + IST_OFFSET_MIN) * 60000);
    const day = ist.getDay();
    const mins = ist.getHours() * 60 + ist.getMinutes();
    return day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

/**
 * The backend's /market/status is an events GO/NO-GO: it says OPEN whenever
 * trading is not HALTED, even at night. Session hours therefore come from the
 * clock, and the backend only adds halts.
 */
export async function getMarketStatus(): Promise<MarketStatus> {
    const open = isExchangeOpen();
    try {
        const s = await backendJson<{ market_status?: string; message?: string; reason?: string }>('/market/status');
        const halted = s.market_status === 'HALTED';
        return {
            is_open: open && !halted,
            halted,
            message: halted ? (s.message || s.reason || 'Trading halted') : open ? 'Market Open' : 'Market Closed',
        };
    } catch {
        return { is_open: open, halted: false, message: open ? 'Market Open' : 'Market Closed' };
    }
}

// --- market pulse & trading status (Dashboard Market / Events tabs) -----------------
export interface PulseFactor {
    key: string; label: string; group?: string;
    unit?: 'pct' | 'bps' | 'cr' | null;   // unit of `change`
    value: number | null; change: number | null;
    reading?: string; impact?: 'positive' | 'negative' | 'neutral';   // what the move means for Indian stocks
}
export interface MarketPulse {
    available: boolean;
    error?: string;
    updated_at?: string;
    /** next_session: YYYY-MM-DD of the next NSE session (holidays included); holiday: today's holiday name. */
    session?: { status?: string; hours?: string; holiday?: string | null; next_session?: string | null };
    bias?: { score: number; label: string };
    index?: { name?: string; price?: number; change?: number };
    cues?: { label: string; change: number | null; weight?: number; as_of?: string; age_minutes?: number; stale?: boolean; detail?: string }[];
    factors?: PulseFactor[];
    sectors?: { as_of?: string; stale?: boolean; source?: string; rows: { label: string; symbol?: string; change: number; sentiment?: string }[] };
    /** FII/DII provisional cash-market net flows, Rs crore; spark = recent sessions' nets. */
    flows?: { key: 'fii' | 'dii' | string; label: string; value: number | null; buy?: number | null; sell?: number | null;
              session?: string | null; reading?: string; impact?: 'positive' | 'negative' | 'neutral';
              spark?: number[] | null; as_of?: string | null; stale?: boolean | null }[];
    notes?: string[];
    /** World overview (null if that part of the service failed). Scores are weighted moves in %. */
    global?: {
        average_score: number | null; average_bias: string | null;
        counts: { bullish?: number; neutral?: number; bearish?: number };
        vix: { value: number | null; change: number | null; reading?: string; impact?: string } | null;
        markets: { slug: string; name: string; status?: string; bias?: { score: number; label: string };
                   index?: { name?: string; change?: number | null } }[];
    } | null;
}
export const getMarketPulse = () => backendJson<MarketPulse>('/market/pulse');

// --- next session (when closed markets reopen) ----------------------------------------
export type MarketSession = NonNullable<MarketPulse['session']>;

let sessionCache: { at: number; value: MarketSession | null } | null = null;
let sessionLoading: Promise<MarketSession | null> | null = null;

/**
 * The NSE session block from the market pulse (status, holiday, next_session),
 * cached for 10 minutes because the pulse is a heavy call. null if unavailable.
 */
export function getMarketSession(maxAgeMs = 10 * 60_000): Promise<MarketSession | null> {
    if (sessionCache && Date.now() - sessionCache.at < maxAgeMs) return Promise.resolve(sessionCache.value);
    if (!sessionLoading) {
        sessionLoading = getMarketPulse()
            .then(p => p?.session ?? null)
            .catch(() => null)
            .then(value => {
                sessionCache = { at: Date.now(), value };
                sessionLoading = null;
                return value;
            });
    }
    return sessionLoading;
}

const DAY_MS = 86_400_000;
const OPEN_MIN = 9 * 60 + 15;
const IST_MS = IST_OFFSET_MIN * 60_000;

/** True when the pulse says today is an NSE holiday (the clock alone would call it open). */
export function isHolidayToday(session?: MarketSession | null, now: Date = new Date()): boolean {
    if (!session?.holiday || !session.next_session) return false;
    const t = new Date(now.getTime() + IST_MS);
    const today = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
    return session.next_session > today;
}

/**
 * When the NSE cash session next opens (09:15 IST): `next_session`
 * (YYYY-MM-DD, holidays included) while it is still ahead, else the next
 * weekday (holidays not modelled).
 */
export function nextMarketOpen(nextSession?: string | null, now: Date = new Date()): Date {
    const nowMs = now.getTime();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nextSession || '');
    if (m) {
        const at = Date.UTC(+m[1], +m[2] - 1, +m[3], 9, 15) - IST_MS;
        if (at > nowMs) return new Date(at);
    }
    // Work in "IST as UTC" so the getUTC* fields read as IST.
    const t = new Date(nowMs + IST_MS);
    let day = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
    const weekday = (ms: number) => { const d = new Date(ms).getUTCDay(); return d >= 1 && d <= 5; };
    const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
    if (!(weekday(day) && mins < OPEN_MIN)) {
        do { day += DAY_MS; } while (!weekday(day));
    }
    return new Date(day + OPEN_MIN * 60_000 - IST_MS);
}

/** Raw events GO/NO-GO from the economic service (via the backend). */
export interface NextEvent {
    name: string; currency?: string; time?: string; event_at?: string; scope?: string;
    start?: string | null; end?: string | null; minutes_to_event?: number | null;
}
export interface TradingStatus {
    market_status?: string;          // OPEN | HALTED (event halts, not the exchange session)
    trade_allowed?: boolean;
    status?: string;                 // OPEN | DEGRADED ...
    reason?: string | null;
    halt_until?: string | null;
    active_halts?: { scope: string; reason: string; until?: string | null; source?: string }[];
    next_event?: NextEvent | null;
    data_fresh?: boolean;
    events_service?: string;         // "unavailable" when the backend could not reach it
}
export const getTradingStatus = () => backendJson<TradingStatus>('/market/status');

/** Week ahead from the economic service: high-impact releases + results days, by IST date. */
export interface CalendarEvent {
    event_id: string; date: string; time?: string | null; time_status?: string; event_at?: string | null;
    name: string; currency?: string; category?: 'macro' | 'earnings' | string;
    symbols?: string[]; company?: string | null; scope?: string; action?: 'halt' | 'watch' | string;
    actual?: string | null; forecast?: string | null; previous?: string | null; past?: boolean;
}
export interface EconomicCalendar {
    available: boolean; error?: string;
    days: { date: string; weekday: string; events: CalendarEvent[] }[];
    /** Beyond these dates an empty day means "not published yet". */
    coverage?: { macro_until?: string | null; results_until?: string | null; currencies?: string[] };
}
export const getEconomicCalendar = (days = 7) => backendJson<EconomicCalendar>(`/market/calendar?days=${days}`);

// --- search ------------------------------------------------------------------------
const bare = (s: string) => s.toUpperCase().trim().replace(/\.(NS|BO)$/, '');

export async function searchSymbols(q: string): Promise<SearchResult[]> {
    if (q.trim().length < 2) return [];
    const rows = await backendJson<any[]>(`/market/search?q=${encodeURIComponent(q.trim())}`);
    const out: SearchResult[] = [];
    const seen = new Set<string>();
    for (const r of Array.isArray(rows) ? rows : []) {
        const raw = String(r.symbol || '');
        // Yahoo results include foreign listings; the app trades NSE only.
        if (r.source === 'yfinance' && !/\.(NS|BO)$/i.test(raw)) continue;
        const symbol = bare(raw);
        if (!symbol || seen.has(symbol)) continue;
        seen.add(symbol);
        out.push({
            symbol,
            description: r.description || r.name || r.shortname || r.longname || 'Equity • NSE',
            source: r.source,
        });
    }
    return out;
}

// --- history -----------------------------------------------------------------------
export async function getHistory(symbol: string, period: string, interval: string): Promise<Candle[]> {
    const rows = await backendJson<any[]>(
        `/market/history?symbol=${encodeURIComponent(symbol)}&period=${period}&interval=${interval}`);
    return (Array.isArray(rows) ? rows : []).map(r => ({
        time: r.time, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
    }));
}

// --- quotes ------------------------------------------------------------------------
export async function getQuotes(symbols: string[]): Promise<Quote[]> {
    if (!symbols.length) return [];
    const rows = await backendJson<any[]>('/signals/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: symbols.map(s => (s.includes('.') ? s : `${s}.NS`)) }),
    });
    return (Array.isArray(rows) ? rows : [])
        .filter(r => r.price != null)
        .map(r => ({
            symbol: r.symbol,
            name: bare(r.symbol),
            price: Number(r.price),
            change: Number(r.change_percent || 0),
        }));
}

// --- opportunity scanner (TradeMasterBackend /scanner) ---------------------------
export type ScanStyle = 'intraday' | 'swing';

export interface ScanCandidate {
    id: string;
    symbol: string;
    name: string;
    sector?: string | null;
    style: ScanStyle;
    strategy: string;
    direction: 'long' | 'short';
    setup_type: string;
    setup_state: string;            // triggered | pending
    status: string;                 // qualified | watchlist | ...
    status_reason: string;
    rank: number | null;
    score: number;
    reference_price: number;
    change_pct: number | null;
    entry_low: number;
    entry_high: number;
    entry_trigger: number;
    stop: number;
    targets: number[];
    reward_risk_net: number | null;
    quantity: number | null;
    sentiment_label: string | null;
    flags: { code: string; severity: string; message: string }[];
    entry_confirmed_at: string | null;
    expires_at: string | null;
    updated_at: string;
}

export interface ScanExecution {
    candidate_id: string;
    symbol: string;
    style: ScanStyle;
    strategy: string;
    direction: 'long' | 'short';
    trigger: 'auto' | 'manual';
    status: 'placed' | 'rejected' | 'failed' | 'cancelled';
    attempts: number;
    request: Record<string, any>;
    order_id: string | null;
    order_status: string | null;
    fill_price: number | null;
    error: string | null;
    created_at: string;
    updated_at: string;
}

export interface BridgeStatus {
    enabled: boolean;               // automatic sends happening (all switches on)
    allowed?: boolean;              // the server permits them (env + YAML)
    auto_switch?: boolean;          // the app's on/off
    master_switch: boolean;
    mode: string;
    trigger: string;
    paper_user_id: string;
    outbound_key_set: boolean;
    last_sync: Record<string, any> | null;
}

export interface ScanRun {
    id: string;
    style: ScanStyle;
    status: 'running' | 'completed' | 'failed';
    errors: string[];
    summary: { universe_size: number; qualified: number; watchlist: number; rejected: number };
}

export const scanner = {
    meta: () => backendJson<any>('/scanner/meta'),
    candidates: (style: ScanStyle) =>
        backendJson<{ count: number; candidates: ScanCandidate[] }>(
            `/scanner/candidates?style=${style}&status=qualified,watchlist&limit=500`),
    executions: (limit = 100) =>
        backendJson<{ bridge: BridgeStatus; items: ScanExecution[] }>(`/scanner/executions?limit=${limit}`),
    execute: (candidateId: string) =>
        backendJson<ScanExecution>(`/scanner/candidates/${encodeURIComponent(candidateId)}/execute`, { method: 'POST' }),
    scan: (style: ScanStyle, universe: string) =>
        backendJson<ScanRun>('/scanner/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ style, universe }),
        }),
    run: (runId: string) => backendJson<ScanRun>(`/scanner/runs/${encodeURIComponent(runId)}`),
    setAutoTrading: (enabled: boolean) =>
        backendJson<BridgeStatus>('/scanner/executions/auto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled }),
        }),
};
