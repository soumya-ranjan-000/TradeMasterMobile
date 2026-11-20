import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import { colors } from '../theme';

/**
 * Slides in from the top while the device has no connection. Screens keep
 * showing their cached data (watchlist prices, scanner results), so the
 * banner says that instead of blocking anything.
 */
export default function OfflineBanner() {
    const insets = useSafeAreaInsets();
    const [offline, setOffline] = useState(false);
    const y = useRef(new Animated.Value(-80)).current;

    useEffect(() => NetInfo.addEventListener(state => {
        // isInternetReachable is null while unknown: only an explicit false/disconnect counts.
        setOffline(state.isConnected === false || state.isInternetReachable === false);
    }), []);

    useEffect(() => {
        Animated.timing(y, { toValue: offline ? 0 : -80, duration: 220, useNativeDriver: true }).start();
    }, [offline, y]);

    return (
        <Animated.View pointerEvents="none" accessibilityLiveRegion="polite"
            style={{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 100, transform: [{ translateY: y }] }}>
            <View className="flex-row items-center justify-center px-4 pb-2"
                style={{ paddingTop: Math.max(insets.top, 8) + 4, backgroundColor: colors.warning }}>
                <WifiOff size={14} color={colors.background} />
                <Text className="text-[13px] font-bold ml-2" style={{ color: colors.background }}>
                    {offline ? "You're offline · showing saved data" : ''}
                </Text>
            </View>
        </Animated.View>
    );
}
