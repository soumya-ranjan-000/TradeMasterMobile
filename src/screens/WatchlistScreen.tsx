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

            {/* Empty space at bottom */}
            <View className="h-20" />
        </View>
    );
};

export default WatchlistScreen;
