/**
 * Shared building blocks so every screen has the same header, cards, labels,
 * loading skeletons and empty/error states.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, ViewStyle, StyleProp, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, RefreshCw, CloudOff } from '../icons';
import { colors } from '../theme';
import { haptic } from '../haptics';

// --- Screen header ----------------------------------------------------------------
/**
 * Large left-aligned title (iOS large-title / Material top app bar pattern).
 * `onBack` adds a back button above the title; `right` takes icon buttons.
 */
export function ScreenHeader({ title, subtitle, onBack, right, compact = false }: {
    title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode; compact?: boolean;
}) {
    const insets = useSafeAreaInsets();
    return (
        <View className="px-5 pb-3" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
            {(onBack || (compact && right)) && (
                <View className="flex-row items-center justify-between mb-2">
                    {onBack ? <IconButton label="Back" onPress={onBack}><ChevronLeft size={22} color={colors.textPrimary} /></IconButton> : <View />}
                    {compact && right ? <View className="flex-row gap-2">{right}</View> : null}
                </View>
            )}
            <View className="flex-row items-end justify-between">
                <View className="flex-1 mr-3">
                    <Text accessibilityRole="header" className={`text-text-primary font-black ${compact ? 'text-2xl' : 'text-[28px] leading-9'}`} numberOfLines={1}>{title}</Text>
                    {!!subtitle && <Text className="text-text-muted text-[13px] font-semibold mt-0.5" numberOfLines={1}>{subtitle}</Text>}
                </View>
                {!compact && right ? <View className="flex-row gap-2">{right}</View> : null}
            </View>
        </View>
    );
}

/** 44x44 touch target (HIG minimum) with an accessibility label. */
export function IconButton({ label, onPress, children, tone = 'default', disabled }: {
    label: string; onPress?: () => void; children: React.ReactNode; tone?: 'default' | 'primary'; disabled?: boolean;
}) {
    return (
        <Pressable
            accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
            hitSlop={6}
            className={`w-11 h-11 rounded-2xl items-center justify-center border ${tone === 'primary' ? 'bg-primary border-primary' : 'bg-surface border-border'} active:opacity-70`}
            style={{ opacity: disabled ? 0.4 : 1 }}
        >
            {children}
        </Pressable>
    );
}

// --- Cards & labels ------------------------------------------------------------------
export function Card({ children, className = '', style, onPress }: {
    children: React.ReactNode; className?: string; style?: StyleProp<ViewStyle>; onPress?: () => void;
}) {
    const cls = `bg-surface rounded-3xl border border-border p-4 ${className}`;
    return onPress
        ? <Pressable onPress={onPress} className={`${cls} active:opacity-80`} style={style}>{children}</Pressable>
        : <View className={cls} style={style}>{children}</View>;
}

/** Small section heading: 12px, semibold, muted. */
export const SectionLabel = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
    <View className="flex-row items-center justify-between mb-2 mt-1">
        <Text className="text-text-muted text-xs font-bold uppercase tracking-wider">{children}</Text>
        {right}
    </View>
);

// --- Segmented control ---------------------------------------------------------------
export function Segmented<T extends string>({ options, value, onChange, labels }: {
    options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>>;
}) {
    return (
        <View className="flex-row bg-surface border border-border rounded-2xl p-1" accessibilityRole="tablist">
            {options.map(o => {
                const on = o === value;
                return (
                    <Pressable key={o} onPress={() => { if (o !== value) haptic.select(); onChange(o); }} accessibilityRole="tab" accessibilityState={{ selected: on }}
                        className={`flex-1 items-center py-2 rounded-xl ${on ? 'bg-surfaceHighlight' : ''}`}>
                        <Text className={`text-[13px] font-bold ${on ? 'text-text-primary' : 'text-text-muted'}`}>{labels?.[o] ?? o}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

// --- Loading -------------------------------------------------------------------------
/** Pulsing placeholder block. */
export function Skeleton({ w, h = 14, r = 8, style }: { w?: number | `${number}%`; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
    const a = useRef(new Animated.Value(0.45)).current;
    useEffect(() => {
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(a, { toValue: 0.9, duration: 700, useNativeDriver: true }),
            Animated.timing(a, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [a]);
    return <Animated.View style={[{ width: w ?? '100%', height: h, borderRadius: r, backgroundColor: colors.surfaceHighlight, opacity: a }, style]} />;
}

/** A card-shaped skeleton row (avatar + two lines + value). */
export const SkeletonRow = () => (
    <View className="bg-surface rounded-3xl border border-border p-4 mb-3 flex-row items-center">
        <Skeleton w={44} h={44} r={14} />
        <View className="flex-1 ml-3">
            <Skeleton w="45%" h={14} />
            <Skeleton w="30%" h={10} style={{ marginTop: 8 }} />
        </View>
        <View className="items-end">
            <Skeleton w={70} h={14} />
            <Skeleton w={44} h={10} style={{ marginTop: 8 }} />
        </View>
    </View>
);

// --- Empty / error -------------------------------------------------------------------
export function EmptyState({ icon, title, body, action, onAction }: {
    icon?: React.ReactNode; title: string; body?: string; action?: string; onAction?: () => void;
}) {
    return (
        <View className="items-center px-8 py-12">
            {icon && <View className="w-14 h-14 rounded-2xl bg-surface border border-border items-center justify-center mb-4">{icon}</View>}
            <Text className="text-text-primary text-base font-bold text-center">{title}</Text>
            {!!body && <Text className="text-text-muted text-[13px] text-center mt-1.5 leading-5">{body}</Text>}
            {!!action && onAction && (
                <Pressable onPress={onAction} accessibilityRole="button"
                    className="mt-5 px-5 py-2.5 rounded-full bg-primary/10 border border-primary/30 active:opacity-70">
                    <Text className="text-primary font-bold text-[13px]">{action}</Text>
                </Pressable>
            )}
        </View>
    );
}

export const ErrorState = ({ title = "Couldn't load this", body, onRetry }: { title?: string; body?: string; onRetry?: () => void }) => (
    <EmptyState icon={<CloudOff size={24} color={colors.textMuted} />} title={title} body={body}
        action={onRetry ? 'Try again' : undefined} onAction={onRetry} />
);

/** "Updated 2 min ago" line with an optional refresh affordance. */
export const UpdatedLine = ({ text, onRefresh }: { text: string; onRefresh?: () => void }) => (
    <Pressable onPress={onRefresh} disabled={!onRefresh} className="flex-row items-center self-start py-1" accessibilityRole={onRefresh ? 'button' : undefined}>
        <Text className="text-text-muted text-xs font-semibold">{text}</Text>
        {onRefresh && <RefreshCw size={11} color={colors.textMuted} style={{ marginLeft: 6 }} />}
    </Pressable>
);

// --- Confirmation ----------------------------------------------------------------------
/** Confirm before acting. Alert.alert with buttons is a no-op on web, so web uses window.confirm. */
export const confirmAction = (title: string, message: string, yes: string, onYes: () => void, destructive = false) => {
    if (Platform.OS === 'web') {
        if (window.confirm(`${title}\n\n${message}`)) onYes();
        return;
    }
    Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: yes, style: destructive ? 'destructive' : 'default', onPress: onYes }]);
};

// --- Motion ---------------------------------------------------------------------------
/** Fades and lifts its children in on mount (180 ms). Give it a `key` to replay on content change. */
export function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
    const a = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(a, { toValue: 1, duration: 180, delay, useNativeDriver: true }).start();
    }, [a, delay]);
    return (
        <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }}>
            {children}
        </Animated.View>
    );
}
