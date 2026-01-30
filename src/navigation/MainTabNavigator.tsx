import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import DashboardScreen from '../screens/DashboardScreen';
import WatchlistScreen from '../screens/WatchlistScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import { View, Text } from 'react-native';

const Tab = createBottomTabNavigator();

// Simple icon placeholders until we add an icon library
const IconPlaceholder = ({ name, color }: { name: string; color: string }) => (
    <View style={{ width: 24, height: 24, backgroundColor: color, borderRadius: 12 }} />
);

const MainTabNavigator = () => {
    return (
        <NavigationContainer>
            <Tab.Navigator
                screenOptions={({ route }) => ({
                    tabBarIcon: ({ focused, color, size }) => {
                        return <IconPlaceholder name={route.name} color={color} />;
                    },
                    tabBarActiveTintColor: '#2563eb', // Blue-600
                    tabBarInactiveTintColor: 'gray',
                })}
            >
                <Tab.Screen name="Dashboard" component={DashboardScreen} />
                <Tab.Screen name="Watchlist" component={WatchlistScreen} />
                <Tab.Screen name="Portfolio" component={PortfolioScreen} />
            </Tab.Navigator>
        </NavigationContainer>
    );
};

export default MainTabNavigator;
