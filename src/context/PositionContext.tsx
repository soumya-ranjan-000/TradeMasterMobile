import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { paperFetch } from '../auth';
import { getPaperAccountId, onPaperAccountChange } from '../paperAccount';
import { useAppActive } from '../appState';

interface Position {
    position_id: string;
    symbol: string;
    quantity: number;
    average_price: number;
    stop_loss: number | null;
    target: number | null;
    trailing_sl: number | null;
    current_ltp: number;
    unrealized_pnl: number;
    day_change_perc: number;
    day_change_abs: number;
    product?: string;
    opened_at?: string | null;      // naive UTC; "today" is measured from entry for positions opened today
}

interface PositionContextType {
    positions: Position[];
    loading: boolean;
    refreshPositions: () => Promise<void>;
}

const PositionContext = createContext<PositionContextType | undefined>(undefined);

export const PositionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(false);
    const appActive = useAppActive();
    // Response body of the last applied fetch: an identical poll result keeps the
    // same array, so consumers (and NotificationContext's subscriptions) don't churn.
    const lastSignature = useRef<string | null>(null);
    const started = useRef(false);

    /** `silent`: background poll, no loading flag. */
    const load = useCallback(async (silent: boolean) => {
        try {
            if (!silent) setLoading(true);
            const uid = await getPaperAccountId();      // Main, Lab or Real book (Portfolio picks it)

            const res = await paperFetch(`/positions/${encodeURIComponent(uid)}`);
            if (res.ok) {
                const text = await res.text();
                if (text !== lastSignature.current) {
                    const data = JSON.parse(text);
                    lastSignature.current = text;
                    setPositions(Array.isArray(data) ? data : []);
                }
            }
        } catch (error) {
            console.error("Failed to fetch positions:", error);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    const refreshPositions = useCallback(() => load(false), [load]);

    // Another account picked on Portfolio: drop the old list and load the new one now.
    useEffect(() => onPaperAccountChange(() => {
        lastSignature.current = null;
        setPositions([]);
        load(false);
    }), [load]);

    useEffect(() => {
        // Paused in the background; on return to the foreground, refresh once and resume.
        if (!appActive) return;
        // First load shows the loading state (as before); later polls are silent.
        load(started.current);
        started.current = true;
        // Poll positions every 30 seconds to keep stay in sync with auto-triggers
        const timer = setInterval(() => load(true), 30000);
        return () => clearInterval(timer);
    }, [load, appActive]);

    const value = useMemo(() => ({ positions, loading, refreshPositions }), [positions, loading, refreshPositions]);

    return (
        <PositionContext.Provider value={value}>
            {children}
        </PositionContext.Provider>
    );
};

export const usePositions = () => {
    const context = useContext(PositionContext);
    if (!context) throw new Error('usePositions must be used within a PositionProvider');
    return context;
};
