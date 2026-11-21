import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, PieChart, BookOpen, User, Radar, Search } from '../icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { restoreSession, onSignedOut } from '../auth';
import { toast } from '../components/Toast';

import DashboardScreen from '../screens/DashboardScreen';
import WatchlistScreen from '../screens/WatchlistScreen';
import DetailedAnalysisScreen from '../screens/DetailedAnalysisScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import StockDetailScreen from '../screens/StockDetailScreen';
import TradeScreen from '../screens/TradeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import LoginScreen from '../screens/LoginScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AlertsScreen from '../screens/AlertsScreen';
import PerformanceScreen from '../screens/PerformanceScreen';
import ScannerScreen from '../screens/ScannerScreen';
import ScanLoginScreen from '../screens/ScanLoginScreen';
import BriefingScreen from '../screens/BriefingScreen';

// Types for Navigation
export type RootStackParamList = {
    Login: undefined;
    MainTabs: undefined;
    StockDetail: { symbol: string };
    Trade: { symbol: string; side: 'BUY' | 'SELL' };
    Alerts: undefined;
    Performance: undefined;
    Scanner: undefined;
    DetailedAnalysis: { symbol: string; analysis: any };
    ScanLogin: undefined;
    Briefing: undefined;
};

export type MainTabParamList = {
    Dashboard: undefined;
    Watchlist: undefined;
    Intraday: undefined;
    Portfolio: undefined;
    Journal: undefined;
    Profile: undefined;
    StockDetail: { symbol: string };
    Trade: { symbol: string; side: 'BUY' | 'SELL' };
    Alerts: undefined;
    Performance: undefined;
    Scanner: undefined;
    DetailedAnalysis: { symbol: string; analysis: any };
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TradeMasterTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        primary: '#00E0A1',
        background: '#0E1116',
        card: '#1C1F26',
        text: '#F3F4F6',
        border: '#2A2E39',
        notification: '#FF4D4D',
    },
};

const TAB_LABELS: Record<string, string> = {
    Dashboard: 'Home', Watchlist: 'Search', Scanner: 'Scanner', Journal: 'Journal', Portfolio: 'Portfolio',
};

const MainTabs = () => {
    const insets = useSafeAreaInsets();
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                // Labelled tabs with a pill behind the active icon (Material 3 navigation bar).
                tabBarIcon: ({ focused }) => {
                    let Icon;
                    if (route.name === 'Dashboard') Icon = Home;
                    else if (route.name === 'Watchlist') Icon = Search;
                    else if (route.name === 'Scanner') Icon = Radar;
                    else if (route.name === 'Portfolio') Icon = PieChart;
                    else if (route.name === 'Journal') Icon = BookOpen;
                    else if (route.name === 'Profile') Icon = User;
                    else return null;
                    return (
                        <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                                       backgroundColor: focused ? 'rgba(0,224,161,0.14)' : 'transparent' }}>
                            <Icon size={21} color={focused ? colors.primary : colors.textMuted} strokeWidth={focused ? 2.3 : 1.9} />
                        </View>
                    );
                },
                tabBarLabel: TAB_LABELS[route.name] ?? route.name,
                tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
                tabBarActiveTintColor: colors.textPrimary,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarStyle: {
                    backgroundColor: colors.tabBar,
                    height: 62 + Math.max(insets.bottom, 8),
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    paddingBottom: Math.max(insets.bottom, 8),
                    paddingTop: 8,
                },
                headerShown: false,
                tabBarShowLabel: true,
            })}
        >
            <Tab.Screen name="Dashboard" component={DashboardScreen} />
            <Tab.Screen name="Watchlist" component={WatchlistScreen} />
            {/* Scanner: the one place for setups (it replaced the Intraday watchlist tab). */}
            <Tab.Screen name="Scanner" component={ScannerScreen} />
            <Tab.Screen name="Journal" component={CalendarScreen} />
            <Tab.Screen name="Portfolio" component={PortfolioScreen} />

            {/* Hidden Tabs (to keep Navbar visible) */}
            <Tab.Screen
                name="StockDetail"
                component={StockDetailScreen}
                options={{
                    tabBarItemStyle: { display: 'none' },
                }}
            />
            <Tab.Screen
                name="Trade"
                component={TradeScreen}
                options={{
                    tabBarItemStyle: { display: 'none' },
                }}
            />
            <Tab.Screen
                name="DetailedAnalysis"
                component={DetailedAnalysisScreen}
                options={{
                    tabBarItemStyle: { display: 'none' },
                }}
            />
            <Tab.Screen
                name="Alerts"
                component={AlertsScreen}
                options={{
                    tabBarItemStyle: { display: 'none' },
                }}
            />
            <Tab.Screen
                name="Performance"
                component={PerformanceScreen}
                options={{
                    tabBarItemStyle: { display: 'none' },
                }}
            />
            <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{
                    tabBarItemStyle: { display: 'none' },
                }}
            />
        </Tab.Navigator>
    );
};

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const RootNavigator = () => {
    // Signed in already? Decided once at start from the stored token (see auth.restoreSession).
    const [initialRoute, setInitialRoute] = useState<'Login' | 'MainTabs' | null>(null);

    useEffect(() => {
        restoreSession()
            .then(state => setInitialRoute(state === 'signed-in' ? 'MainTabs' : 'Login'))
            .catch(() => setInitialRoute('Login'));
    }, []);

    // Any paper-service 401 (token expired/revoked) lands here: back to Login.
    // The startup check now runs in the background, so a 401 can arrive before the
    // navigator is ready: it's held and applied in onReady.
    const pendingSignOut = useRef(false);
    const goToLogin = useCallback(() => {
        if (!navigationRef.isReady()) { pendingSignOut.current = true; return; }
        pendingSignOut.current = false;
        const root = navigationRef.getRootState();
        if (root?.routes?.[root.index ?? 0]?.name === 'Login') return;
        toast.info('Signed out', 'Your session ended. Sign in again with your PIN.');
        navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
    }, []);
    useEffect(() => onSignedOut(goToLogin), [goToLogin]);

    if (!initialRoute) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.primary} />
            </View>
        );
    }

    return (
        <NavigationContainer theme={TradeMasterTheme} ref={navigationRef}
            onReady={() => { if (pendingSignOut.current) goToLogin(); }}>
            <Stack.Navigator
                initialRouteName={initialRoute}
                screenOptions={{
                    headerStyle: {
                        backgroundColor: '#1C1F26',
                    },
                    headerTintColor: '#F3F4F6',
                    headerTitleStyle: {
                        fontWeight: 'bold',
                    },
                    headerShadowVisible: false,
                    contentStyle: {
                        backgroundColor: '#0E1116',
                    }
                }}
            >
                <Stack.Screen
                    name="Login"
                    component={LoginScreen}
                    options={{ headerShown: false }}
                />
                <Stack.Screen
                    name="MainTabs"
                    component={MainTabs}
                    options={{ headerShown: false }}
                />
                <Stack.Screen
                    name="DetailedAnalysis"
                    component={DetailedAnalysisScreen}
                    options={{ headerShown: false }}
                />
                <Stack.Screen
                    name="Alerts"
                    component={AlertsScreen}
                    options={{ headerShown: false }}
                />
                <Stack.Screen
                    name="Performance"
                    component={PerformanceScreen}
                    options={{ headerShown: false }}
                />
                <Stack.Screen
                    name="ScanLogin"
                    component={ScanLoginScreen}
                    options={{ headerShown: false }}
                />
                <Stack.Screen
                    name="Briefing"
                    component={BriefingScreen}
                    options={{ headerShown: false }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default RootNavigator;
