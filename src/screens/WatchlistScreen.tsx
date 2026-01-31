import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { Search, Globe, Coins, Briefcase, ChevronRight, TrendingUp } from 'lucide-react-native';
import { BREEZE_API_URL } from '../config';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList } from '../navigation/RootNavigator';

interface SearchResult {
    symbol: string;
    alias?: string;
    description?: string;
    type?: string;
}

type WatchlistScreenNavigationProp = CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Watchlist'>,
    NativeStackNavigationProp<RootStackParamList>
>;

const WatchlistScreen = () => {
    const navigation = useNavigation<WatchlistScreenNavigationProp>();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeCategory, setActiveCategory] = useState('Equity');
    const [activeRegion, setActiveRegion] = useState('India');

    const [trending, setTrending] = useState<any[]>([]);

    const fetchTrending = async () => {
        try {
            // Updated to use Breeze Service movers endpoint
            const response = await fetch(`${BREEZE_API_URL}/api/movers?filters=liquid`);
            const data = await response.json();
            setTrending(Array.isArray(data) ? data.slice(0, 10) : []);
        } catch (error) {
            console.error("Failed to fetch trending:", error);
        }
    };

    React.useEffect(() => {
        fetchTrending();
    }, []);

    const searchStocks = async (text: string) => {
        setQuery(text);
        if (text.length < 2) {
            setResults([]);
            return;
        }

        try {
            setLoading(true);
            // Updated to use Breeze Service search endpoint
            const response = await fetch(`${BREEZE_API_URL}/api/search?q=${text}`);
            const data = await response.json();
            setResults(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            setLoading(false);
        }
    };

    const categories = ['Global', 'Crypto', 'Equity', 'CFD'];
    const regions = ['India'];

    return (
        <View className="flex-1 bg-background pt-12">
            <View className="px-6 mb-8">
                <Text className="text-3xl font-black text-text-primary">Exploration</Text>
            </View>

            {/* Category Filters */}
            <View className="px-4 mb-4">
                <View className="flex-row justify-between border-b border-border">
                    {categories.map((cat) => (
                        <TouchableOpacity
                            key={cat}
                            onPress={() => cat === 'Equity' && setActiveCategory(cat)}
                            disabled={cat !== 'Equity'}
                            className={`pb-3 px-2 ${activeCategory === cat ? 'border-b-2 border-primary' : ''} ${cat !== 'Equity' ? 'opacity-30' : ''}`}
                        >
                            <Text className={`font-bold ${activeCategory === cat ? 'text-text-primary' : 'text-text-muted'}`}>{cat}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Region Filters (Horizontal) */}
            <View className="mb-6">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pl-4" contentContainerStyle={{ paddingRight: 30 }}>
                    {regions.map((reg) => (
                        <TouchableOpacity
                            key={reg}
                            onPress={() => setActiveRegion(reg)}
                            className={`mr-3 px-6 py-2.5 rounded-full border ${activeRegion === reg ? 'bg-surface border-text-primary' : 'bg-transparent border-border'}`}
                        >
                            <Text className={`font-medium text-sm ${activeRegion === reg ? 'text-text-primary' : 'text-text-muted'}`}>{reg}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Search Input (Premium style) */}
            <View className="px-4 mb-6">
                <View className="bg-surface/50 border border-border rounded-2xl flex-row items-center px-4 py-3">
                    <Search size={20} color="#6B7280" />
                    <TextInput
                        placeholder="Search Indian Stocks (e.g. RELIANCE)"
                        placeholderTextColor="#6B7280"
                        className="flex-1 ml-3 text-text-primary font-medium outline-none"
                        value={query}
                        onChangeText={searchStocks}
                    />
                </View>
            </View>

            {/* Search Results Dropdown */}
            {results.length > 0 && (
                <View className="mx-4 bg-surface rounded-[24px] border border-border mb-6 max-h-60 overflow-hidden shadow-2xl">
                    <FlatList
                        data={results}
                        keyExtractor={(item) => item.symbol}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item, index }) => (
                            <TouchableOpacity
                                className={`p-4 flex-row justify-between items-center active:bg-white/5 ${index !== results.length - 1 ? 'border-b border-border/50' : ''}`}
                                onPress={() => {
                                    navigation.navigate('StockDetail', { symbol: item.symbol });
                                    setQuery('');
                                    setResults([]);
                                }}
                            >
                                <View className="flex-row items-center flex-1">
                                    <View className="w-10 h-10 rounded-full bg-background border border-border items-center justify-center mr-3">
                                        <Text className="text-text-primary font-bold text-xs">{item.symbol.substring(0, 2).toUpperCase()}</Text>
                                    </View>
                                    <View className="flex-1">
                                        <Text className="font-black text-text-primary text-base">{item.symbol}</Text>
                                        <Text className="text-text-muted text-[10px] font-bold uppercase tracking-tighter" numberOfLines={1}>
                                            {item.description || 'Equity • NSE'}
                                        </Text>
                                    </View>
                                </View>
                                <View className="bg-background/50 p-2 rounded-xl">
                                    <ChevronRight size={14} color="#6B7280" />
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            )}

            {/* Trending List */}
            <FlatList
                data={trending}
                keyExtractor={(item) => item.symbol}
                className="px-4 pt-4"
                ListHeaderComponent={<Text className="text-xl font-black text-text-primary mb-6 mt-4">Nifty 50 Movers</Text>}
                renderItem={({ item, index }) => (
                    <TouchableOpacity
                        className="bg-surface p-6 rounded-[32px] border border-border mb-4 flex-row items-center justify-between active:scale-[0.98]"
                        onPress={() => navigation.navigate('StockDetail', { symbol: item.symbol })}
                    >
                        <View className="flex-row items-center flex-1">
                            <View className={`w-14 h-14 rounded-2xl items-center justify-center mr-4 ${item.change >= 0 ? 'bg-success/10' : 'bg-error/10'}`}>
                                <Text className={`font-black text-xl ${item.change >= 0 ? 'text-success' : 'text-error'}`}>{item.symbol[0]}</Text>
                            </View>
                            <View className="flex-1">
                                <Text className="text-text-primary font-black text-lg tracking-tight">{item.symbol.split('.')[0]}</Text>
                                <View className="flex-row items-center mt-1">
                                    <Text className="text-text-secondary text-xs font-medium" numberOfLines={1} style={{ maxWidth: 100 }}>{item.name} • </Text>
                                    <Text className={`text-xs font-bold ${item.change >= 0 ? 'text-success' : 'text-error'}`}>
                                        {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                                    </Text>
                                </View>
                            </View>
                        </View>
                        <View className="items-end">
                            <Text className="text-text-primary font-black text-lg">₹{item.price.toFixed(2)}</Text>
                            <View className="flex-row gap-1 mt-2 items-end h-6">
                                {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                                    <View key={s} className={`w-1 rounded-full ${item.change >= 0 ? 'bg-success' : 'bg-error'}`} style={{ height: Math.abs(Math.sin(s + index)) * 15 + 5, opacity: 0.3 + (s / 10) }} />
                                ))}
                            </View>
                        </View>
                    </TouchableOpacity>
                )}
                ListFooterComponent={<View className="h-20" />}
                ListEmptyComponent={<ActivityIndicator size="large" color="#00E0A1" className="mt-10" />}
                refreshControl={
                    <RefreshControl refreshing={false} onRefresh={fetchTrending} tintColor="#00E0A1" />
                }
            />
        </View>
    );
};

export default WatchlistScreen;
