import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { ORCHESTRATOR_WS_URL, BREEZE_API_URL } from '../config';
import { useIsFocused } from '@react-navigation/native';

interface Tick {
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

interface MarketDataContextType {
    ticks: Record<string, Tick>;
    subscribe: (symbol: string, exchange?: string) => void;
    unsubscribe: (symbol: string, exchange?: string) => void;
    isConnected: boolean;
}

const MarketDataContext = createContext<MarketDataContextType | undefined>(undefined);

export const MarketDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [ticks, setTicks] = useState<Record<string, Tick>>({});
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef<WebSocket | null>(null);
    const subscriptions = useRef<Map<string, number>>(new Map());
    const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

    const connect = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) return;

        const wsFullUrl = `${ORCHESTRATOR_WS_URL}/api/v1/market_data/ws`;
        console.log('Connecting to Market Data Orchestrator:', wsFullUrl);
        const socket = new WebSocket(wsFullUrl);

        socket.onopen = () => {
            console.log('Market Data WebSocket Connected to:', wsFullUrl);
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
                setTicks(prev => {
                    if (prev[key]?.ltp === tick.ltp && prev[key]?.volume === tick.volume) {
                        return prev;
                    }
                    console.log(`Live Update: ${key} = ₹${tick.ltp}`);
                    return { ...prev, [key]: tick };
                });
            } catch (err) {
                console.error('Error parsing tick data:', err);
            }
        };

        socket.onerror = (error) => {
            console.error('Market Data WebSocket Error:', error);
        };

        socket.onclose = () => {
            console.log('Market Data WebSocket Disconnected');
            setIsConnected(false);
            if (!reconnectTimeout.current) {
                reconnectTimeout.current = setTimeout(() => {
                    reconnectTimeout.current = null;
                    connect();
                }, 5000);
            }
        };

        ws.current = socket;
    }, []);

    useEffect(() => {
        connect();
        return () => {
            if (ws.current) {
                ws.current.close();
            }
            if (reconnectTimeout.current) {
                clearTimeout(reconnectTimeout.current);
            }
        };
    }, [connect]);

    const pendingBatch = useRef<Set<string>>(new Set());
    const batchTimer = useRef<NodeJS.Timeout | null>(null);

    const processBatch = useCallback(async () => {
        if (pendingBatch.current.size === 0) return;

        const symbolsToFetch = Array.from(pendingBatch.current);
        pendingBatch.current.clear();
        console.log(`🚀 Batch Fetching initial prices for ${symbolsToFetch.length} symbols...`);

        try {
            const response = await fetch(`${BREEZE_API_URL}/api/batch-quotes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbols: symbolsToFetch })
            });
            const results = await response.json();

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

                setTicks(prev => ({ ...prev, ...newTicks }));
                console.log(`✅ Batch update complete for ${Object.keys(newTicks).length} symbols`);
            }
        } catch (error) {
            console.error('Batch fetch failed:', error);
        }
    }, []);

    const queueInitialFetch = useCallback((symbol: string) => {
        pendingBatch.current.add(symbol);
        if (batchTimer.current) clearTimeout(batchTimer.current);
        batchTimer.current = setTimeout(processBatch, 300); // 300ms buffer
    }, [processBatch]);

    const subscribe = useCallback((symbol: string, exchange: string = 'NSE') => {
        const stock_code = symbol.split('.')[0].toUpperCase();
        const key = `${exchange}:${stock_code}`;

        const currentCount = subscriptions.current.get(key) || 0;
        subscriptions.current.set(key, currentCount + 1);

        if (currentCount === 0) {
            // New subscription
            console.log(`Frontend: New subscription for ${key}`);
            
            // Only fetch if we don't have valid data already
            if (!ticks[key] || ticks[key].ltp === 0) {
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
            console.log(`Frontend: Reusing subscription for ${key} (Refs: ${currentCount + 1})`);
        }
    }, [queueInitialFetch, ticks]);

    const unsubscribe = useCallback((symbol: string, exchange: string = 'NSE') => {
        const stock_code = symbol.split('.')[0].toUpperCase();
        const key = `${exchange}:${stock_code}`;

        const currentCount = subscriptions.current.get(key) || 0;
        if (currentCount > 0) {
            const newCount = currentCount - 1;
            if (newCount === 0) {
                subscriptions.current.delete(key);
                console.log(`Frontend: Last reference for ${key} removed. Unsubscribing.`);
                if (ws.current?.readyState === WebSocket.OPEN) {
                    ws.current.send(JSON.stringify({
                        type: 'unsubscribe',
                        stock_code,
                        exchange_code: exchange
                    }));
                }
            } else {
                subscriptions.current.set(key, newCount);
                console.log(`Frontend: Decremented refs for ${key} (Remaining: ${newCount})`);
            }
        }
    }, []);

    return (
        <MarketDataContext.Provider value={{ ticks, subscribe, unsubscribe, isConnected }}>
            {children}
        </MarketDataContext.Provider>
    );
};

export const useMarketData = () => {
    const context = useContext(MarketDataContext);
    if (context === undefined) {
        throw new Error('useMarketData must be used within a MarketDataProvider');
    }
    return context;
};

export const useLivePrice = (symbol?: string, exchange: string = 'NSE') => {
    const { ticks, subscribe, unsubscribe } = useMarketData();
    const isFocused = useIsFocused();

    useEffect(() => {
        if (isFocused && symbol && symbol !== 'UNKNOWN') {
            subscribe(symbol, exchange);
            return () => unsubscribe(symbol, exchange);
        }
    }, [symbol, exchange, subscribe, unsubscribe, isFocused]);

    if (!symbol || symbol === 'UNKNOWN') return null;

    const stock_code = symbol.split('.')[0].toUpperCase();
    const key = `${exchange}:${stock_code}`;
    return ticks[key] || null;
};
