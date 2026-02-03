import { Platform } from 'react-native';

const getBaseUrl = () => {
    // Priority: Env variable > Platform-specific dev default
    if (process.env.EXPO_PUBLIC_PAPER_BACKEND_URL) {
        return process.env.EXPO_PUBLIC_PAPER_BACKEND_URL;
    }

    if (Platform.OS === 'android') {
        return 'http://10.0.2.2:8001/api/v1';
    }
    return 'http://localhost:8001/api/v1';
};

export const API_URL = getBaseUrl();

// Orchestrator Selection
const isCloud = process.env.EXPO_PUBLIC_APP_ENV === 'cloud';
const localOrchestrator = process.env.EXPO_PUBLIC_LOCAL_ORCHESTRATOR_URL || "http://localhost:8000";
const cloudOrchestrator = process.env.EXPO_PUBLIC_CLOUD_ORCHESTRATOR_URL || "https://trademasterbackend.onrender.com";

export const ORCHESTRATOR_URL = isCloud ? cloudOrchestrator : localOrchestrator;
export const ORCHESTRATOR_WS_URL = ORCHESTRATOR_URL.replace('https://', 'wss://').replace('http://', 'ws://');
export const BREEZE_API_URL = process.env.EXPO_PUBLIC_BREEZE_API_URL || "https://icici-dirct-breeze-api-interface.onrender.com";
export const BREEZE_WS_URL = BREEZE_API_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/ticks';

const getWatchlistUrl = () => {
    if (process.env.EXPO_PUBLIC_WATCHLIST_API_URL) {
        return process.env.EXPO_PUBLIC_WATCHLIST_API_URL;
    }
    if (Platform.OS === 'android') {
        return 'http://10.0.2.2:8001/api/v1';
    }
    return 'http://localhost:8001/api/v1';
};

export const WATCHLIST_API_URL = getWatchlistUrl();
export const TEST_USER_ID = "test_user_123";
