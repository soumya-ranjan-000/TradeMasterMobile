import { Platform } from 'react-native';

const getBaseUrl = () => {
    if (Platform.OS === 'android') {
        return 'http://10.0.2.2:8001/api/v1';
    } else if (Platform.OS === 'ios') {
        return 'http://localhost:8001/api/v1';
    } else {
        return 'http://localhost:8001/api/v1'; // Web
    }
};

export const API_URL = getBaseUrl(); // 8001
export const BREEZE_API_URL = "https://icici-dirct-breeze-api-interface.onrender.com"; // Cloud Deployed
export const TEST_USER_ID = "test_user_123";
