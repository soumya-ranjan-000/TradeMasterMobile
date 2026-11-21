import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { getMarketStatus, getQuotes, marketWsUrl } from '../api';
import { useIsFocused } from '@react-navigation/native';

export interface Tick {
    stock_code: string;
    exchange_code: string;
    ltp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    ltt: string;
    previous_close: number;
    day_change_abs?: number;
    day_change_perc?: number;
}

type Listener = () => void;

/**
 * Live prices live outside React state: a price change notifies only the
 * components reading that key (useLivePrice / useLivePrices / subscribeTicks),
 * instead of re-rendering every consumer of the context on every tick.
 */
class TickStore {
    private ticks: Record<string, Tick> = {};
    private keyListeners = new Map<string, Set<Listener>>();

    get = (key: string): Tick | undefined => this.ticks[key];

    /** Immutable snapshot of every known tick (a new object after each change). */
    snapshot = (): Readonly<Record<string, Tick>> => this.ticks;

    /** Calls `listener` (at most once per update) when any of `keys` changes. */
    subscribeKeys = (keys: readonly string[], listener: Listener): (() => void) => {
        keys.forEach(k => {
            let set = this.keyListeners.get(k);
            if (!set) this.keyListeners.set(k, (set = new Set()));
            set.add(listener);
        });
        return () => keys.forEach(k => {
            const set = this.keyListeners.get(k);
            if (!set) return;
            set.delete(listener);
            if (set.size === 0) this.keyListeners.delete(k);
        });
    };

    /** Applies several ticks at once; unchanged ones (same ltp and volume) are skipped. */
    setMany = (updates: Record<string, Tick>, force = false) => {
        const changed: string[] = [];
        for (const key in updates) {
            const prev = this.ticks[key];
            const next = updates[key];
            if (!force && prev && prev.ltp === next.ltp && prev.volume === next.volume) continue;
            changed.push(key);
        }
        if (changed.length === 0) return;
        const nextTicks = { ...this.ticks };
        changed.forEach(k => { nextTicks[k] = updates[k]; });
        this.ticks = nextTicks;
        const toNotify = new Set<Listener>();
        changed.forEach(k => this.keyListeners.get(k)?.forEach(l => toNotify.add(l)));
        toNotify.forEach(l => l());
    };
}

/** WebSocket ticks are coalesced and applied at most this often. */
const TICK_FLUSH_MS = 250;

interface MarketDataContextType {
    subscribe: (symbol: string, exchange?: string) => void;
    unsubscribe: (symbol: string, exchange?: string) => void;
    isConnected: boolean;
    /** Current tick for an `EXCHANGE:CODE` key (not reactive). */
    getTick: (key: string) => Tick | undefined;
    /** Current ticks keyed by `EXCHANGE:CODE` (not reactive). */
    getTicks: () => Readonly<Record<string, Tick>>;
    /** Listen for changes to the given keys; returns the unsubscribe function. */
    subscribeTicks: (keys: readonly string[], listener: () => void) => () => void;
    /**
     * Keep the live socket open while the app is in the background (price alerts
     * and SL/target notifications need ticks). Off: the socket closes to save battery.
     */
    setBackgroundWatch: (on: boolean) => void;
}

const MarketDataContext = createContext<MarketDataContextType | undefined>(undefined);
const TickStoreContext = createContext<TickStore | undefined>(undefined);

export const MarketDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [store] = useState(() => new TickStore());
    const [isConnected, setIsConnected] = useState(false);
    const [marketStatus, setMarketStatus] = useState<{ is_open: boolean }>({ is_open: true });

    const ws = useRef<WebSocket | null>(null);
    const subscriptions = useRef<Map<string, number>>(new Map());
    const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
    // True while the app is in the background: no socket, no reconnect loop.
    const suspended = useRef(false);
    // Something needs ticks even in the background (notifications): keep the socket.
    const backgroundWatch = useRef(false);
    const inBackground = useRef(AppState.currentState === 'background');
    // The backend refused the API key (1008): retrying cannot help.
    const rejected = useRef(false);
    const connecting = useRef(false);

    // Incoming WS ticks, flushed to the store every TICK_FLUSH_MS.
    const pendingTicks = useRef<Record<string, Tick>>({});
    const flushTimer = useRef<NodeJS.Timeout | null>(null);
    const flushTicks = useCallback(() => {
        flushTimer.current = null;
        const batch = pendingTicks.current;
        pendingTicks.current = {};
        store.setMany(batch);
    }, [store]);

    const checkMarketStatus = useCallback(async () => {
        try {
            const data = await getMarketStatus();
            setMarketStatus(data);
            return data.is_open;
        } catch (error) {
            console.error('Failed to check market status:', error);
            return true; // Default to open to avoid blocking if API fails
        }
    }, []);

    const connect = useCallback(async () => {
        if (suspended.current || rejected.current || connecting.current) return;
        const state = ws.current?.readyState;
        if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;

        connecting.current = true;
        let isOpen: boolean;
        try {
            // Check if market is open before connecting WS
            isOpen = await checkMarketStatus();
        } finally {
            connecting.current = false;
        }
        // Backgrounded while the status request was in flight.
        if (suspended.current) return;
        if (!isOpen) {
            console.log('Market is CLOSED. Skipping WebSocket connection to reduce server load.');
            setIsConnected(false);
            return;
        }

        const wsFullUrl = marketWsUrl();
        console.log('Connecting to Market Data Orchestrator:', wsFullUrl.split('?')[0]);
        const socket = new WebSocket(wsFullUrl);

        socket.onopen = () => {
            console.log('Market Data WebSocket Connected');
            setIsConnected(true);
            // Re-subscribe to all existing subscriptions on reconnect
            if (subscriptions.current.size > 0) {
                console.log(`Re-subscribing to ${subscriptions.current.size} symbols...`);
                subscriptions.current.forEach((count, key) => {
                    const [exchange, stock_code] = key.split(':');
                    socket.send(JSON.stringify({
                        type: 'subscribe',
                        stock_code,
                        exchange_code: exchange
                    }));
                });
            }
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (!data.symbol) return;

                const symbol_base = data.symbol.split('.')[0].toUpperCase();
                const exchange_type = data.symbol.includes('.BO') ? 'BSE' : 'NSE';

                const tick: Tick = {
                    stock_code: symbol_base,
                    exchange_code: exchange_type,
                    ltp: parseFloat(data.price || data.ltp || 0),
                    open: parseFloat(data.open || 0),
                    high: parseFloat(data.high || 0),
                    low: parseFloat(data.low || 0),
                    close: parseFloat(data.price || 0),
                    volume: parseInt(data.volume || 0),
                    ltt: data.timestamp || new Date().toISOString(),
                    previous_close: parseFloat(data.previous_close || 0),
                };

                if (tick.previous_close > 0) {
                    tick.day_change_abs = tick.ltp - tick.previous_close;
                    tick.day_change_perc = (tick.day_change_abs / tick.previous_close) * 100;
                }

                const key = `${tick.exchange_code}:${tick.stock_code}`;
                pendingTicks.current[key] = tick;
                if (!flushTimer.current) flushTimer.current = setTimeout(flushTicks, TICK_FLUSH_MS);
            } catch (err) {
                console.error('Error parsing tick data:', err);
            }
        };

        socket.onerror = (error) => {
            console.error('Market Data WebSocket Error:', error);
        };

        socket.onclose = (event) => {
            // A socket closed on purpose (app backgrounded) or already replaced.
            if (ws.current !== socket) return;
            ws.current = null;
            // 1008 = the backend refused the API key: retrying cannot help.
            if (event.code === 1008) {
                console.warn('Market data socket rejected (1008): check EXPO_PUBLIC_BACKEND_API_KEY.');
                rejected.current = true;
                setIsConnected(false);
                return;
            }
            console.log('Market Data WebSocket Disconnected');
            setIsConnected(false);
            if (!reconnectTimeout.current && !suspended.current) {
                reconnectTimeout.current = setTimeout(() => {
                    reconnectTimeout.current = null;
                    connect();
                }, 5000);
            }
        };

        ws.current = socket;
    }, [checkMarketStatus, flushTicks]);

    /** Close the socket without triggering the reconnect loop. */
    const disconnect = useCallback(() => {
        if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
            reconnectTimeout.current = null;
        }
        const socket = ws.current;
        ws.current = null;  // its onclose sees it was replaced and does nothing
        if (socket) socket.close();
        setIsConnected(false);
    }, []);

    useEffect(() => {
        suspended.current = AppState.currentState === 'background';
        connect();
        return () => {
            suspended.current = true;
            disconnect();
            if (flushTimer.current) clearTimeout(flushTimer.current);
        };
    }, [connect, disconnect]);

    const pendingBatch = useRef<Set<string>>(new Set());
    const batchTimer = useRef<NodeJS.Timeout | null>(null);

    const processBatch = useCallback(async () => {
        if (pendingBatch.current.size === 0) return;

        const symbolsToFetch = Array.from(pendingBatch.current);
        pendingBatch.current.clear();
        if (__DEV__) console.log(`🚀 Batch Fetching initial prices for ${symbolsToFetch.length} symbols...`);

        try {
            const results = await getQuotes(symbolsToFetch);

            if (Array.isArray(results)) {
                const newTicks: Record<string, Tick> = {};
                results.forEach((quote: any) => {
                    const ltp = parseFloat(quote.price || 0);
                    const stock_code = quote.name || quote.symbol?.split('.')[0];
                    const exchange = quote.symbol?.includes('.BO') ? 'BSE' : 'NSE';
                    const key = `${exchange}:${stock_code}`;

                    const tick: Tick = {
                        stock_code,
                        exchange_code: exchange,
                        ltp: ltp,
                        open: 0,
                        high: 0,
                        low: 0,
                        close: ltp,
                        volume: 0,
                        ltt: new Date().toISOString(),
                        previous_close: ltp / (1 + (quote.change || 0) / 100),
                        day_change_perc: quote.change || 0,
                        day_change_abs: ltp - (ltp / (1 + (quote.change || 0) / 100)),
                    };
                    newTicks[key] = tick;
                });

                // REST quotes always replace the stored value (as before), WS ticks are de-duplicated.
                store.setMany(newTicks, true);
                if (__DEV__) console.log(`✅ Batch update complete for ${Object.keys(newTicks).length} symbols`);
            }
        } catch (error) {
            console.error('Batch fetch failed:', error);
        }
    }, [store]);

    const queueInitialFetch = useCallback((symbol: string) => {
        pendingBatch.current.add(symbol);
        if (batchTimer.current) clearTimeout(batchTimer.current);
        batchTimer.current = setTimeout(processBatch, 300); // 300ms buffer
    }, [processBatch]);

    // Background: close the socket (no reconnect loop). Foreground: reconnect
    // (onopen re-subscribes everything) and refresh the subscribed prices once.
    useEffect(() => {
        let wasBackground = AppState.currentState === 'background';
        const sub = AppState.addEventListener('change', next => {
            if (next === 'background') {
                if (wasBackground) return;
                wasBackground = true;
                inBackground.current = true;
                // Alerts / SL-target notifications still need ticks: keep the socket.
                if (backgroundWatch.current) return;
                suspended.current = true;
                disconnect();
            } else if (next === 'active' && wasBackground) {
                wasBackground = false;
                inBackground.current = false;
                if (!suspended.current) return;  // stayed connected for notifications
                suspended.current = false;
                subscriptions.current.forEach((_count, key) => {
                    const [exchange, stock_code] = key.split(':');
                    if (exchange === 'NSE') queueInitialFetch(stock_code);
                });
                connect();
            }
        });
        return () => sub.remove();
    }, [connect, disconnect, queueInitialFetch]);

    const subscribe = useCallback((symbol: string, exchange: string = 'NSE') => {
        const stock_code = symbol.split('.')[0].toUpperCase();
        const key = `${exchange}:${stock_code}`;

        const currentCount = subscriptions.current.get(key) || 0;
        subscriptions.current.set(key, currentCount + 1);

        if (currentCount === 0) {
            // New subscription
            if (__DEV__) console.log(`Frontend: New subscription for ${key}`);

            // Only fetch if we don't have valid data already
            const known = store.get(key);
            if (!known || known.ltp === 0) {
                queueInitialFetch(stock_code);
            }

            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({
                    type: 'subscribe',
                    stock_code,
                    exchange_code: exchange
                }));
            }
        } else {
            if (__DEV__) console.log(`Frontend: Reusing subscription for ${key} (Refs: ${currentCount + 1})`);
        }
    }, [queueInitialFetch, store]);

    const unsubscribe = useCallback((symbol: string, exchange: string = 'NSE') => {
        const stock_code = symbol.split('.')[0].toUpperCase();
        const key = `${exchange}:${stock_code}`;

        const currentCount = subscriptions.current.get(key) || 0;
        if (currentCount > 0) {
            const newCount = currentCount - 1;
            if (newCount === 0) {
                subscriptions.current.delete(key);
                if (__DEV__) console.log(`Frontend: Last reference for ${key} removed. Unsubscribing.`);
                if (ws.current?.readyState === WebSocket.OPEN) {
                    ws.current.send(JSON.stringify({
                        type: 'unsubscribe',
                        stock_code,
                        exchange_code: exchange
                    }));
                }
            } else {
                subscriptions.current.set(key, newCount);
                if (__DEV__) console.log(`Frontend: Decremented refs for ${key} (Remaining: ${newCount})`);
            }
        }
    }, []);

    const setBackgroundWatch = useCallback((on: boolean) => {
        if (backgroundWatch.current === on) return;
        backgroundWatch.current = on;
        if (!inBackground.current) return;
        if (on && suspended.current) {
            suspended.current = false;   // something to watch again while backgrounded
            connect();
        } else if (!on && !suspended.current) {
            suspended.current = true;    // nothing left to notify about
            disconnect();
        }
    }, [connect, disconnect]);

    const value = useMemo<MarketDataContextType>(() => ({
        subscribe,
        unsubscribe,
        isConnected,
        getTick: store.get,
        getTicks: store.snapshot,
        subscribeTicks: store.subscribeKeys,
        setBackgroundWatch,
    }), [subscribe, unsubscribe, isConnected, store, setBackgroundWatch]);

    return (
        <TickStoreContext.Provider value={store}>
            <MarketDataContext.Provider value={value}>
                {children}
            </MarketDataContext.Provider>
        </TickStoreContext.Provider>
    );
};

export const useMarketData = () => {
    const context = useContext(MarketDataContext);
    if (context === undefined) {
        throw new Error('useMarketData must be used within a MarketDataProvider');
    }
    return context;
};

const useTickStore = () => {
    const store = useContext(TickStoreContext);
    if (store === undefined) {
        throw new Error('useLivePrice must be used within a MarketDataProvider');
    }
    return store;
};

/** `NSE:RELIANCE` for `RELIANCE.NS`, the key ticks are stored under. */
export const tickKey = (symbol: string, exchange: string = 'NSE') =>
    `${exchange}:${symbol.split('.')[0].toUpperCase()}`;

const NO_KEYS: readonly string[] = [];

/**
 * Ticks for the given `EXCHANGE:CODE` keys only. The returned object keeps its
 * identity until one of those keys changes. With `paused`, the last result is
 * kept and no updates are received (e.g. while a tab screen is unfocused).
 * Does not subscribe the symbols on the socket: use `subscribe` for that.
 */
export const useLivePrices = (keys: readonly string[], paused: boolean = false): Readonly<Record<string, Tick>> => {
    const store = useTickStore();
    const sig = keys.join('|');
    const cache = useRef<{ sig: string; snap: Record<string, Tick> } | null>(null);

    const subscribe = useCallback((onChange: () => void) => {
        if (paused || !sig) return () => { };
        return store.subscribeKeys(sig.split('|'), onChange);
    }, [store, sig, paused]);

    const getSnapshot = useCallback(() => {
        const prev = cache.current;
        if (paused && prev) return prev.snap;
        const ks = sig ? sig.split('|') : NO_KEYS;
        if (prev && prev.sig === sig && ks.every(k => prev.snap[k] === store.get(k))) return prev.snap;
        const snap: Record<string, Tick> = {};
        ks.forEach(k => { const t = store.get(k); if (t) snap[k] = t; });
        cache.current = { sig, snap };
        return snap;
    }, [store, sig, paused]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useLivePrice = (symbol?: string, exchange: string = 'NSE') => {
    const { subscribe, unsubscribe } = useMarketData();
    const store = useTickStore();
    const isFocused = useIsFocused();

    useEffect(() => {
        if (isFocused && symbol && symbol !== 'UNKNOWN') {
            subscribe(symbol, exchange);
            return () => unsubscribe(symbol, exchange);
        }
    }, [symbol, exchange, subscribe, unsubscribe, isFocused]);

    const key = symbol && symbol !== 'UNKNOWN' ? tickKey(symbol, exchange) : null;
    const subscribeKey = useCallback(
        (onChange: () => void) => (key ? store.subscribeKeys([key], onChange) : () => { }),
        [store, key],
    );
    const getSnapshot = useCallback(() => (key ? store.get(key) ?? null : null), [store, key]);
    return useSyncExternalStore(subscribeKey, getSnapshot, getSnapshot);
};
