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
export const BREEZE_API_URL = process.env.EXPO_PUBLIC_BREEZE_API_URL || "https://icici-dirct-breeze-api-interface.onrender.com";
export const BREEZE_WS_URL = BREEZE_API_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/ticks';
export const TEST_USER_ID = "test_user_123";
