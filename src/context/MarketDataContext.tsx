import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { BREEZE_WS_URL } from '../config';

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
    const subscriptions = useRef<Set<string>>(new Set());
    const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

    const connect = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) return;

        console.log('Connecting to Market Data WebSocket:', BREEZE_WS_URL);
        const socket = new WebSocket(BREEZE_WS_URL);

        socket.onopen = () => {
            console.log('Market Data WebSocket Connected');
            setIsConnected(true);
            // Re-subscribe to all existing subscriptions on reconnect
            subscriptions.current.forEach(key => {
                const [exchange, stock_code] = key.split(':');
                socket.send(JSON.stringify({
                    type: 'subscribe',
                    stock_code,
                    exchange_code: exchange
                }));
            });
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // Normalize tick data if needed
                const tick: Tick = {
                    stock_code: data.stock_code,
                    exchange_code: data.exchange_code,
                    ltp: parseFloat(data.ltp || data.last || data.price || 0),
                    open: parseFloat(data.open || 0),
                    high: parseFloat(data.high || 0),
                    low: parseFloat(data.low || 0),
                    close: parseFloat(data.close || 0),
                    volume: parseInt(data.volume || 0),
                    ltt: data.ltt,
                    previous_close: parseFloat(data.previous_close || 0),
                };

                // Calculate change if not provided
                if (tick.previous_close > 0) {
                    tick.day_change_abs = tick.ltp - tick.previous_close;
                    tick.day_change_perc = (tick.day_change_abs / tick.previous_close) * 100;
                }

                const key = `${tick.exchange_code}:${tick.stock_code}`;
                setTicks(prev => ({
                    ...prev,
                    [key]: tick
                }));
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
            // Reconnect after 5 seconds
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

    const subscribe = useCallback((symbol: string, exchange: string = 'NSE') => {
        const stock_code = symbol.split('.')[0].toUpperCase();
        const key = `${exchange}:${stock_code}`;

        if (!subscriptions.current.has(key)) {
            subscriptions.current.add(key);
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({
                    type: 'subscribe',
                    stock_code,
                    exchange_code: exchange
                }));
            }
        }
    }, []);

    const unsubscribe = useCallback((symbol: string, exchange: string = 'NSE') => {
        const stock_code = symbol.split('.')[0].toUpperCase();
        const key = `${exchange}:${stock_code}`;

        if (subscriptions.current.has(key)) {
            subscriptions.current.delete(key);
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({
                    type: 'unsubscribe',
                    stock_code,
                    exchange_code: exchange
                }));
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

    useEffect(() => {
        if (symbol && symbol !== 'UNKNOWN') {
            subscribe(symbol, exchange);
            return () => unsubscribe(symbol, exchange);
        }
    }, [symbol, exchange, subscribe, unsubscribe]);

    if (!symbol || symbol === 'UNKNOWN') return null;

    const stock_code = symbol.split('.')[0].toUpperCase();
    const key = `${exchange}:${stock_code}`;
    return ticks[key] || null;
};
