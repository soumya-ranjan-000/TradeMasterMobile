import { Platform } from 'react-native';

// -----------------------------------------------------------------------------
// Service map
//
//   Paper trading  (API_URL)           orders, positions, account, watchlists,
//                                      alerts, analytics. User routes are open.
//   TradeMasterBackend (ORCHESTRATOR)  ALL market data: search, history, quotes,
//                                      market status and the live tick socket.
//                                      Requires BACKEND_API_KEY (X-API-Key).
//   Watchlist generation               intraday scanner lists. Open.
//
// The app never talks to the Breeze service directly: its key controls the
// real ICICI account, and anything bundled into the app can be extracted.
// -----------------------------------------------------------------------------

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

export const ORCHESTRATOR_URL = (isCloud ? cloudOrchestrator : localOrchestrator).replace(/\/+$/, '');
export const ORCHESTRATOR_WS_URL = ORCHESTRATOR_URL.replace('https://', 'wss://').replace('http://', 'ws://');

// SERVICE_API_KEY of the TradeMasterBackend this build points at. EXPO_PUBLIC_*
// values are compiled into the app bundle, so this key only unlocks the
// backend (market data / analysis), never the broker account.
export const BACKEND_API_KEY = process.env.EXPO_PUBLIC_BACKEND_API_KEY || '';

// Local default 8002: the paper-trading service owns 8001 (see the watchlist
// service's docker-compose.yml, which maps host 8002 -> container 8001).
const getWatchlistUrl = () => {
    if (process.env.EXPO_PUBLIC_WATCHLIST_API_URL) {
        return process.env.EXPO_PUBLIC_WATCHLIST_API_URL;
    }
    if (Platform.OS === 'android') {
        return 'http://10.0.2.2:8002/api/v1';
    }
    return 'http://localhost:8002/api/v1';
};

export const WATCHLIST_API_URL = getWatchlistUrl();
export const TEST_USER_ID = "test_user_123";
