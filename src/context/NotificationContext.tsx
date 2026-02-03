import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useAlerts } from './AlertContext';
import { useMarketData } from './MarketDataContext';
import { usePositions } from './PositionContext';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

interface NotificationContextType {
    lastTriggeredAlert: any | null;
    clearNotification: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { alerts, markAsTriggered, refreshAlerts } = useAlerts();
    const { positions, refreshPositions } = usePositions();
    const { ticks, subscribe, unsubscribe } = useMarketData();
    const [lastTriggeredAlert, setLastTriggeredAlert] = useState<any | null>(null);
    const processedAlerts = useRef<Set<string>>(new Set());
    const processedPositions = useRef<Set<string>>(new Set());
    const initialCatchupDone = useRef(false);

    // 0. Request Permissions & Initial Setup
    useEffect(() => {
        const setupNotifications = async () => {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== 'granted') {
                console.warn('Failed to get push token for push notification!');
                return;
            }

            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('default', {
                    name: 'default',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#FF231F7C',
                });
            }
        };

        setupNotifications();
    }, []);

    const showLocalNotification = async (title: string, body: string, data: any = {}) => {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data,
                sound: true,
                priority: Notifications.AndroidNotificationPriority.MAX,
            },
            trigger: null, // show immediately
        });
    };

    // 1. Initial "Welcome Back" Catchup for missed events
    useEffect(() => {
        if (alerts.length >= 0 && !initialCatchupDone.current) {
            const checkMissedEvents = async () => {
                const lastVisit = await AsyncStorage.getItem('LAST_VISIT_TIME');
                const now = new Date().toISOString();

                if (lastVisit) {
                    // Check missed Alerts
                    const missedAlerts = alerts.filter(a =>
                        a.isTriggered && a.triggeredAt && new Date(a.triggeredAt) > new Date(lastVisit)
                    );

                    // For Positions, we'd ideally check the 'Trades' history for items closed after lastVisit
                    // For now, let's focus on missed alerts and live position monitoring.

                    if (missedAlerts.length > 0) {
                        const summary = missedAlerts.map(m => `• ${m.symbol} hit ₹${m.price}`).join('\n');
                        Alert.alert("👋 Welcome Back!", `Alerts triggered while you were away:\n\n${summary}`);
                    }
                }

                await AsyncStorage.setItem('LAST_VISIT_TIME', now);
                initialCatchupDone.current = true;
            };
            checkMissedEvents();
        }
    }, [alerts]);

    // 2. Subscribe to all relevant symbols
    useEffect(() => {
        const symbols = new Set<string>();
        alerts.filter(a => a.active && !a.isTriggered).forEach(a => symbols.add(a.symbol));
        positions.forEach(p => symbols.add(p.symbol));

        symbols.forEach(sym => subscribe(sym));
        return () => symbols.forEach(sym => unsubscribe(sym));
    }, [alerts, positions, subscribe, unsubscribe]);

    // 3. Client-side monitoring logic (Alerts & Positions)
    useEffect(() => {
        // Monitoring Alerts
        alerts.forEach(alert => {
            if (!alert.active || alert.isTriggered || processedAlerts.current.has(alert.id)) return;
            const tick = ticks[`NSE:${alert.symbol.split('.')[0].toUpperCase()}`];
            if (tick && tick.ltp > 0) {
                let triggered = false;
                if (alert.condition === 'Above' && tick.ltp >= alert.price) triggered = true;
                if (alert.condition === 'Below' && tick.ltp <= alert.price) triggered = true;

                if (triggered) {
                    processedAlerts.current.add(alert.id);
                    markAsTriggered(alert.id, tick.ltp);
                    setLastTriggeredAlert(alert);

                    const title = "🚨 Smart Alert!";
                    const message = `${alert.symbol} hit ₹${alert.price} (LTP: ₹${tick.ltp.toFixed(2)})`;

                    showLocalNotification(title, message);
                    Alert.alert(title, message);
                }
            }
        });

        // Monitoring Positions (SL/Target)
        positions.forEach(pos => {
            if (processedPositions.current.has(pos.position_id)) return;
            const tick = ticks[`NSE:${pos.symbol.split('.')[0].toUpperCase()}`];

            if (tick && tick.ltp > 0) {
                const ltp = tick.ltp;
                let reason = "";

                // Stop Loss Hit
                if (pos.stop_loss) {
                    if (pos.quantity > 0 && ltp <= pos.stop_loss) reason = "Stop Loss";
                    else if (pos.quantity < 0 && ltp >= pos.stop_loss) reason = "Stop Loss";
                }

                // Target Hit
                if (!reason && pos.target) {
                    if (pos.quantity > 0 && ltp >= pos.target) reason = "Target";
                    else if (pos.quantity < 0 && ltp <= pos.target) reason = "Target";
                }

                if (reason) {
                    processedPositions.current.add(pos.position_id);

                    const title = reason === "Target" ? "🎯 Target Achieved!" : "🛡️ Stop Loss Hit";
                    const message = `Position for ${pos.symbol} triggered at ₹${ltp.toFixed(2)}`;

                    showLocalNotification(title, message);
                    Alert.alert(
                        title,
                        `Position for ${pos.symbol} has been triggered for automatic closure at ₹${ltp.toFixed(2)} (${reason} was ₹${reason === "Target" ? pos.target?.toFixed(2) : pos.stop_loss?.toFixed(2)})`,
                        [{ text: "OK", onPress: () => refreshPositions() }]
                    );
                }
            }
        });
    }, [ticks, alerts, positions]);

    // 4. Update last visit time periodically
    useEffect(() => {
        const timer = setInterval(() => {
            AsyncStorage.setItem('LAST_VISIT_TIME', new Date().toISOString());
        }, 300000);
        return () => clearInterval(timer);
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
