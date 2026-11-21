import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, XCircle, Info } from '../icons';
import { colors } from '../theme';

/**
 * App-wide toast: `toast.success('Order placed', 'Bought 10 RELIANCE…')`.
 * Replaces Alert.alert for feedback (which is a no-op on web) and survives
 * navigation because the host is mounted once in App.tsx.
 */
type Tone = 'success' | 'error' | 'info';
interface ToastMsg { id: number; tone: Tone; title: string; body?: string }

let listener: ((m: ToastMsg) => void) | null = null;
let seq = 0;
const show = (tone: Tone, title: string, body?: string) => listener?.({ id: ++seq, tone, title, body });
export const toast = {
    success: (title: string, body?: string) => show('success', title, body),
    error: (title: string, body?: string) => show('error', title, body),
    info: (title: string, body?: string) => show('info', title, body),
};

const TONE = {
    success: { color: colors.success, Icon: CheckCircle2 },
    error: { color: colors.error, Icon: XCircle },
    info: { color: colors.blue, Icon: Info },
};

export function ToastHost() {
    const insets = useSafeAreaInsets();
    const [msg, setMsg] = useState<ToastMsg | null>(null);
    const a = useRef(new Animated.Value(0)).current;
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hide = () => Animated.timing(a, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setMsg(null));

    useEffect(() => {
        listener = (m) => {
            setMsg(m);
            Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: true }).start();
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(hide, m.tone === 'error' ? 6000 : 4000);
        };
        return () => { listener = null; if (timer.current) clearTimeout(timer.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!msg) return null;
    const { color, Icon } = TONE[msg.tone];
    return (
        <Animated.View accessibilityLiveRegion="polite"
            style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 8) + 78, zIndex: 200,
                     opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
            <Pressable onPress={hide} accessibilityRole="alert" accessibilityHint="Dismisses this message"
                className="flex-row items-start bg-surfaceHighlight rounded-2xl border px-4 py-3"
                style={{ borderColor: `${color}66`, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 }}>
                <Icon size={18} color={color} style={{ marginTop: 1 }} />
                <View className="flex-1 ml-2.5">
                    <Text className="text-text-primary font-bold text-[14px]">{msg.title}</Text>
                    {!!msg.body && <Text className="text-text-secondary text-[13px] mt-0.5 leading-5">{msg.body}</Text>}
                </View>
            </Pressable>
        </Animated.View>
    );
}
