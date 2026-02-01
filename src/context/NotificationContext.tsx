import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, TEST_USER_ID } from '../config';

interface NotificationContextType {
    lastTriggeredAlert: any | null;
    clearNotification: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [lastTriggeredAlert, setLastTriggeredAlert] = useState<any | null>(null);
    const lastCheckedRef = useRef<string>(new Date().toISOString());
    const pollTimer = useRef<NodeJS.Timeout | null>(null);

    const checkAlerts = async () => {
        try {
            const userId = await AsyncStorage.getItem('USER_ID') || TEST_USER_ID;
            const res = await fetch(`${API_URL}/alerts/${userId}`);
            if (res.ok) {
                const alerts = await res.json();

                // Find alerts that were triggered AFTER our last check
                const newTriggers = alerts.filter((a: any) =>
                    a.is_triggered &&
                    new Date(a.triggered_at) > new Date(lastCheckedRef.current)
                );

                if (newTriggers.length > 0) {
                    const latest = newTriggers[0];
                    setLastTriggeredAlert(latest);

                    // Show a native alert popup as well
                    Alert.alert(
                        "🚨 Smart Alert Triggered!",
                        `${latest.symbol} has hit your ${latest.condition} target of ₹${latest.price}.\nTriggered at ₹${latest.triggered_price.toFixed(2)}`,
                        [{ text: "OK", onPress: () => setLastTriggeredAlert(null) }]
                    );

                    // Update last checked to most recent triggered_at to avoid duplicate popups
                    const mostRecent = newTriggers.reduce((prev: any, current: any) =>
                        (new Date(current.triggered_at) > new Date(prev.triggered_at)) ? current : prev
                    );
                    lastCheckedRef.current = mostRecent.triggered_at;
                }
            }
        } catch (error) {
            console.error("Alert polling failed:", error);
        }
    };

    useEffect(() => {
        // Start polling every 15 seconds for triggered alerts
        pollTimer.current = setInterval(checkAlerts, 15000);
        return () => {
            if (pollTimer.current) clearInterval(pollTimer.current);
        };
    }, []);

    const clearNotification = () => setLastTriggeredAlert(null);

    return (
        <NotificationContext.Provider value={{ lastTriggeredAlert, clearNotification }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
    return context;
};
