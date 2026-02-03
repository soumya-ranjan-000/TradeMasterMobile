import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, StatusBar, Pressable, Platform } from 'react-native';
import { Plus, Search, Bell, Trash2, X, ChevronRight, Pause, Play } from 'lucide-react-native';
import { API_URL, BREEZE_API_URL, TEST_USER_ID } from '../config';
import { useNavigation, CompositeNavigationProp, useIsFocused } from '@react-navigation/native';
import { Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMarketData } from '../context/MarketDataContext';



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
    const [isPaused, setIsPaused] = useState(false);
    const isFocused = useIsFocused();
    const { ticks, subscribe, unsubscribe } = useMarketData();



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

    // We now use ticks from Context instead of manual batch polling
    const liveWatchlistQuotes = React.useMemo(() => {
        const quotes: Record<string, any> = {};
        watchlists.forEach(wl => {
            wl.symbols.forEach((sym: string) => {
                const cleanCode = sym.split('.')[0].toUpperCase();
                // Check multiple possible keys in ticks
                const tick = ticks[`NSE:${cleanCode}`] || ticks[`NSE:${sym.toUpperCase()}`] || ticks[sym.toUpperCase()];

                if (tick) {
                    quotes[sym] = {
                        symbol: sym,
                        price: tick.ltp,
                        change: tick.day_change_perc
                    };
                    // Support various lookup keys for flexibility
                    if (cleanCode !== sym) quotes[cleanCode] = quotes[sym];
                    if (!sym.endsWith('.NS')) quotes[sym + '.NS'] = quotes[sym];
                }
            });
        });
        return quotes;
    }, [watchlists, ticks]);

    const fetchWatchlists = async (id: string = userId) => {
        try {
            setWatchLoading(true);
            const res = await fetch(`${API_URL}/watchlists/${id}`);
            const data = await res.json();
            const wLists = Array.isArray(data) ? data : [];
            setWatchlists(wLists);

            // Watchlist symbols are now automatically subscribed to in the useEffect below
            // when the 'Watchlists' category is active.
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
        console.log("Attempting to delete watchlist:", watchlistId, name);
        if (!watchlistId) {
            console.error("Watchlist ID is missing");
            return;
        }

        const runDelete = async () => {
            try {
                console.log(`Sending DELETE request for watchlist ${watchlistId}`);
                const res = await fetch(`${API_URL}/watchlists/${userId}/${watchlistId}`, {
                    method: 'DELETE',
                    headers: { 'Accept': 'application/json' }
                });
                console.log("Delete response status:", res.status);
                if (res.ok) {
                    fetchWatchlists(userId);
                } else {
                    const err = await res.json();
                    console.error("Delete failed:", err);
                }
            } catch (error) {
                console.error("Failed to delete watchlist:", error);
            }
        };

        if (Platform.OS === 'web') {
            if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
                runDelete();
            }
        } else {
            Alert.alert(
                "Delete Watchlist",
                `Are you sure you want to delete "${name}"?`,
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: runDelete }
                ]
            );
        }
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
        if (activeCategory === 'Trending' && !isPaused && isFocused) {
            fetchTrends();
            const timer = setInterval(fetchTrends, 30000);
            return () => clearInterval(timer);
        }
    }, [isPaused, activeCategory, isFocused]);

    useEffect(() => {
        if (isFocused) {
            fetchWatchlists(userId);
        }
    }, [isFocused, userId]);

    const subscribedWatchlistSymbols = React.useRef<Set<string>>(new Set());

    useEffect(() => {
        if (isFocused && activeCategory === 'Watchlists' && watchlists.length > 0) {
            // Get all symbols from all watchlists
            const allSymbols = new Set<string>();
            watchlists.forEach(wl => {
                wl.symbols?.forEach((sym: string) => {
                    allSymbols.add(sym);
                });
            });

            // Subscribe to any new ones
            allSymbols.forEach(sym => {
                if (!subscribedWatchlistSymbols.current.has(sym)) {
                    subscribe(sym);
                    subscribedWatchlistSymbols.current.add(sym);
                }
            });

            // Unsubscribe from any that are no longer in watchlists (or if we lose focus)
            // But for now, we only cleanup on focus loss or category change for simplicity
            return () => {
                subscribedWatchlistSymbols.current.forEach(sym => {
                    unsubscribe(sym);
                });
                subscribedWatchlistSymbols.current.clear();
            };
        } else if (!isFocused || activeCategory !== 'Watchlists') {
            // Force cleanup if we are not focused or not in watchlists
            if (subscribedWatchlistSymbols.current.size > 0) {
                subscribedWatchlistSymbols.current.forEach(sym => {
                    unsubscribe(sym);
                });
                subscribedWatchlistSymbols.current.clear();
            }
        }
    }, [isFocused, activeCategory, watchlists, subscribe, unsubscribe]);

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
        const timer = setInterval(fetchMarketStatus, 300000); // 5 minutes
        return () => clearInterval(timer);
    }, []);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
    };

    const formatPrice = (value: number) => {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good Morning";
        if (hour < 17) return "Good Afternoon";
        return "Good Evening";
    };

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" backgroundColor="#0E1116" />
            {/* Header info - Focused on Identity */}
            <View className="flex-row justify-between items-center px-6 pt-12 pb-4">
                <TouchableOpacity
                    onPress={() => navigation.navigate('Profile')}
                    className="flex-row items-center flex-1 mr-4 active:opacity-80"
                >
                    <View className="w-12 h-12 rounded-full bg-surface border border-border items-center justify-center mr-3 shadow-sm">
                        <Text className="text-text-primary font-black text-base">
                            {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'TD'}
                        </Text>
                    </View>
                    <View className="flex-1">
                        <Text className="text-text-muted text-[10px] font-bold uppercase tracking-widest">{getGreeting()}</Text>
                        <Text className="text-text-primary font-black text-xl leading-tight">
                            {profile?.full_name || 'Trader'}
                        </Text>
                    </View>
                </TouchableOpacity>

                <View className="items-end">
                    {marketStatus && (
                        <View className={`flex-row items-center px-2 py-0.5 rounded-lg border mb-5 shadow-2xl ${marketStatus.is_open ? 'bg-success/20 border-success/50 shadow-success/40' : 'bg-error/20 border-error/50 shadow-error/40'} style={{ elevation: 10 }}`}>
                            <View className={`w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse ${marketStatus.is_open ? 'bg-success' : 'bg-error'}`} />
                            <Text className={`text-[8px] font-black uppercase tracking-widest ${marketStatus.is_open ? 'text-success' : 'text-error'}`}>
                                {marketStatus.is_open ? 'Open' : 'Closed'}
                            </Text>
                        </View>
                    )}
                    <View className="flex-row items-center gap-3">
                        <TouchableOpacity
                            className="bg-surface w-12 h-12 items-center justify-center rounded-2xl border border-border shadow-sm active:scale-95"
                            onPress={() => navigation.navigate('Alerts')}
                        >
                            <Bell size={22} color="#00E0A1" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            className="bg-surface w-12 h-12 items-center justify-center rounded-2xl border border-border shadow-sm active:scale-95"
                            onPress={() => navigation.navigate('Watchlist')}
                        >
                            <Search size={22} color="#E1E7ED" />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            {/* Category Selector (Trending, News, Top Market) */}
            <View className="mt-8 px-4 bg-background">
                <View className="flex-row gap-6 items-center">
                    {['Trending', 'Watchlists', 'News', 'Top Market'].map((cat, i) => (
                        <TouchableOpacity key={cat} onPress={() => setActiveCategory(cat)}>
                            <Text className={`text-base font-bold ${activeCategory === cat ? 'text-text-primary' : 'text-text-muted'}`}>{cat}</Text>
                            {activeCategory === cat && <View className="h-1 bg-primary rounded-full w-1/3 mt-1" />}
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Fixed Section Header (Market Trends / Extra padding) */}
            <View className="px-6 pt-10 pb-4 bg-background">
                {activeCategory === 'Trending' && (
                    <View className="flex-row justify-between items-center">
                        <View className="flex-1 flex-row items-center">
                            <Text className="text-text-primary text-xl font-black mr-3">Market Trends</Text>
                            <TouchableOpacity
                                onPress={() => setIsPaused(!isPaused)}
                                className={`px-3 py-1.5 rounded-full flex-row items-center border ${isPaused ? 'bg-error/10 border-error/20' : 'bg-success/10 border-success/20'}`}
                            >
                                {isPaused ? <Play size={12} color="#EF4444" /> : <Pause size={12} color="#10B981" />}
                                <Text className={`text-[10px] font-black uppercase ml-1.5 ${isPaused ? 'text-error' : 'text-success'}`}>
                                    {isPaused ? 'Paused' : 'Live Sync'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={() => navigation.navigate('Watchlist')} className="p-2">
                            <Plus size={24} color="#00E0A1" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={() => {
                            setLoading(true);
                            Promise.all([
                                fetchTrends(),
                                fetchProfile(userId),
                                fetchWatchlists(userId),
                                fetchMarketStatus()
                            ]).finally(() => setLoading(false));
                        }}
                        tintColor="#00E0A1"
                        colors={["#00E0A1"]}
                    />
                }
            >

                {
                    activeCategory === 'Trending' && (
                        <View className="px-4 pb-20">
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
                            )) : isPaused ? (
                                <View className="mt-20 items-center justify-center">
                                    <View className="w-16 h-16 rounded-full bg-error/10 items-center justify-center mb-4 border border-error/20">
                                        <Pause size={28} color="#EF4444" />
                                    </View>
                                    <Text className="text-text-primary font-black text-lg">Market Trends Paused</Text>
                                    <Text className="text-text-muted text-[10px] font-bold mt-1 uppercase tracking-widest px-10 text-center leading-tight">
                                        Live data synchronization is currently disabled. Resume to see real-time movers.
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => setIsPaused(false)}
                                        className="mt-6 bg-error/20 px-6 py-2.5 rounded-full border border-error/30 active:scale-95"
                                    >
                                        <Text className="text-error font-black text-[10px] uppercase tracking-widest">Resume Sync</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View className="mt-20 items-center justify-center">
                                    <ActivityIndicator size="large" color="#00E0A1" />
                                    <Text className="text-text-muted font-bold mt-4 animate-pulse uppercase text-[10px] tracking-[4px]">Scanning</Text>
                                </View>
                            )}
                        </View>
                    )
                }

                {
                    activeCategory === 'Watchlists' && (
                        <View className="mt-6 px-4 pb-20">
                            {watchLoading && watchlists.length === 0 ? (
                                <View className="items-center py-20">
                                    <ActivityIndicator size="large" color="#00E0A1" />
                                    <Text className="text-text-muted font-bold mt-4">Fetching your watchlists...</Text>
                                </View>
                            ) : watchlists.length > 0 ? (
                                <>
                                    {watchLoading && (
                                        <View className="flex-row items-center justify-center mb-4">
                                            <ActivityIndicator size="small" color="#2563eb" className="mr-2" />
                                            <Text className="text-primary text-xs font-bold">Updating prices...</Text>
                                        </View>
                                    )}
                                    {watchlists.map((wl, i) => (
                                        <View key={wl._id || wl.id} className="mb-8">
                                            <View className="flex-row justify-between items-center mb-4 px-2">
                                                <View>
                                                    <Text className="text-lg font-black text-text-primary">{wl.name}</Text>
                                                    <Text className="text-text-muted text-xs font-bold uppercase tracking-widest">{wl.symbols.length} Stocks</Text>
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        console.log("Trash icon pressed for:", wl._id || wl.id);
                                                        deleteWatchlist(wl._id || wl.id, wl.name);
                                                    }}
                                                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                                                    className="w-10 h-10 rounded-full bg-error/10 items-center justify-center active:scale-90"
                                                >
                                                    <Trash2 size={18} color="#EF4444" />
                                                </TouchableOpacity>
                                            </View>

                                            {wl.symbols.length > 0 ? wl.symbols.map((sym: string, j: number) => {
                                                const quote = liveWatchlistQuotes[sym] || liveWatchlistQuotes[sym + '.NS'];
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
                                                                onPress={() => removeFromWatchlist(wl._id || wl.id, sym)}
                                                                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                                                                className="w-8 h-8 rounded-full bg-surface border border-border items-center justify-center active:scale-90"
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
                                    ))}
                                </>
                            ) : (
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
                    )
                }

                {
                    (activeCategory === 'News' || activeCategory === 'Top Market') && (
                        <View className="mt-10 items-center py-20 opacity-30">
                            <Text className="text-text-muted font-bold text-lg">Under Construction</Text>
                            <Text className="text-text-muted text-xs mt-2">Will be available in next update</Text>
                        </View>
                    )
                }
            </ScrollView >
        </View >
    );
};

export default DashboardScreen;
