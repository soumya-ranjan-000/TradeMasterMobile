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
    enabled: boolean;
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
};
