import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { MarketDataProvider } from './src/context/MarketDataContext';
import { NotificationProvider } from './src/context/NotificationContext';
import "./global.css"

export default function App() {
  return (
    <SafeAreaProvider>
      <NotificationProvider>
        <MarketDataProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </MarketDataProvider>
      </NotificationProvider>
    </SafeAreaProvider>
  );
}
