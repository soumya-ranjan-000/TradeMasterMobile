import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { MarketDataProvider } from './src/context/MarketDataContext';
import "./global.css"

export default function App() {
  return (
    <SafeAreaProvider>
      <MarketDataProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </MarketDataProvider>
    </SafeAreaProvider>
  );
}
