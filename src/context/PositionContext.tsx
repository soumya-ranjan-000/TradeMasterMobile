import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, TEST_USER_ID } from '../config';

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

    const refreshPositions = useCallback(async () => {
        try {
            setLoading(true);
            const savedId = await AsyncStorage.getItem('USER_ID');
            const uid = savedId || TEST_USER_ID;

            const res = await fetch(`${API_URL}/positions/${uid}`);
            if (res.ok) {
                const data = await res.json();
                setPositions(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error("Failed to fetch positions:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshPositions();
        // Poll positions every 30 seconds to keep stay in sync with auto-triggers
        const timer = setInterval(refreshPositions, 30000);
        return () => clearInterval(timer);
    }, [refreshPositions]);

    return (
        <PositionContext.Provider value={{ positions, loading, refreshPositions }}>
            {children}
        </PositionContext.Provider>
    );
};

export const usePositions = () => {
    const context = useContext(PositionContext);
    if (!context) throw new Error('usePositions must be used within a PositionProvider');
    return context;
};
