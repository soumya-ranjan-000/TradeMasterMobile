import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, TEST_USER_ID } from '../config';

interface SmartAlert {
    id: string;
    symbol: string;
    price: number;
    condition: 'Above' | 'Below';
    active: boolean;
    isTriggered: boolean;
    triggeredAt?: string;
    triggeredPrice?: number;
    createdAt: string;
}

interface AlertContextType {
    alerts: SmartAlert[];
    loading: boolean;
    refreshAlerts: () => Promise<void>;
    createAlert: (symbol: string, price: number, condition: string) => Promise<boolean>;
    toggleAlert: (id: string, active: boolean) => Promise<void>;
    deleteAlert: (id: string) => Promise<void>;
    markAsTriggered: (id: string, triggeredPrice: number) => Promise<void>;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [alerts, setAlerts] = useState<SmartAlert[]>([]);
    const [loading, setLoading] = useState(false);
    const [userId, setUserId] = useState<string>(TEST_USER_ID);

    const refreshAlerts = useCallback(async () => {
        try {
            setLoading(true);
            const savedId = await AsyncStorage.getItem('USER_ID');
            const uid = savedId || TEST_USER_ID;
            setUserId(uid);

            const res = await fetch(`${API_URL}/alerts/${uid}`);
            if (res.ok) {
                const data = await res.json();
                const mappedAlerts = data.map((a: any) => ({
                    id: a._id || a.id,
                    symbol: a.symbol,
                    price: a.price,
                    condition: a.condition,
                    active: a.active,
                    isTriggered: a.is_triggered,
                    triggeredAt: a.triggered_at,
                    triggeredPrice: a.triggered_price,
                    createdAt: a.created_at
                }));
                setAlerts(mappedAlerts);
            }
        } catch (error) {
            console.error("Failed to fetch alerts:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshAlerts();
    }, [refreshAlerts]);

    const createAlert = async (symbol: string, price: number, condition: string) => {
        try {
            const res = await fetch(`${API_URL}/alerts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    symbol: symbol.toUpperCase(),
                    price,
                    condition
                })
            });

            if (res.ok) {
                await refreshAlerts(); // Update cache
                return true;
            }
            return false;
        } catch (error) {
            console.error("Create alert failed:", error);
            return false;
        }
    };

    const toggleAlert = async (id: string, active: boolean) => {
        try {
            // Update local cache first (Optimistic UI)
            setAlerts(prev => prev.map(a => a.id === id ? { ...a, active } : a));

            await fetch(`${API_URL}/alerts`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    alert_id: id,
                    active
                })
            });
        } catch (error) {
            console.error("Toggle alert failed:", error);
            // Rollback on error if needed, but for simplicity we'll just re-fetch
            refreshAlerts();
        }
    };

    const deleteAlert = async (id: string) => {
        try {
            // Update local cache first
            setAlerts(prev => prev.filter(a => a.id !== id));

            await fetch(`${API_URL}/alerts/${userId}/${id}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error("Delete alert failed:", error);
            refreshAlerts();
        }
    };

    const markAsTriggered = async (id: string, triggeredPrice: number) => {
        try {
            // Update local cache
            setAlerts(prev => prev.map(a =>
                a.id === id ? { ...a, isTriggered: true, triggeredAt: new Date().toISOString(), triggeredPrice } : a
            ));

            // Inform backend
            await fetch(`${API_URL}/alerts/trigger`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    alert_id: id,
                    triggered_price: triggeredPrice
                })
            });
        } catch (error) {
            console.error("Mark as triggered failed:", error);
        }
    };

    return (
        <AlertContext.Provider value={{
            alerts,
            loading,
            refreshAlerts,
            createAlert,
            toggleAlert,
            deleteAlert,
            markAsTriggered
        }}>
            {children}
        </AlertContext.Provider>
    );
};

export const useAlerts = () => {
    const context = useContext(AlertContext);
    if (!context) throw new Error('useAlerts must be used within an AlertProvider');
    return context;
};
