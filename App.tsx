import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { MarketDataProvider } from './src/context/MarketDataContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { AlertProvider } from './src/context/AlertContext';
import { PositionProvider } from './src/context/PositionContext';
import OfflineBanner from './src/components/OfflineBanner';
import { ToastHost } from './src/components/Toast';
import "./global.css"

export default function App() {
  return (
    <SafeAreaProvider>
      <AlertProvider>
        <PositionProvider>
          <MarketDataProvider>
            <NotificationProvider>
              <StatusBar style="auto" />
              <RootNavigator />
              <OfflineBanner />
              <ToastHost />
            </NotificationProvider>
          </MarketDataProvider>
        </PositionProvider>
      </AlertProvider>
    </SafeAreaProvider>
  );
}
