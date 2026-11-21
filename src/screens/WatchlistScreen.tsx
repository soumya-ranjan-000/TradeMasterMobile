import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Search, ChevronRight, X } from 'lucide-react-native';
import { ScreenHeader, SectionLabel, EmptyState } from '../ui';
import { colors } from '../theme';
import { searchSymbols } from '../api';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

const RECENT_SEARCHES_KEY = 'recent_searches';
/** Typing pause before a search request is sent. */
const SEARCH_DEBOUNCE_MS = 250;

const WatchlistScreen = () => {
    const navigation = useNavigation<WatchlistScreenNavigationProp>();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    useEffect(() => {
        loadRecentSearches();
    }, []);

    const loadRecentSearches = async () => {
        try {
            const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
            if (stored) {
                setRecentSearches(JSON.parse(stored));
            }
        } catch (error) {
            console.error("Failed to load recent searches:", error);
        }
    };

    const addToRecentSearches = async (symbol: string) => {
        try {
            const updated = [symbol, ...recentSearches.filter(s => s !== symbol)].slice(0, 15);
            setRecentSearches(updated);
            await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
        } catch (error) {
            console.error("Failed to save recent search:", error);
        }
    };

    const clearRecentSearches = async () => {
        setRecentSearches([]);
        await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
    };

    // Searches are debounced, and only the latest request's response is applied
    // (an earlier, slower response can't overwrite newer results).
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchSeq = useRef(0);
    useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

    const cancelSearch = () => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = null;
        searchSeq.current++;
        setLoading(false);
    };

    const runSearch = async (text: string, seq: number) => {
        try {
            // Updated to use Breeze Service search endpoint
            const data = await searchSymbols(text);
            if (seq === searchSeq.current) setResults(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            if (seq === searchSeq.current) setLoading(false);
        }
    };

    const searchStocks = (text: string, immediate = false) => {
        setQuery(text);
        cancelSearch();
        if (text.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        const seq = searchSeq.current;
        if (immediate) runSearch(text, seq);
        else searchTimer.current = setTimeout(() => { searchTimer.current = null; runSearch(text, seq); }, SEARCH_DEBOUNCE_MS);
    };

    const clearSearch = () => {
        cancelSearch();
        setQuery('');
        setResults([]);
    };

    const selectRecentSearch = (symbol: string) => {
        const cleanSymbol = symbol.split('.')[0].toUpperCase();
        setQuery(cleanSymbol);
        setResults([]);
        searchStocks(cleanSymbol, true);
    };

    const openStock = (symbol: string) => {
        addToRecentSearches(symbol);
        navigation.navigate('StockDetail', { symbol });
        clearSearch();
    };

    const Chip = ({ label, onPress }: { label: string; onPress: () => void }) => (
        <Pressable onPress={onPress} accessibilityRole="button"
            className="bg-surface px-4 py-2 rounded-full border border-border active:opacity-70">
            <Text className="text-text-primary font-semibold text-[13px]">{label}</Text>
        </Pressable>
    );

    return (
        <View className="flex-1 bg-background">
            <ScreenHeader title="Search" subtitle="NSE stocks by symbol or company name" />

            <View className="px-5 mb-4">
                <View className="bg-surface border border-border rounded-2xl flex-row items-center px-4" style={{ minHeight: 50 }}>
                    <Search size={19} color={colors.textMuted} />
                    <TextInput
                        placeholder="e.g. RELIANCE or Tata Steel"
                        placeholderTextColor={colors.textMuted}
                        className="flex-1 ml-3 text-text-primary font-semibold text-[15px] outline-none py-3"
                        value={query}
                        onChangeText={text => searchStocks(text)}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        returnKeyType="search"
                        accessibilityLabel="Search stocks"
                    />
                    {loading ? <ActivityIndicator size="small" color={colors.primary} /> : query.length > 0 && (
                        <Pressable onPress={clearSearch} accessibilityLabel="Clear search" hitSlop={10}>
                            <X size={18} color={colors.textMuted} />
                        </Pressable>
                    )}
                </View>
            </View>

            {query.length === 0 ? (
                <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
                    {recentSearches.length > 0 && (
                        <View className="mb-6">
                            <SectionLabel right={
                                <Pressable onPress={clearRecentSearches} hitSlop={8}><Text className="text-primary text-xs font-bold">Clear</Text></Pressable>
                            }>Recent</SectionLabel>
                            <View className="flex-row flex-wrap gap-2">
                                {recentSearches.map(s => <Chip key={s} label={s.split('.')[0]} onPress={() => selectRecentSearch(s)} />)}
                            </View>
                        </View>
                    )}
                    <SectionLabel>Popular on NSE</SectionLabel>
                    <View className="flex-row flex-wrap gap-2">
                        {POPULAR.map(s => <Chip key={s} label={s} onPress={() => openStock(s)} />)}
                    </View>
                </ScrollView>
            ) : results.length > 0 ? (
                <FlatList
                    className="flex-1"
                    data={results}
                    keyExtractor={(item) => item.symbol}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                        <Pressable onPress={() => openStock(item.symbol)} accessibilityRole="button"
                            accessibilityLabel={`${item.symbol}${item.description ? ', ' + item.description : ''}`}
                            className="flex-row items-center py-3 border-b border-border active:opacity-70">
                            <View className="w-10 h-10 rounded-2xl bg-surface border border-border items-center justify-center mr-3">
                                <Text className="text-primary font-black text-[15px]">{item.symbol[0]}</Text>
                            </View>
                            <View className="flex-1 mr-2">
                                <Text className="font-black text-text-primary text-[15px]">{item.symbol}</Text>
                                <Text className="text-text-muted text-xs font-semibold mt-0.5" numberOfLines={1}>
                                    {item.description ? titleCase(item.description) : 'NSE · Equity'}
                                </Text>
                            </View>
                            <ChevronRight size={18} color={colors.textMuted} />
                        </Pressable>
                    )}
                />
            ) : !loading && query.length >= 2 ? (
                <EmptyState icon={<Search size={22} color={colors.textMuted} />} title={`No matches for "${query}"`}
                    body="Try the NSE symbol (e.g. HDFCBANK) or part of the company name." />
            ) : null}
        </View>
    );
};

const POPULAR = ['RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'SBIN', 'BHARTIARTL', 'ITC', 'LT', 'TATAMOTORS'];
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bLtd\b/g, 'Ltd');

export default WatchlistScreen;
