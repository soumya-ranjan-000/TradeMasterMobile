import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    StatusBar,
    LayoutAnimation,
    Platform,
    UIManager
} from 'react-native';
import {
    TrendingUp,
    TrendingDown,
    ChevronDown,
    ChevronUp,
    Info,
    ArrowUpRight,
    ArrowDownRight,
    Trophy,
    ShieldAlert,
    Target,
    ArrowUpDown,
    Filter,
    RefreshCw,
    Search
} from 'lucide-react-native';
import { Alert } from 'react-native';
import { WATCHLIST_API_URL } from '../config';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface StockSignal {
    symbol: string;
    name: string;
    price: number;
    side: 'bullish' | 'bearish';
    signal_type: 'READY' | 'WAITING' | 'HOLD';
    confidence: number;
    priority_score: number;
    reasoning: string;
    stop_loss?: number;
    target?: number;
    best_entry?: number;
    analysis_details?: any;
}

const IntradayScreen = () => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [bullishStocks, setBullishStocks] = useState<StockSignal[]>([]);
    const [bearishStocks, setBearishStocks] = useState<StockSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'bullish' | 'bearish'>('bullish');

    // Filters & Sorting
    const [minPrice, setMinPrice] = useState<string>('0');
    const [maxPrice, setMaxPrice] = useState<string>('10000');
    const [sortBy, setSortBy] = useState<'confidence' | 'price'>('confidence');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const fetchSignals = async () => {
        try {
            const [bullRes, bearRes] = await Promise.all([
                fetch(`${WATCHLIST_API_URL}/watchlist/bullish`),
                fetch(`${WATCHLIST_API_URL}/watchlist/bearish`)
            ]);

            const bullish = await bullRes.json();
            const bearish = await bearRes.json();

            setBullishStocks(Array.isArray(bullish) ? bullish : []);
            setBearishStocks(Array.isArray(bearish) ? bearish : []);
        } catch (error) {
            console.error("Failed to fetch intraday signals:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchSignals();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchSignals();
    };

    const triggerNewScan = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${WATCHLIST_API_URL}/watchlist/trigger`, {
                method: 'POST'
            });
            if (response.ok) {
                Alert.alert("Scan Triggered", "AI scanning has started in the background. Please wait a few minutes and reload.");
            } else {
                Alert.alert("Error", "Failed to start new scan.");
            }
        } catch (error) {
            console.error("Scan trigger failed:", error);
            Alert.alert("Error", "Network error while triggering scan.");
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (symbol: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedSymbol(expandedSymbol === symbol ? null : symbol);
    };

    const toggleSort = (type: 'confidence' | 'price') => {
        if (sortBy === type) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(type);
            setSortOrder('desc');
        }
    };

    const getSignalColor = (type: string) => {
        switch (type) {
            case 'READY': return '#10B981';
            case 'WAITING': return '#F59E0B';
            case 'HOLD': return '#6B7280';
            default: return '#6B7280';
        }
    };

    const processStocks = (stocks: StockSignal[]) => {
        // Filter
        let result = stocks.filter(s => {
            const price = s.price;
            const min = parseFloat(minPrice) || 0;
            const max = parseFloat(maxPrice) || 999999;
            const meetsPrice = price >= min && price <= max;
            const isActionable = s.signal_type !== 'HOLD';
            return meetsPrice && isActionable;
        });

        // Sort: Primary by Status (READY > WAITING), Secondary by User Selection
        result.sort((a, b) => {
            const priorityMap = { 'READY': 2, 'WAITING': 1, 'HOLD': 0 };
            const priorityA = priorityMap[a.signal_type] || 0;
            const priorityB = priorityMap[b.signal_type] || 0;

            if (priorityA !== priorityB) {
                return priorityB - priorityA; // READY (2) comes before WAITING (1)
            }

            // Secondary sort based on user preference
            let valA = sortBy === 'price' ? a.price : a.confidence;
            let valB = sortBy === 'price' ? b.price : b.confidence;

            if (sortOrder === 'asc') return valA - valB;
            return valB - valA;
        });

        return result;
    };

    const renderStockCard = (stock: StockSignal) => {
        const isExpanded = expandedSymbol === stock.symbol;
        const sigColor = getSignalColor(stock.signal_type);

        return (
            <TouchableOpacity
                key={stock.symbol}
                onPress={() => toggleExpand(stock.symbol)}
                activeOpacity={0.9}
                className="bg-surface rounded-3xl border border-border/40 mb-3 overflow-hidden"
            >
                <View className="p-5">
                    <View className="flex-row justify-between items-center">
                        <View className="flex-row items-center flex-1">
                            <View
                                className="w-12 h-12 rounded-2xl items-center justify-center mr-4"
                                style={{ backgroundColor: stock.side === 'bullish' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}
                            >
                                {stock.side === 'bullish' ?
                                    <ArrowUpRight size={24} color="#10B981" /> :
                                    <ArrowDownRight size={24} color="#EF4444" />
                                }
                            </View>
                            <View className="flex-1">
                                <Text className="text-text-primary font-black text-lg tracking-tight">{stock.symbol.split('.')[0]}</Text>
                                <View className="flex-row items-center mt-1">
                                    <View
                                        className="px-2 py-0.5 rounded-md mr-2"
                                        style={{ backgroundColor: `${sigColor}20` }}
                                    >
                                        <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: sigColor }}>
                                            {stock.signal_type}
                                        </Text>
                                    </View>
                                    <Text className="text-text-muted text-xs font-bold">{stock.confidence}% Confidence</Text>
                                </View>
                            </View>
                        </View>
                        <View className="items-end">
                            <Text className="text-text-primary font-black text-lg">₹{stock.price.toFixed(2)}</Text>
                            {isExpanded ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
                        </View>
                    </View>

                    {isExpanded && (
                        <View className="mt-5 pt-5 border-t border-border/30">
                            <View className="flex-row justify-between mb-6">
                                <View className="items-center flex-1 border-r border-border/20">
                                    <View className="bg-primary/10 p-2 rounded-full mb-2">
                                        <ArrowUpRight size={16} color="#00E0A1" />
                                    </View>
                                    <Text className="text-text-muted text-[8px] font-bold uppercase mb-1">Entry</Text>
                                    <Text className="text-text-primary font-black text-sm">₹{stock.best_entry?.toFixed(2) || '---'}</Text>
                                </View>
                                <View className="items-center flex-1 border-r border-border/20">
                                    <View className="bg-error/10 p-2 rounded-full mb-2">
                                        <ShieldAlert size={16} color="#EF4444" />
                                    </View>
                                    <Text className="text-text-muted text-[8px] font-bold uppercase mb-1">SL</Text>
                                    <Text className="text-error font-black text-sm">₹{stock.stop_loss?.toFixed(2) || '---'}</Text>
                                </View>
                                <View className="items-center flex-1">
                                    <View className="bg-success/10 p-2 rounded-full mb-2">
                                        <Target size={16} color="#10B981" />
                                    </View>
                                    <Text className="text-text-muted text-[8px] font-bold uppercase mb-1">Target</Text>
                                    <Text className="text-success font-black text-sm">₹{stock.target?.toFixed(2) || '---'}</Text>
                                </View>
                            </View>

                            <View className="bg-background/50 p-4 rounded-2xl border border-border/30 mb-5">
                                <Text className="text-text-muted text-[10px] font-black uppercase mb-2 tracking-widest">Reasoning</Text>
                                <Text className="text-text-primary text-xs leading-5 italic font-medium">
                                    "{stock.reasoning}"
                                </Text>
                            </View>

                            <TouchableOpacity
                                onPress={() => navigation.navigate('DetailedAnalysis', { symbol: stock.symbol, analysis: stock.analysis_details })}
                                className="bg-primary py-4 rounded-2xl flex-row items-center justify-center shadow-lg shadow-primary/20"
                            >
                                <Info size={18} color="white" />
                                <Text className="text-white font-black text-sm ml-2 uppercase tracking-tight">Full Report Analysis</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const currentStocks = activeTab === 'bullish' ? processStocks(bullishStocks) : processStocks(bearishStocks);

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View className="px-6 pt-14 pb-4 flex-row justify-between items-end">
                <View>
                    <Text className="text-text-primary text-3xl font-black">Intraday</Text>
                    <Text className="text-text-muted text-xs font-bold uppercase tracking-widest mt-1">
                        AI Watchlist • {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Text>
                </View>
                <View className="flex-row">
                    <TouchableOpacity
                        onPress={fetchSignals}
                        className="p-3 bg-surface rounded-2xl border border-border/30 mr-2"
                    >
                        <RefreshCw size={18} color="#00E0A1" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={triggerNewScan}
                        className="p-3 bg-primary rounded-2xl shadow-lg shadow-primary/20"
                    >
                        <Search size={18} color="white" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Tab Switcher */}
            <View className="flex-row px-6 mb-4">
                <TouchableOpacity
                    onPress={() => setActiveTab('bullish')}
                    className={`flex-1 py-3 rounded-2xl items-center mr-2 ${activeTab === 'bullish' ? 'bg-success/20 border border-success/40' : 'bg-surface border border-transparent'}`}
                >
                    <Text className={`font-black uppercase text-xs ${activeTab === 'bullish' ? 'text-success' : 'text-text-muted'}`}>Bullish</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setActiveTab('bearish')}
                    className={`flex-1 py-3 rounded-2xl items-center ml-2 ${activeTab === 'bearish' ? 'bg-error/20 border border-error/40' : 'bg-surface border border-transparent'}`}
                >
                    <Text className={`font-black uppercase text-xs ${activeTab === 'bearish' ? 'text-error' : 'text-text-muted'}`}>Bearish</Text>
                </TouchableOpacity>
            </View>

            {/* Price Filter & Sort UI */}
            <View className="px-6 mb-4 flex-row items-center">
                <View className="bg-surface rounded-xl flex-1 flex-row items-center px-3 py-2 border border-border/30 mr-2">
                    <Text className="text-text-muted text-[10px] font-bold mr-2 uppercase">Min ₹</Text>
                    <View className="flex-1">
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {['0', '500', '1000', '2000', '5000'].map(p => (
                                <TouchableOpacity key={p} onPress={() => setMinPrice(p)} className={`px-3 py-1 rounded-lg mr-1 ${minPrice === p ? 'bg-primary' : 'bg-background/50'}`}>
                                    <Text className={`text-[10px] font-bold ${minPrice === p ? 'text-white' : 'text-text-muted'}`}>{p}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>

                {/* Sort Button */}
                <TouchableOpacity
                    onPress={() => toggleSort('price')}
                    className={`px-4 py-3 rounded-xl border flex-row items-center ${sortBy === 'price' ? 'bg-primary/10 border-primary' : 'bg-surface border-border/30'}`}
                >
                    <ArrowUpDown size={14} color={sortBy === 'price' ? '#00E0A1' : '#94A3B8'} />
                    <Text className={`text-[10px] font-bold ml-2 uppercase ${sortBy === 'price' ? 'text-primary' : 'text-text-muted'}`}>
                        {sortBy === 'price' ? (sortOrder === 'asc' ? 'Low → High' : 'High → Low') : 'Price'}
                    </Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#00E0A1" />
                    <Text className="text-text-muted mt-4 font-bold uppercase tracking-widest text-[10px]">Scanning Markets...</Text>
                </View>
            ) : (
                <View className="flex-1">
                    <ScrollView
                        className="flex-1 px-4"
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E0A1" />
                        }
                    >
                        {currentStocks.length > 0 ? (
                            <View className="mt-2 mb-20">
                                {currentStocks.map(renderStockCard)}
                            </View>
                        ) : (
                            <View className="items-center justify-center py-20 opacity-50">
                                <Trophy size={48} color="#94A3B8" strokeWidth={1} />
                                <Text className="text-text-muted font-bold mt-4 text-center">
                                    No {activeTab.toUpperCase()} signals found{"\n"}matching your filters for today.
                                </Text>
                                <TouchableOpacity
                                    onPress={onRefresh}
                                    className="mt-8 bg-surface px-8 py-3 rounded-full border border-border"
                                >
                                    <Text className="text-primary font-black uppercase text-[10px] tracking-widest">Refresh Scan</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
};

export default IntradayScreen;
