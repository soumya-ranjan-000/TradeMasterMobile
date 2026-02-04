import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, PieChart, Activity, BookOpen, User, Zap, Search } from 'lucide-react-native';

import DashboardScreen from '../screens/DashboardScreen';
import WatchlistScreen from '../screens/WatchlistScreen';
import IntradayScreen from '../screens/IntradayScreen';
import DetailedAnalysisScreen from '../screens/DetailedAnalysisScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import StockDetailScreen from '../screens/StockDetailScreen';
import TradeScreen from '../screens/TradeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import LoginScreen from '../screens/LoginScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AlertsScreen from '../screens/AlertsScreen';
import PerformanceScreen from '../screens/PerformanceScreen';

// Types for Navigation
export type RootStackParamList = {
    Login: undefined;
    MainTabs: undefined;
    StockDetail: { symbol: string };
    Trade: { symbol: string; side: 'BUY' | 'SELL' };
    Alerts: undefined;
    Performance: undefined;
    DetailedAnalysis: { symbol: string; analysis: any };
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

const MainTabs = () => {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size, focused }) => {
                    let Icon;
                    if (route.name === 'Dashboard') Icon = Home;
                    else if (route.name === 'Watchlist') Icon = Search;
                    else if (route.name === 'Intraday') Icon = Zap;
                    else if (route.name === 'Portfolio') Icon = PieChart;
                    else if (route.name === 'Journal') Icon = BookOpen;
                    else if (route.name === 'Profile') Icon = User;
                    else return null;

                    return (
                        <View className="items-center justify-center pt-2">
                            <View
                                className={`w-12 h-12 items-center justify-center`}
                            >
                                <Icon
                                    size={26}
                                    color={focused ? '#00E0A1' : '#94A3B8'}
                                    strokeWidth={focused ? 2.2 : 1.8}
                                />
                            </View>
                            {focused && (
                                <View className="absolute -bottom-1 w-6 h-1 rounded-full bg-primary" />
                            )}
                        </View>
                    );
                },
                tabBarActiveTintColor: '#00E0A1',
                tabBarInactiveTintColor: '#94A3B8',
                tabBarStyle: {
                    backgroundColor: '#1E2329',
                    height: 80,
                    borderTopWidth: 1.2,
                    borderTopColor: 'rgba(255,255,255,0.08)',
                    paddingBottom: 15,
                    paddingTop: 5,
                },
                headerShown: false,
                tabBarShowLabel: false,
            })}
        >
            <Tab.Screen name="Dashboard" component={DashboardScreen} />
            <Tab.Screen name="Watchlist" component={WatchlistScreen} />
            <Tab.Screen name="Intraday" component={IntradayScreen} />
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

const RootNavigator = () => {
    return (
        <NavigationContainer theme={TradeMasterTheme}>
            <Stack.Navigator
                initialRouteName="Login"
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
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default RootNavigator;
