import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, StatusBar, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Wallet, Plus, ArrowUpRight, TrendingUp, Search, Bell, Settings } from 'lucide-react-native';
import { API_URL, BREEZE_API_URL, TEST_USER_ID } from '../config';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AccountData {
    balance: number;
    equity: number;
}

interface ProfileData {
    full_name: string;
    email?: string;
    profile_pic?: string;
}

type DashboardScreenNavigationProp = CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Dashboard'>,
    NativeStackNavigationProp<RootStackParamList>
>;

const DashboardScreen = () => {
    const navigation = useNavigation<DashboardScreenNavigationProp>();
    const [userId, setUserId] = useState<string>(TEST_USER_ID);
    const [account, setAccount] = useState<AccountData | null>(null);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [trends, setTrends] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [marketStatus, setMarketStatus] = useState<{ is_open: boolean; message: string } | null>(null);

    const fetchAccount = async (id: string = userId) => {
        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/account/${id}`);
            const data = await response.json();
            setAccount(data);
        } catch (error) {
            console.error("Failed to fetch account:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTrends = async () => {
        try {
            // Updated to use Breeze Service movers endpoint
            const response = await fetch(`${BREEZE_API_URL}/api/movers?filters=liquid`);
            const data = await response.json();
            setTrends(Array.isArray(data) ? data.slice(0, 5) : []);
        } catch (error) {
            console.error("Failed to fetch trends:", error);
        }
    };

    const fetchProfile = async (id: string = userId) => {
        try {
            // 1. Fetch from our Paper Trading DB first
            const res = await fetch(`${API_URL}/profile/${id}`);
            if (res.ok) {
                const data = await res.json();
                setProfile(data);

                // 2. Try to sync with Breeze if name is generic or every few loads
                if (data.full_name === "Trader" || !data.full_name) {
                    syncWithBreeze(id);
                }
            }
        } catch (error) {
            console.error("Failed to fetch profile:", error);
        }
    };

    const syncWithBreeze = async (id: string = userId) => {
        try {
            const breezeRes = await fetch(`${BREEZE_API_URL}/api/customer-details`);
            const breezeData = await breezeRes.json();

            // Breeze can return Success as an array or an object
            if (breezeData.Success) {
                const breezeUser = Array.isArray(breezeData.Success) ? breezeData.Success[0] : breezeData.Success;
                const fullName = breezeUser.idirect_user_name || breezeUser.name || breezeUser.idirect_userid;

                // Update our DB
                await fetch(`${API_URL}/profile`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: id,
                        full_name: fullName,
                        email: breezeUser.email || ""
                    })
                });

                setProfile({ full_name: fullName, email: breezeUser.email });
            }
        } catch (error) {
            console.log("Breeze sync failed (likely no session):", error);
        }
    };

    const fetchMarketStatus = async () => {
        try {
            const res = await fetch(`${BREEZE_API_URL}/api/market-status`);
            const data = await res.json();
            setMarketStatus(data);
        } catch (e) {
            console.log("Failed to fetch market status");
        }
    };

    useEffect(() => {
        const init = async () => {
            const savedId = await AsyncStorage.getItem('USER_ID');
            const finalId = savedId || TEST_USER_ID;
            setUserId(finalId);
            fetchAccount(finalId);
            fetchTrends();
            fetchProfile(finalId);
            fetchMarketStatus();
        };
        init();
        const timer = setInterval(fetchMarketStatus, 60000); // Check every minute
        return () => clearInterval(timer);
    }, []);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
    };

    const formatPrice = (value: number) => {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
    };

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" backgroundColor="#0B0E11" />
            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={() => { fetchAccount(userId); fetchTrends(); fetchProfile(userId); }}
                        tintColor="#2563eb"
                        colors={["#2563eb"]}
                    />
                }
            >
                {/* Header info */}
                <View className="flex-row justify-between items-center px-4 pt-12 pb-4">
                    <View className="flex-row items-center">
                        <View className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center mr-3">
                            <Text className="text-text-primary font-bold">
                                {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'TD'}
                            </Text>
                        </View>
                        <View>
                            <Text className="text-text-secondary text-xs">Good Morning</Text>
                            <Text className="text-text-primary font-bold text-base">
                                {profile?.full_name || 'Trader'}
                            </Text>
                        </View>
                    </View>

                    {/* Market Status Badge */}
                    {marketStatus && (
                        <View className={`flex-row items-center px-3 py-1.5 rounded-full border ${marketStatus.is_open ? 'bg-success/10 border-success/30' : 'bg-error/10 border-error/30'}`}>
                            <View className={`w-1.5 h-1.5 rounded-full mr-2 ${marketStatus.is_open ? 'bg-success' : 'bg-error'}`} />
                            <Text className={`text-[10px] font-black uppercase tracking-tight ${marketStatus.is_open ? 'text-success' : 'text-error'}`}>
                                {marketStatus.is_open ? 'Market Open' : 'Market Closed'}
                            </Text>
                        </View>
                    )}

                    <View className="flex-row gap-3">
                        <TouchableOpacity className="bg-surface p-2 rounded-xl border border-border" onPress={() => navigation.navigate('Watchlist')}>
                            <Search size={20} color="#E1E7ED" />
                        </TouchableOpacity>
                        <TouchableOpacity className="bg-surface p-2 rounded-xl border border-border">
                            <Bell size={20} color="#E1E7ED" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Balance Card with Gradient */}
                <View className="px-4 py-4">
                    <LinearGradient
                        colors={['#2563eb', '#1d4ed8']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        className="rounded-[32px] p-8 shadow-2xl shadow-primary/40 overflow-hidden"
                    >
                        <View className="items-center">
                            <Text className="text-white/70 text-sm mb-1 uppercase tracking-widest font-bold">Total Balance</Text>
                            <Text className="text-white text-4xl font-black tracking-tight mb-8">
                                {account ? formatCurrency(account.equity) : '₹0.00'}
                            </Text>

                            <View className="flex-row gap-4 w-full">
                                <TouchableOpacity className="flex-1 bg-white/20 py-3.5 rounded-2xl items-center border border-white/30">
                                    <Text className="text-white font-bold text-base">Deposit</Text>
                                </TouchableOpacity>
                                <TouchableOpacity className="flex-1 bg-white/10 py-3.5 rounded-2xl items-center border border-white/20">
                                    <Text className="text-white font-bold text-base">Withdraw</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Decorative Circle */}
                        <View className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-white/10" />
                    </LinearGradient>
                </View>

                {/* Header and Market Status */}
                <View className="px-4 pt-12 pb-4">
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center mr-3">
                                <Text className="text-text-primary font-bold text-xs">{profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'SO'}</Text>
                            </View>
                            <View>
                                <Text className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Good Morning</Text>
                                <Text className="text-text-primary font-bold text-sm tracking-tight">{profile?.full_name || 'Trader'}</Text>
                            </View>
                        </View>

                        {/* Market Status Badge */}
                        {marketStatus && (
                            <View className={`flex-row items-center px-3 py-1.5 rounded-full border ${marketStatus.is_open ? 'bg-success/10 border-success/30' : 'bg-error/10 border-error/30'}`}>
                                <View className={`w-1.5 h-1.5 rounded-full mr-2 ${marketStatus.is_open ? 'bg-success' : 'bg-error'}`} />
                                <Text className={`text-[10px] font-black uppercase tracking-tight ${marketStatus.is_open ? 'text-success' : 'text-error'}`}>
                                    {marketStatus.is_open ? 'Market Open' : 'Market Closed'}
                                </Text>
                            </View>
                        )}

                        <View className="flex-row gap-2">
                            <TouchableOpacity className="bg-surface p-2 rounded-xl border border-border" onPress={() => navigation.navigate('Watchlist')}>
                                <Search size={20} color="#E1E7ED" />
                            </TouchableOpacity>
                            <TouchableOpacity className="bg-surface p-2 rounded-xl border border-border">
                                <Bell size={20} color="#E1E7ED" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Stats row */}
                <View className="flex-row px-6 justify-between mt-4">
                    <View className="flex-row items-center">
                        <View className="w-8 h-8 rounded-full bg-success/10 items-center justify-center mr-2">
                            <TrendingUp size={16} color="#10B981" />
                        </View>
                        <View>
                            <Text className="text-text-muted text-[10px] uppercase font-bold">Day Profit</Text>
                            <Text className="text-success font-bold">+ ₹1,240.50</Text>
                        </View>
                    </View>
                    <View className="h-8 w-px bg-border mx-2" />
                    <View className="flex-row items-center">
                        <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-2">
                            <Wallet size={16} color="#2563eb" />
                        </View>
                        <View>
                            <Text className="text-text-muted text-[10px] uppercase font-bold">Invested</Text>
                            <Text className="text-text-primary font-bold">₹85,000.00</Text>
                        </View>
                    </View>
                </View>

                {/* Category Selector (Trending, News, Top Market) */}
                <View className="mt-8 px-4">
                    <View className="flex-row gap-6 items-center">
                        {['Trending', 'News', 'Top Market'].map((cat, i) => (
                            <TouchableOpacity key={i}>
                                <Text className={`text-base font-bold ${i === 0 ? 'text-text-primary' : 'text-text-muted'}`}>{cat}</Text>
                                {i === 0 && <View className="h-1 bg-primary rounded-full w-1/3 mt-1" />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Trending Stocks List */}
                <View className="mt-6 px-4 pb-20">
                    <View className="flex-row justify-between items-center mb-6">
                        <Text className="text-lg font-bold text-text-primary">Market Trends</Text>
                        <TouchableOpacity onPress={fetchTrends}>
                            <Plus size={20} color="#2563eb" />
                        </TouchableOpacity>
                    </View>

                    {trends.length > 0 ? trends.map((asset, i) => (
                        <Pressable
                            key={i}
                            onPress={() => navigation.navigate('StockDetail', { symbol: asset.symbol })}
                            className="bg-surface p-6 rounded-[32px] border border-border mb-4 flex-row items-center justify-between active:scale-95 transition-transform"
                        >
                            <View className="flex-row items-center">
                                <View className={`w-14 h-14 rounded-2xl items-center justify-center mr-4 ${asset.change >= 0 ? 'bg-success/10' : 'bg-error/10'}`}>
                                    <Text className={`font-black text-xl ${asset.change >= 0 ? 'text-success' : 'text-error'}`}>{asset.symbol[0]}</Text>
                                </View>
                                <View>
                                    <Text className="text-text-primary font-black text-lg tracking-tight">{asset.symbol.split('.')[0]}</Text>
                                    <View className="flex-row items-center mt-1">
                                        <Text className="text-text-secondary text-xs font-medium" numberOfLines={1} style={{ maxWidth: 120 }}>{asset.name} • </Text>
                                        <Text className={`text-xs font-bold ${asset.change >= 0 ? 'text-success' : 'text-error'}`}>
                                            {asset.change >= 0 ? '+' : ''}{asset.change.toFixed(2)}%
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            <View className="items-end">
                                <Text className="text-text-primary font-black text-lg">₹{asset.price.toFixed(2)}</Text>
                                <View className="flex-row gap-1 mt-2 items-end h-6">
                                    {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                                        <View key={s} className={`w-1 rounded-full ${asset.change >= 0 ? 'bg-success' : 'bg-error'}`} style={{ height: Math.abs(Math.sin(s + i)) * 15 + 5, opacity: 0.3 + (s / 10) }} />
                                    ))}
                                </View>
                            </View>
                        </Pressable>
                    )) : (
                        <ActivityIndicator size="large" color="#2563eb" className="mt-10" />
                    )}
                </View>
            </ScrollView>
        </View>
    );
};

export default DashboardScreen;
