import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StatusBar } from 'react-native';
import { LogOut, Bell, ChevronRight, BarChart3, PieChart, KeyRound } from 'lucide-react-native';
import { API_URL, TEST_USER_ID } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ScreenHeader, Card, SectionLabel, Skeleton, confirmAction } from '../ui';
import { colors, signColor } from '../theme';
import { inr } from '../format';

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

    const fetchData = async () => {
        try {
            setLoading(true);
            const finalId = (await AsyncStorage.getItem('USER_ID')) || TEST_USER_ID;
            setUserId(finalId);
            const [accRes, profRes] = await Promise.all([
                fetch(`${API_URL}/account/${finalId}`),
                fetch(`${API_URL}/profile/${finalId}`),
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
        await AsyncStorage.clear();
        navigation.replace('Login');
    }, true);

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
