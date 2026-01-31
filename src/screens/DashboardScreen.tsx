import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, StatusBar, Pressable } from 'react-native';
import { Plus, Search, Bell, Trash2, X, ChevronRight } from 'lucide-react-native';
import { API_URL, BREEZE_API_URL, TEST_USER_ID } from '../config';
import { useNavigation, CompositeNavigationProp, useIsFocused } from '@react-navigation/native';
import { Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';



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
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [trends, setTrends] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [marketStatus, setMarketStatus] = useState<{ is_open: boolean; message: string } | null>(null);
    const [activeCategory, setActiveCategory] = useState('Trending');
    const [watchlists, setWatchlists] = useState<any[]>([]);
    const [watchlistQuotes, setWatchlistQuotes] = useState<Record<string, any>>({});
    const [watchLoading, setWatchLoading] = useState(false);
    const isFocused = useIsFocused();



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

    const fetchWatchlistQuotes = async (symbols: string[]) => {
        try {
            const res = await fetch(`${BREEZE_API_URL}/api/batch-quotes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbols })
            });
            const data = await res.json();
            const quoteMap: Record<string, any> = {};
            if (Array.isArray(data)) {
                data.forEach((q: any) => {
                    quoteMap[q.symbol] = q;
                    // Also store by clean symbol for easier lookup
                    quoteMap[q.symbol.split('.')[0]] = q;
                });
            }
            setWatchlistQuotes(quoteMap);
        } catch (error) {
            console.error("Failed to fetch watchlist quotes:", error);
        }
    };

    const fetchWatchlists = async (id: string = userId) => {
        try {
            setWatchLoading(true);
            const res = await fetch(`${API_URL}/watchlists/${id}`);
            const data = await res.json();
            const wLists = Array.isArray(data) ? data : [];
            setWatchlists(wLists);

            // Get unique symbols across all watchlists
            const allSymbols = Array.from(new Set(wLists.flatMap(wl => wl.symbols)));
            if (allSymbols.length > 0) {
                fetchWatchlistQuotes(allSymbols);
            }
        } catch (error) {
            console.error("Failed to fetch watchlists:", error);
        } finally {
            setWatchLoading(false);
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

    const deleteWatchlist = async (watchlistId: string, name: string) => {
        Alert.alert(
            "Delete Watchlist",
            `Are you sure you want to delete "${name}"?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const res = await fetch(`${API_URL}/watchlists/${userId}/${watchlistId}`, { method: 'DELETE' });
                            if (res.ok) {
                                fetchWatchlists(userId);
                            }
                        } catch (error) {
                            console.error("Failed to delete watchlist:", error);
                        }
                    }
                }
            ]
        );
    };

    const removeFromWatchlist = async (watchlistId: string, symbol: string) => {
        try {
            const res = await fetch(`${API_URL}/watchlists/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    watchlist_id: watchlistId,
                    symbol: symbol
                })
            });
            if (res.ok) {
                fetchWatchlists(userId);
            }
        } catch (error) {
            console.error("Failed to remove stock:", error);
        }
    };

    useEffect(() => {
        if (isFocused) {
            fetchWatchlists(userId);
        }
    }, [isFocused, userId]);

    useEffect(() => {
        const init = async () => {
            const savedId = await AsyncStorage.getItem('USER_ID');
            const finalId = savedId || TEST_USER_ID;
            setUserId(finalId);
            fetchTrends();
            fetchProfile(finalId);
            fetchMarketStatus();
            fetchWatchlists(finalId);
        };
        init();
        const timer = setInterval(fetchMarketStatus, 60000);
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
                        onRefresh={() => { fetchTrends(); fetchProfile(userId); fetchWatchlists(userId); }}
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

                {/* Category Selector (Trending, News, Top Market) */}
                <View className="mt-8 px-4">
                    <View className="flex-row gap-6 items-center">
                        {['Trending', 'Watchlists', 'News', 'Top Market'].map((cat, i) => (
                            <TouchableOpacity key={cat} onPress={() => setActiveCategory(cat)}>
                                <Text className={`text-base font-bold ${activeCategory === cat ? 'text-text-primary' : 'text-text-muted'}`}>{cat}</Text>
                                {activeCategory === cat && <View className="h-1 bg-primary rounded-full w-1/3 mt-1" />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {activeCategory === 'Trending' && (
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
                )}

                {activeCategory === 'Watchlists' && (
                    <View className="mt-6 px-4 pb-20">
                        {watchLoading && watchlists.length === 0 ? (
                            <ActivityIndicator size="large" color="#2563eb" className="mt-10" />
                        ) : watchlists.length > 0 ? watchlists.map((wl, i) => (
                            <View key={wl._id} className="mb-8">
                                <View className="flex-row justify-between items-center mb-4 px-2">
                                    <View>
                                        <Text className="text-lg font-black text-text-primary">{wl.name}</Text>
                                        <Text className="text-text-muted text-xs font-bold uppercase tracking-widest">{wl.symbols.length} Stocks</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => deleteWatchlist(wl._id, wl.name)}
                                        className="w-8 h-8 rounded-full bg-error/10 items-center justify-center"
                                    >
                                        <Trash2 size={16} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>

                                {wl.symbols.length > 0 ? wl.symbols.map((sym: string, j: number) => {
                                    const quote = watchlistQuotes[sym] || watchlistQuotes[sym + '.NS'];
                                    return (
                                        <Pressable
                                            key={sym}
                                            onPress={() => navigation.navigate('StockDetail', { symbol: sym })}
                                            className="bg-surface p-6 rounded-[32px] border border-border mb-4 flex-row items-center justify-between active:scale-95 transition-transform"
                                        >
                                            <View className="flex-row items-center">
                                                <View className={`w-14 h-14 rounded-2xl items-center justify-center mr-4 ${quote?.change >= 0 || !quote ? 'bg-success/10' : 'bg-error/10'}`}>
                                                    <Text className={`font-black text-xl ${quote?.change >= 0 || !quote ? 'text-success' : 'text-error'}`}>{sym[0]}</Text>
                                                </View>
                                                <View>
                                                    <Text className="text-text-primary font-black text-lg tracking-tight">{sym.split('.')[0]}</Text>
                                                    <View className="flex-row items-center mt-1">
                                                        <Text className="text-text-secondary text-[10px] font-bold uppercase tracking-tight" numberOfLines={1} style={{ maxWidth: 80 }}>
                                                            {quote?.change !== undefined ? `NSE • ` : 'NSE • EQUITY'}
                                                        </Text>
                                                        {quote?.change !== undefined && (
                                                            <Text className={`text-xs font-bold ${quote.change >= 0 ? 'text-success' : 'text-error'}`}>
                                                                {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)}%
                                                            </Text>
                                                        )}
                                                    </View>
                                                </View>
                                            </View>
                                            <View className="flex-row items-center">
                                                <View className="items-end mr-4">
                                                    <Text className="text-text-primary font-black text-lg">
                                                        {quote?.price ? `₹${quote.price.toFixed(2)}` : '---'}
                                                    </Text>
                                                    <View className="flex-row gap-0.5 mt-2 items-end h-4">
                                                        {[1, 2, 3, 4, 5].map((s) => (
                                                            <View key={s} className={`w-0.5 rounded-full ${quote?.change >= 0 || !quote ? 'bg-success' : 'bg-error'}`} style={{ height: Math.abs(Math.sin(s + j)) * 10 + 3, opacity: 0.3 + (s / 10) }} />
                                                        ))}
                                                    </View>
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => removeFromWatchlist(wl._id, sym)}
                                                    className="w-8 h-8 rounded-full bg-surface border border-border items-center justify-center"
                                                >
                                                    <X size={14} color="#6B7280" />
                                                </TouchableOpacity>
                                            </View>
                                        </Pressable>
                                    );
                                }) : (
                                    <View className="bg-surface/30 p-8 rounded-[28px] border border-dashed border-border items-center">
                                        <Text className="text-text-muted font-bold text-sm">No stocks in this watchlist</Text>
                                    </View>
                                )}
                            </View>
                        )) : (
                            <View className="items-center py-20 opacity-50">
                                <Text className="text-text-muted font-bold mb-4">No watchlists yet</Text>
                                <TouchableOpacity
                                    onPress={() => Alert.alert("Tip", "Visit any stock detail page to create a watchlist!")}
                                    className="bg-primary/10 px-6 py-3 rounded-full border border-primary/20"
                                >
                                    <Text className="text-primary font-bold">How to add stocks?</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                {(activeCategory === 'News' || activeCategory === 'Top Market') && (
                    <View className="mt-10 items-center py-20 opacity-30">
                        <Text className="text-text-muted font-bold text-lg">Under Construction</Text>
                        <Text className="text-text-muted text-xs mt-2">Will be available in next update</Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

export default DashboardScreen;
