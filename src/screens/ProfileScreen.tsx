import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StatusBar, TextInput, ActivityIndicator } from 'react-native';
import { LogOut, Bell, ChevronRight, BarChart3, PieChart, KeyRound, ScanLine, Lock, Smartphone, Monitor } from '../icons';
import { TEST_USER_ID } from '../config';
import { paperFetch, signOut, listSessions, revokeSession, changePin, authErrorText, serverDate, SessionInfo } from '../auth';
import { toast } from '../components/Toast';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ScreenHeader, Card, SectionLabel, Skeleton, confirmAction } from '../ui';
import { colors, signColor } from '../theme';
import { inr, ago } from '../format';

/** Paper-trading account from the paper trading service (/account/{id}). */
interface AccountData {
    initial_balance?: number;
    balance: number;          // cash available
    equity: number;
    invested?: number;
    realized_pnl?: number;
    unrealized_pnl?: number;
}

interface ProfileData {
    full_name: string;
    email?: string;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

const ProfileScreen = () => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [userId, setUserId] = useState<string>(TEST_USER_ID);
    const [account, setAccount] = useState<AccountData | null>(null);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(false);
    const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
    const [sessionsError, setSessionsError] = useState<string | null>(null);
    const [showPinForm, setShowPinForm] = useState(false);
    const [pinForm, setPinForm] = useState({ old: '', next: '', confirm: '' });
    const [pinBusy, setPinBusy] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);

    /** Phones and browsers signed in to this account (/auth/sessions). */
    const loadSessions = async () => {
        try {
            setSessionsError(null);
            const rows = await listSessions();
            rows.sort((a, b) => (a.current === b.current
                ? (serverDate(b.last_seen_at || b.created_at)?.getTime() ?? 0) - (serverDate(a.last_seen_at || a.created_at)?.getTime() ?? 0)
                : a.current ? -1 : 1));
            setSessions(rows);
        } catch (e) {
            setSessionsError(authErrorText(e));
        }
    };

    const fetchData = async () => {
        loadSessions();
        try {
            setLoading(true);
            const finalId = (await AsyncStorage.getItem('USER_ID')) || TEST_USER_ID;
            setUserId(finalId);
            const [accRes, profRes] = await Promise.all([
                paperFetch(`/account/${finalId}`),
                paperFetch(`/profile/${finalId}`),
            ]);
            if (accRes.ok) setAccount(await accRes.json());
            if (profRes.ok) setProfile(await profRes.json());
        } catch (error) {
            console.error("Failed to fetch profile data:", error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(useCallback(() => { fetchData(); }, []));

    const logout = () => confirmAction('Log out', 'You will need your Trader ID and PIN to sign in again.', 'Log out', async () => {
        await signOut(); // revokes this phone's token on the server, then forgets it
        await AsyncStorage.clear();
        navigation.replace('Login');
    }, true);

    const confirmRevoke = (s: SessionInfo) => confirmAction(
        s.kind === 'web' ? 'Sign out browser' : 'Sign out device',
        `Sign out "${s.label}"? It will need to sign in again.`,
        'Sign out',
        async () => {
            try {
                await revokeSession(s.session_id);
                toast.success('Signed out', s.label);
                loadSessions();
            } catch (e) {
                toast.error("Couldn't sign it out", authErrorText(e));
            }
        },
        true,
    );

    const submitPinChange = async () => {
        setPinError(null);
        if (!/^\d{4,6}$/.test(pinForm.old)) return setPinError('Enter your current PIN.');
        if (!/^\d{4,6}$/.test(pinForm.next)) return setPinError('The new PIN must be 4 to 6 digits.');
        if (pinForm.next !== pinForm.confirm) return setPinError("The new PINs don't match.");
        try {
            setPinBusy(true);
            await changePin(pinForm.old, pinForm.next);
            toast.success('PIN changed', 'Use your new PIN next time you sign in.');
            setPinForm({ old: '', next: '', confirm: '' });
            setShowPinForm(false);
        } catch (e) {
            setPinError(authErrorText(e));
        } finally {
            setPinBusy(false);
        }
    };

    const PinField = ({ label, field }: { label: string; field: 'old' | 'next' | 'confirm' }) => (
        <TextInput
            className="bg-background border border-border rounded-2xl px-4 py-3 text-text-primary font-bold mb-2"
            placeholder={label}
            placeholderTextColor="#6B7280"
            accessibilityLabel={label}
            value={pinForm[field]}
            onChangeText={(v) => { setPinError(null); setPinForm(f => ({ ...f, [field]: v.replace(/\D/g, '').slice(0, 6) })); }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
        />
    );

    const name = titleCase((profile?.full_name || 'Trader').trim());
    const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

    const Row = ({ icon, title, subtitle, onPress, danger }: {
        icon: React.ReactNode; title: string; subtitle?: string; onPress: () => void; danger?: boolean;
    }) => (
        <Pressable onPress={onPress} accessibilityRole="button"
            className="flex-row items-center px-4 py-3.5 active:opacity-70">
            <View className="w-10 h-10 rounded-2xl items-center justify-center mr-3"
                style={{ backgroundColor: danger ? `${colors.error}1A` : colors.surfaceHighlight }}>{icon}</View>
            <View className="flex-1">
                <Text className="font-bold text-[15px]" style={{ color: danger ? colors.error : colors.textPrimary }}>{title}</Text>
                {!!subtitle && <Text className="text-text-muted text-xs mt-0.5">{subtitle}</Text>}
            </View>
            {!danger && <ChevronRight size={18} color={colors.textMuted} />}
        </Pressable>
    );

    const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
        <View className="py-2" style={{ width: '50%' }}>
            <Text className="text-text-muted text-xs font-semibold">{label}</Text>
            <Text className="font-bold text-[15px] mt-0.5" style={{ color: color || colors.textPrimary, fontVariant: ['tabular-nums'] }}>{value}</Text>
        </View>
    );

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />
            <ScreenHeader title="Profile" onBack={() => navigation.goBack()} compact />
            <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colors.primary} />}>

                <View className="flex-row items-center mb-5">
                    <View className="w-16 h-16 rounded-full bg-surface border-2 items-center justify-center mr-4" style={{ borderColor: `${colors.primary}66` }}>
                        <Text className="text-text-primary text-xl font-black">{initials}</Text>
                    </View>
                    <View className="flex-1">
                        <Text className="text-text-primary text-xl font-black" numberOfLines={1}>{name}</Text>
                        <Text className="text-text-muted text-[13px] font-semibold mt-0.5">Trader ID {userId}</Text>
                    </View>
                </View>

                <SectionLabel>Paper trading account</SectionLabel>
                <Card className="mb-6" onPress={() => navigation.navigate('MainTabs' as any, { screen: 'Portfolio' })}>
                    <Text className="text-text-muted text-xs font-semibold">Cash available</Text>
                    {account ? (
                        <Text className="text-text-primary text-3xl font-black mt-1" style={{ fontVariant: ['tabular-nums'] }}>{inr(account.balance)}</Text>
                    ) : <Skeleton w={180} h={30} style={{ marginTop: 6 }} />}
                    <View className="flex-row flex-wrap mt-3 pt-3 border-t border-border">
                        <Stat label="Invested" value={account ? inr(account.invested ?? 0) : '—'} />
                        <Stat label="Starting capital" value={account?.initial_balance != null ? inr(account.initial_balance, { decimals: 0 }) : '—'} />
                        <Stat label="Realised P&L" value={account ? inr(account.realized_pnl ?? 0, { sign: true }) : '—'} color={signColor(account?.realized_pnl)} />
                        <Stat label="Unrealised P&L" value={account ? inr(account.unrealized_pnl ?? 0, { sign: true }) : '—'} color={signColor(account?.unrealized_pnl)} />
                    </View>
                    <View className="flex-row items-center mt-2">
                        <Text className="text-primary text-[13px] font-bold">Open portfolio</Text>
                        <ChevronRight size={15} color={colors.primary} />
                    </View>
                </Card>

                <SectionLabel>Shortcuts</SectionLabel>
                <View className="bg-surface rounded-3xl border border-border mb-6 overflow-hidden">
                    <Row icon={<PieChart size={18} color={colors.primary} />} title="Portfolio" subtitle="Positions and orders"
                        onPress={() => navigation.navigate('MainTabs' as any, { screen: 'Portfolio' })} />
                    <View className="h-px bg-border ml-16" />
                    <Row icon={<BarChart3 size={18} color={colors.blue} />} title="Performance" subtitle="Win rate, P&L and trade stats"
                        onPress={() => navigation.navigate('Performance')} />
                    <View className="h-px bg-border ml-16" />
                    <Row icon={<Bell size={18} color={colors.warning} />} title="Price alerts" subtitle="Get notified when a stock crosses a price"
                        onPress={() => navigation.navigate('Alerts')} />
                </View>

                <SectionLabel>Security</SectionLabel>
                <View className="bg-surface rounded-3xl border border-border mb-6 overflow-hidden">
                    <Row icon={<ScanLine size={18} color={colors.primary} />} title="Log in to web — scan QR" subtitle="Approve TradeMaster Web on your computer"
                        onPress={() => navigation.navigate('ScanLogin')} />
                    <View className="h-px bg-border ml-16" />
                    <Row icon={<Lock size={18} color={colors.textSecondary} />} title="Change PIN" subtitle="The PIN you sign in and approve web logins with"
                        onPress={() => { setShowPinForm(v => !v); setPinError(null); }} />
                    {showPinForm && (
                        <View className="px-4 pb-4">
                            {PinField({ label: 'Current PIN', field: 'old' })}
                            {PinField({ label: 'New PIN (4–6 digits)', field: 'next' })}
                            {PinField({ label: 'Confirm new PIN', field: 'confirm' })}
                            {!!pinError && <Text className="text-error text-[13px] font-semibold mb-2" accessibilityLiveRegion="polite">{pinError}</Text>}
                            <Pressable onPress={submitPinChange} disabled={pinBusy} accessibilityRole="button"
                                className="py-3.5 rounded-2xl items-center bg-primary active:opacity-80 mt-1" style={{ opacity: pinBusy ? 0.6 : 1 }}>
                                {pinBusy ? <ActivityIndicator color={colors.background} /> : <Text className="text-background font-black">Save new PIN</Text>}
                            </Pressable>
                        </View>
                    )}
                </View>

                <SectionLabel>Signed-in devices & browsers</SectionLabel>
                <View className="bg-surface rounded-3xl border border-border mb-6 overflow-hidden">
                    {sessions === null && !sessionsError ? (
                        <View className="px-4 py-4"><Skeleton w="60%" h={14} /><Skeleton w="40%" h={10} style={{ marginTop: 8 }} /></View>
                    ) : sessionsError ? (
                        <Pressable onPress={loadSessions} accessibilityRole="button" className="px-4 py-4 active:opacity-70">
                            <Text className="text-text-muted text-[13px]">{sessionsError}</Text>
                            <Text className="text-primary text-[13px] font-bold mt-1">Try again</Text>
                        </Pressable>
                    ) : sessions && sessions.length === 0 ? (
                        <Text className="text-text-muted text-[13px] px-4 py-4">No active sessions.</Text>
                    ) : sessions?.map((s, i) => {
                        const Icon = s.kind === 'web' ? Monitor : Smartphone;
                        const seen = s.current ? 'Active now' : `Last seen ${ago(serverDate(s.last_seen_at || s.created_at))}`;
                        return (
                            <View key={s.session_id}>
                                {i > 0 && <View className="h-px bg-border ml-16" />}
                                <View className="flex-row items-center px-4 py-3.5">
                                    <View className="w-10 h-10 rounded-2xl items-center justify-center mr-3" style={{ backgroundColor: colors.surfaceHighlight }}>
                                        <Icon size={18} color={s.current ? colors.primary : colors.textSecondary} />
                                    </View>
                                    <View className="flex-1 mr-2">
                                        <Text className="text-text-primary font-bold text-[15px]" numberOfLines={1}>{s.label || (s.kind === 'web' ? 'Web browser' : 'Phone')}</Text>
                                        <Text className="text-text-muted text-xs mt-0.5" numberOfLines={1}>
                                            {s.kind === 'web' ? 'Browser' : 'App'} · {seen}{s.ip ? ` · ${s.ip}` : ''}
                                        </Text>
                                    </View>
                                    {s.current ? (
                                        <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: `${colors.primary}1A` }}>
                                            <Text className="text-primary text-xs font-bold">This phone</Text>
                                        </View>
                                    ) : (
                                        <Pressable onPress={() => confirmRevoke(s)} accessibilityRole="button" accessibilityLabel={`Sign out ${s.label}`}
                                            hitSlop={8} className="px-3 py-1.5 rounded-full border active:opacity-70"
                                            style={{ borderColor: `${colors.error}66` }}>
                                            <Text className="text-xs font-bold" style={{ color: colors.error }}>Revoke</Text>
                                        </Pressable>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </View>

                <SectionLabel>Session</SectionLabel>
                <View className="bg-surface rounded-3xl border border-border mb-6 overflow-hidden">
                    <Row icon={<KeyRound size={18} color={colors.textSecondary} />} title="Switch account" subtitle="Sign in with another Trader ID" onPress={logout} />
                    <View className="h-px bg-border ml-16" />
                    <Row icon={<LogOut size={18} color={colors.error} />} title="Log out" onPress={logout} danger />
                </View>

                <Text className="text-text-muted text-xs text-center">TradeMaster Mobile · paper trading only, no real money</Text>
            </ScrollView>
        </View>
    );
};

export default ProfileScreen;
