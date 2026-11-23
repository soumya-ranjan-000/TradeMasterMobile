/**
 * ICICI Breeze session, renewed from the phone.
 *
 * The session expires daily. "Log in to ICICI" opens the ICICI login inside the
 * app; when ICICI sends the browser on with `?apisession=…`, the screen catches
 * that address before it loads, hands the value to the backend (which relays it
 * to the Breeze service) and shows the fresh status. If ICICI won't log in
 * inside the app, open it in the browser and paste the value (or the whole
 * address) instead.
 */
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Linking, ScrollView, StatusBar, RefreshControl } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertTriangle, CheckCircle2, CloudOff, KeyRound, X } from '../icons';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ApiError, apiSessionFrom, broker, type BrokerSession } from '../api';
import { ScreenHeader, Card, SectionLabel } from '../ui';
import { colors } from '../theme';
import { toast } from '../components/Toast';
import { haptic } from '../haptics';
import { ago } from '../format';

const LOOK: Record<BrokerSession['state'], { label: string; color: string; Icon: typeof CheckCircle2 }> = {
    live: { label: 'Live', color: colors.success, Icon: CheckCircle2 },
    expired: { label: 'Expired', color: colors.warning, Icon: AlertTriangle },
    not_set: { label: 'Not set', color: colors.warning, Icon: KeyRound },
    unreachable: { label: "Can't check", color: colors.textMuted, Icon: CloudOff },
};

/** What to tell the user when a broker call fails. */
export const brokerError = (e: unknown): string => {
    if (e instanceof ApiError) {
        if (e.status === 401) return 'Your sign-in has expired. Sign in again, then retry.';
        if (e.status === 403) return 'This Trader ID is not allowed to change the broker session.';
        return e.message;
    }
    return e instanceof Error ? e.message : String(e);
};

const hoursLeft = (s: number | null) =>
    s == null ? null : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.max(1, Math.round(s / 60))} min`;

const BrokerSessionScreen = () => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [status, setStatus] = useState<BrokerSession | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loginUrl, setLoginUrl] = useState<string | null>(null);   // set = in-app login open
    const [opening, setOpening] = useState<'app' | 'browser' | null>(null);
    const [applying, setApplying] = useState(false);
    const [pasted, setPasted] = useState('');
    const captured = useRef(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setStatus(await broker.status());
            setError(null);
        } catch (e) {
            setError(brokerError(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const apply = useCallback(async (token: string) => {
        setApplying(true);
        try {
            const s = await broker.update(token);
            setStatus(s);
            setPasted('');
            setError(null);
            haptic.success();
            toast.success('ICICI session updated', s.state === 'live' ? 'Real-time broker data is back on.' : s.message);
        } catch (e) {
            haptic.error();
            setPasted(token);                    // keep it so a retry is one tap
            toast.error("Couldn't update the session", brokerError(e));
        } finally {
            setApplying(false);
        }
    }, []);

    const openLogin = async (where: 'app' | 'browser') => {
        setOpening(where);
        try {
            const { login_url } = await broker.loginUrl();
            if (where === 'app') {
                captured.current = false;
                setLoginUrl(login_url);
            } else {
                await Linking.openURL(login_url);
            }
        } catch (e) {
            toast.error("Couldn't open the ICICI login", brokerError(e));
        } finally {
            setOpening(null);
        }
    };

    /** ICICI is sending the browser on with the new session: take it, close the login, apply it. */
    const catchSession = (url: string): boolean => {
        const token = apiSessionFrom(url);
        if (!token) return false;
        if (!captured.current) {
            captured.current = true;
            setLoginUrl(null);
            apply(token);
        }
        return true;
    };

    const submitPasted = () => {
        const token = apiSessionFrom(pasted) ?? pasted.trim();
        if (!/^[A-Za-z0-9]{4,128}$/.test(token)) {
            toast.error('Not a session value', 'Paste the apisession value, or the whole address ICICI sent you to.');
            return;
        }
        apply(token);
    };

    const look = status ? LOOK[status.state] : null;
    const left = hoursLeft(status?.saved_for_s ?? null);

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" backgroundColor={colors.background} />
            <ScreenHeader title="ICICI Breeze session" subtitle="Live broker data for the app" onBack={() => navigation.goBack()} compact />

            <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={loading && !!status} onRefresh={load} tintColor={colors.primary} />}>

                <Card className="mb-5">
                    {!status && loading ? (
                        <View className="py-6 items-center"><ActivityIndicator color={colors.primary} /></View>
                    ) : status && look ? (
                        <View accessibilityLiveRegion="polite">
                            <View className="flex-row items-center">
                                <look.Icon size={22} color={look.color} />
                                <Text className="text-lg font-black ml-2" style={{ color: look.color }}>{look.label}</Text>
                            </View>
                            <Text className="text-text-secondary text-sm mt-2 leading-5">{status.message}</Text>
                            {!!status.token_masked && (
                                <Text className="text-text-muted text-xs mt-2" style={{ fontVariant: ['tabular-nums'] }}>
                                    Session {status.token_masked}{status.state === 'live' && left ? ` · saved for another ${left}` : ''}
                                </Text>
                            )}
                            {!!status.detail && status.state !== 'live' && (
                                <Text className="text-text-muted text-xs mt-1">ICICI said: {status.detail}</Text>
                            )}
                            <Text className="text-text-muted text-[11px] mt-2">Checked {ago(status.checked_at)} · pull down to refresh</Text>
                        </View>
                    ) : (
                        <Text className="text-text-secondary text-sm">{error || 'Status unavailable.'}</Text>
                    )}
                    {!!error && !!status && <Text className="text-error text-xs mt-2">{error}</Text>}
                </Card>

                <Pressable onPress={() => openLogin('app')} disabled={!!opening || applying} accessibilityRole="button"
                    className="py-4 rounded-2xl items-center bg-primary active:opacity-80 mb-3"
                    style={{ opacity: opening || applying ? 0.6 : 1 }}>
                    {opening === 'app' || applying
                        ? <ActivityIndicator color={colors.background} />
                        : <Text className="text-background font-black text-[15px]">
                            {status?.state === 'live' ? 'Renew: log in to ICICI' : 'Log in to ICICI'}
                        </Text>}
                </Pressable>
                <Text className="text-text-muted text-xs leading-4 mb-6">
                    ICICI asks for your user ID, password and OTP. When you finish, the app picks up the new session
                    by itself. Nothing is stored on the phone.
                </Text>

                <SectionLabel>If the login won't work in the app</SectionLabel>
                <Card className="mb-6">
                    <Pressable onPress={() => openLogin('browser')} disabled={!!opening} accessibilityRole="button"
                        className="py-3 rounded-xl items-center border border-border active:opacity-70 mb-3">
                        {opening === 'browser'
                            ? <ActivityIndicator color={colors.primary} />
                            : <Text className="text-primary font-bold">Open the ICICI login in the browser</Text>}
                    </Pressable>
                    <Text className="text-text-muted text-xs mb-2 leading-4">
                        After logging in, copy the address of the page ICICI opens (it contains apisession=…), or just the
                        value, and paste it here.
                    </Text>
                    <TextInput value={pasted} onChangeText={setPasted} placeholder="apisession value or the whole address"
                        placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false}
                        accessibilityLabel="ICICI session value"
                        className="bg-background border border-border rounded-xl px-3 py-3 text-text-primary text-sm mb-3" />
                    <Pressable onPress={submitPasted} disabled={applying || !pasted.trim()} accessibilityRole="button"
                        className="py-3 rounded-xl items-center bg-surfaceHighlight active:opacity-70"
                        style={{ opacity: applying || !pasted.trim() ? 0.5 : 1 }}>
                        {applying ? <ActivityIndicator color={colors.primary} /> : <Text className="text-text-primary font-bold">Update session</Text>}
                    </Pressable>
                </Card>
            </ScrollView>

            {loginUrl && (
                <View className="absolute inset-0 bg-background" accessibilityViewIsModal>
                    <View className="flex-row items-center justify-between px-4 pt-12 pb-3 border-b border-border bg-surface">
                        <View className="flex-1 pr-3">
                            <Text className="text-text-primary font-black text-[15px]">ICICI login</Text>
                            <Text className="text-text-muted text-xs">The new session is picked up when you finish</Text>
                        </View>
                        <Pressable onPress={() => setLoginUrl(null)} accessibilityRole="button" accessibilityLabel="Close the ICICI login"
                            className="w-9 h-9 rounded-full items-center justify-center bg-surfaceHighlight">
                            <X size={18} color={colors.textPrimary} />
                        </Pressable>
                    </View>
                    <WebView
                        source={{ uri: loginUrl }}
                        originWhitelist={['*']}
                        startInLoadingState
                        setSupportMultipleWindows={false}
                        // Catch the redirect before it loads: ICICI's redirect address may not be a real page.
                        onShouldStartLoadWithRequest={req => !catchSession(req.url)}
                        onNavigationStateChange={nav => { catchSession(nav.url); }}
                        onError={e => { if (!captured.current) toast.error('ICICI login failed to load', e.nativeEvent.description); }}
                        renderLoading={() => (
                            <View className="absolute inset-0 items-center justify-center bg-background">
                                <ActivityIndicator color={colors.primary} />
                            </View>
                        )}
                    />
                </View>
            )}
        </View>
    );
};

export default BrokerSessionScreen;
