import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Pressable, Modal, TextInput, FlatList, Alert, Platform, Dimensions, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ChevronLeft, Share2, Star, TrendingUp, Plus, X, Search, ListPlus } from 'lucide-react-native';
import { BREEZE_API_URL, API_URL, TEST_USER_ID } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Rect, Line, Defs, LinearGradient as SVGGradiant, Stop, Text as SvgText, Path, Polyline, G } from 'react-native-svg';
import { Activity, Settings2, PencilLine, BarChart3, Calendar } from 'lucide-react-native';
import { useLivePrice } from '../context/MarketDataContext';

type StockDetailScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'StockDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_HEIGHT = 280;
const CANDLE_WIDTH_BASE = 12;
const CANDLE_SPACING = 16;

const StockDetailScreen = () => {
    const route = useRoute();
    const navigation = useNavigation<StockDetailScreenNavigationProp>();
    const [chartInterval, setChartInterval] = useState('1D');
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [userId, setUserId] = useState<string>(TEST_USER_ID);

    const params = route.params as { symbol: string } | undefined;
    const symbol = params?.symbol || 'RELIANCE';

    // Socket-based live price
    const tick = useLivePrice(symbol);
    const stockData = tick ? {
        price: tick.ltp,
        change: tick.day_change_abs,
        change_percent: tick.day_change_perc
    } : null;

    // Watchlist State
    const [isWatchlistModalVisible, setIsWatchlistModalVisible] = useState(false);
    const [userWatchlists, setUserWatchlists] = useState<any[]>([]);
    const [newWatchlistName, setNewWatchlistName] = useState('');
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [watchLoading, setWatchLoading] = useState(false);
    const [showRangePicker, setShowRangePicker] = useState(false);
    const [chartPeriod, setChartPeriod] = useState('1mo');

    // Interaction State
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
    const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
    const [isDrawingMode, setIsDrawingMode] = useState(false);
    const [drawings, setDrawings] = useState<any[]>([]);
    const [activeDrawing, setActiveDrawing] = useState<any>(null);
    const scrollRef = useRef<ScrollView>(null);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            let period = chartPeriod;
            let intervalValue = '5m';

            if (chartPeriod === 'custom') {
                switch (chartInterval) {
                    case '5M': period = '1d'; intervalValue = '5m'; break;
                    case '15M': period = '1d'; intervalValue = '15m'; break;
                    case '1H': period = '5d'; intervalValue = '1h'; break;
                    case '1D': period = '1mo'; intervalValue = '1d'; break;
                    case '1W': period = '6mo'; intervalValue = '1wk'; break;
                }
            } else {
                // If period is set, choose reasonable interval
                switch (chartPeriod) {
                    case '1d': intervalValue = '5m'; break;
                    case '5d': intervalValue = '1h'; break;
                    case '1mo': intervalValue = '1d'; break;
                    case '3mo': intervalValue = '1d'; break;
                    case '1y': intervalValue = '1wk'; break;
                    default: intervalValue = '1d';
                }
            }

            const response = await fetch(`${BREEZE_API_URL}/api/history?symbol=${symbol}&period=${period}&interval=${intervalValue}`);
            const data = await response.json();
            setHistory(Array.isArray(data) ? data : []);

            setTimeout(() => {
                scrollRef.current?.scrollToEnd({ animated: false });
            }, 100);

        } catch (error) {
            console.error("Failed to fetch history:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [symbol, chartInterval, chartPeriod]);

    const fetchUserWatchlists = async () => {
        try {
            setWatchLoading(true);
            const savedId = await AsyncStorage.getItem('USER_ID');
            const uid = savedId || TEST_USER_ID;
            setUserId(uid);
            const response = await fetch(`${API_URL}/watchlists/${uid}`);
            const data = await response.json();
            setUserWatchlists(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch watchlists:", error);
        } finally {
            setWatchLoading(false);
        }
    };

    const addToWatchlist = async (watchlistId: string) => {
        try {
            setWatchLoading(true);
            const response = await fetch(`${API_URL}/watchlists/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    watchlist_id: watchlistId,
                    symbol: symbol
                })
            });
            if (response.ok) {
                if (Platform.OS === 'web') {
                    alert(`Success: Added ${symbol} to watchlist`);
                } else {
                    Alert.alert("Success", `Added ${symbol} to watchlist`);
                }
                setIsWatchlistModalVisible(false);
            } else {
                const err = await response.json();
                const msg = err.detail || "Failed to add to watchlist";
                if (Platform.OS === 'web') {
                    alert(`Error: ${msg} `);
                } else {
                    Alert.alert("Error", msg);
                }
            }
        } catch (error) {
            console.error("Failed to add to watchlist:", error);
        } finally {
            setWatchLoading(false);
        }
    };

    const createWatchlist = async () => {
        if (!newWatchlistName.trim()) {
            if (Platform.OS === 'web') {
                alert("Error: Please enter a name for the watchlist");
            } else {
                Alert.alert("Error", "Please enter a name for the watchlist");
            }
            return;
        }
        try {
            setWatchLoading(true);
            const response = await fetch(`${API_URL}/watchlists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    name: newWatchlistName,
                    symbols: [symbol]
                })
            });
            if (response.ok) {
                Alert.alert("Success", `Created watchlist "${newWatchlistName}" and added ${symbol}`);
                setNewWatchlistName('');
                setIsCreatingNew(false);
                setIsWatchlistModalVisible(false);
            } else {
                const err = await response.json();
                Alert.alert("Error", err.detail || "Failed to create watchlist");
            }
        } catch (error) {
            console.error("Failed to create watchlist:", error);
        } finally {
            setWatchLoading(false);
        }
    };

    useEffect(() => {
        if (isWatchlistModalVisible) {
            fetchUserWatchlists();
        }
    }, [isWatchlistModalVisible]);

    useEffect(() => {
        fetchHistory();
    }, [symbol, chartInterval, chartPeriod]);

    const handleTouchStart = (evt: any) => {
        const x = evt.nativeEvent.locationX;
        const y = evt.nativeEvent.locationY;
        const index = Math.floor(x / CANDLE_SPACING);

        if (isDrawingMode) {
            const maxHigh = Math.max(...history.map(d => d.high));
            const minLow = Math.min(...history.map(d => d.low));
            const range = maxHigh - minLow || 1;
            const price = maxHigh - ((y - 40) / (CHART_HEIGHT - 80)) * range;

            setActiveDrawing({ startIndex: index, startPrice: price, endIndex: index, endPrice: price });
        } else {
            if (index >= 0 && index < history.length) {
                setSelectedIndex(index);
            }
        }
    };

    const handleTouchMove = (evt: any) => {
        const x = evt.nativeEvent.locationX;
        const y = evt.nativeEvent.locationY;
        const index = Math.floor(x / CANDLE_SPACING);

        if (isDrawingMode && activeDrawing) {
            const maxHigh = Math.max(...history.map(d => d.high));
            const minLow = Math.min(...history.map(d => d.low));
            const range = maxHigh - minLow || 1;
            const price = maxHigh - ((y - 40) / (CHART_HEIGHT - 80)) * range;

            setActiveDrawing({ ...activeDrawing, endIndex: index, endPrice: price });
        } else if (!isDrawingMode) {
            if (index >= 0 && index < history.length) {
                setSelectedIndex(index);
            }
        }
    };

    const handleTouchEnd = () => {
        if (isDrawingMode && activeDrawing) {
            setDrawings([...drawings, activeDrawing]);
            setActiveDrawing(null);
        } else {
            setSelectedIndex(null);
        }
    };

    // --- Indicator Calculations ---
    const calculateSMA = (data: any[], period: number) => {
        if (data.length < period) return [];
        let smas = new Array(period - 1).fill(null);
        for (let i = period - 1; i < data.length; i++) {
            const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
            smas.push(sum / period);
        }
        return smas;
    };

    const calculateRSI = (data: any[], period: number = 14) => {
        if (data.length <= period) return new Array(data.length).fill(null);
        let rsis = new Array(period).fill(null);
        let gains = 0;
        let losses = 0;

        for (let i = 1; i <= period; i++) {
            const diff = data[i].close - data[i - 1].close;
            if (diff > 0) gains += diff;
            else losses -= diff;
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        for (let i = period + 1; i < data.length; i++) {
            const diff = data[i].close - data[i - 1].close;
            const currentGain = diff > 0 ? diff : 0;
            const currentLoss = diff < 0 ? -diff : 0;

            avgGain = (avgGain * (period - 1) + currentGain) / period;
            avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

            const rs = avgGain / (avgLoss || 1);
            rsis.push(100 - (100 / (1 + rs)));
        }
        return rsis;
    };

    const calculateMACD = (data: any[]) => {
        const calculateEMA = (prices: number[], period: number) => {
            const k = 2 / (period + 1);
            let ema = [prices[0]];
            for (let i = 1; i < prices.length; i++) {
                ema.push(prices[i] * k + ema[i - 1] * (1 - k));
            }
            return ema;
        };

        const prices = data.map(d => d.close);
        const ema12 = calculateEMA(prices, 12);
        const ema26 = calculateEMA(prices, 26);
        const macdLine = ema12.map((e12, i) => e12 - ema26[i]);
        const signalLine = calculateEMA(macdLine, 9);
        const histogram = macdLine.map((m, i) => m - signalLine[i]);

        return { macdLine, signalLine, histogram };
    };

    const renderCandleChart = () => {
        if (history.length === 0) return null;

        const maxHigh = Math.max(...history.map(d => d.high));
        const minLow = Math.min(...history.map(d => d.low));
        const range = maxHigh - minLow || 1;
        const totalWidth = history.length * CANDLE_SPACING + 40;

        const getY = (price: number, h: number = CHART_HEIGHT) => 40 + (h - 80) * (1 - (price - minLow) / range);

        const currentPrice = stockData?.price || (history.length > 0 ? history[history.length - 1].close : 0);
        const currentY = getY(currentPrice);

        // Calculations for indicators
        const sma50 = activeIndicators.includes('SMA50') ? calculateSMA(history, 50) : [];
        const sma200 = activeIndicators.includes('SMA200') ? calculateSMA(history, 200) : [];
        const rsiLevels = activeIndicators.includes('RSI') ? calculateRSI(history) : [];
        const macdData = activeIndicators.includes('MACD') ? calculateMACD(history) : null;

        const subChartHeight = 120;
        const totalSvgHeight = CHART_HEIGHT +
            (activeIndicators.includes('RSI') ? subChartHeight : 0) +
            (activeIndicators.includes('MACD') ? subChartHeight : 0);

        return (
            <View onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
                <Svg width={totalWidth} height={totalSvgHeight}>
                    <Defs>
                        <SVGGradiant id="priceLineGradient" x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor="#00E0A1" stopOpacity="0.1" />
                            <Stop offset="1" stopColor="#00E0A1" stopOpacity="0.5" />
                        </SVGGradiant>
                    </Defs>

                    {/* Main Price Chart */}
                    <G>
                        {/* Current Price Line */}
                        <Line
                            x1="0"
                            y1={currentY}
                            x2={totalWidth}
                            y2={currentY}
                            stroke="#00E0A1"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                            opacity="0.3"
                        />

                        {history.map((d, i) => {
                            const isBullish = d.close >= d.open;
                            const color = isBullish ? '#10B981' : '#EF4444';
                            const x = i * CANDLE_SPACING + (CANDLE_SPACING - CANDLE_WIDTH_BASE) / 2;

                            const highY = getY(d.high);
                            const lowY = getY(d.low);
                            const openY = getY(d.open);
                            const closeY = getY(d.close);

                            const rectTop = Math.min(openY, closeY);
                            const rectHeight = Math.max(Math.abs(openY - closeY), 1.5);

                            const isHighlighted = selectedIndex === i;

                            return (
                                <React.Fragment key={i}>
                                    {isHighlighted && (
                                        <Rect
                                            x={i * CANDLE_SPACING}
                                            y="0"
                                            width={CANDLE_SPACING}
                                            height={CHART_HEIGHT}
                                            fill="white"
                                            opacity="0.05"
                                        />
                                    )}
                                    {/* Wick */}
                                    <Line
                                        x1={x + CANDLE_WIDTH_BASE / 2}
                                        y1={highY}
                                        x2={x + CANDLE_WIDTH_BASE / 2}
                                        y2={lowY}
                                        stroke={color}
                                        strokeWidth="1.2"
                                        opacity={selectedIndex !== null && !isHighlighted ? 0.3 : 1}
                                    />
                                    {/* Body */}
                                    <Rect
                                        x={x}
                                        y={rectTop}
                                        width={CANDLE_WIDTH_BASE}
                                        height={rectHeight}
                                        fill={color}
                                        rx={2}
                                        opacity={selectedIndex !== null && !isHighlighted ? 0.3 : 1}
                                    />
                                </React.Fragment>
                            );
                        })}

                        {/* SMA Overlays */}
                        {sma50.length > 0 && (
                            <Polyline
                                points={sma50.map((v, i) => v !== null ? `${i * CANDLE_SPACING + CANDLE_SPACING / 2},${getY(v)}` : '').filter(p => p).join(' ')}
                                fill="none"
                                stroke="#3B82F6"
                                strokeWidth="1.5"
                                opacity="0.8"
                            />
                        )}
                        {sma200.length > 0 && (
                            <Polyline
                                points={sma200.map((v, i) => v !== null ? `${i * CANDLE_SPACING + CANDLE_SPACING / 2},${getY(v)}` : '').filter(p => p).join(' ')}
                                fill="none"
                                stroke="#F59E0B"
                                strokeWidth="1.5"
                                opacity="0.8"
                            />
                        )}

                        {/* Interaction Tooltip Label */}
                        {selectedIndex !== null && (
                            <React.Fragment>
                                <Line
                                    x1={selectedIndex * CANDLE_SPACING + CANDLE_SPACING / 2}
                                    y1="0"
                                    x2={selectedIndex * CANDLE_SPACING + CANDLE_SPACING / 2}
                                    y2={CHART_HEIGHT}
                                    stroke="white"
                                    strokeWidth="0.5"
                                    strokeDasharray="2 2"
                                />
                                <Rect
                                    x={Math.min(selectedIndex * CANDLE_SPACING - 30, totalWidth - 80)}
                                    y={getY(history[selectedIndex].close) - 25}
                                    width="70"
                                    height="20"
                                    rx="4"
                                    fill="#1F2937"
                                />
                                <SvgText
                                    x={Math.min(selectedIndex * CANDLE_SPACING + 5, totalWidth - 45)}
                                    y={getY(history[selectedIndex].close) - 11}
                                    fill="white"
                                    fontSize="10"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                >
                                    {history[selectedIndex].close.toFixed(2)}
                                </SvgText>
                            </React.Fragment>
                        )}

                        {/* Drawings (Trendlines) */}
                        {drawings.map((draw, i) => (
                            <Line
                                key={`draw-${i}`}
                                x1={draw.startIndex * CANDLE_SPACING + CANDLE_SPACING / 2}
                                y1={getY(draw.startPrice)}
                                x2={draw.endIndex * CANDLE_SPACING + CANDLE_SPACING / 2}
                                y2={getY(draw.endPrice)}
                                stroke="#10B981"
                                strokeWidth="2"
                                opacity="0.6"
                            />
                        ))}

                        {/* Active Drawing Preview */}
                        {activeDrawing && (
                            <Line
                                x1={activeDrawing.startIndex * CANDLE_SPACING + CANDLE_SPACING / 2}
                                y1={getY(activeDrawing.startPrice)}
                                x2={activeDrawing.endIndex * CANDLE_SPACING + CANDLE_SPACING / 2}
                                y2={getY(activeDrawing.endPrice)}
                                stroke="#10B981"
                                strokeWidth="2"
                                strokeDasharray="5 5"
                                opacity="0.8"
                            />
                        )}
                    </G>

                    {/* RSI Sub-chart */}
                    {activeIndicators.includes('RSI') && (
                        <G transform={`translate(0, ${CHART_HEIGHT})`}>
                            <Line x1="0" y1="0" x2={totalWidth} y2="0" stroke="#2A2E39" strokeWidth="1" />
                            <Line x1="0" y1={subChartHeight * 0.3} x2={totalWidth} y2={subChartHeight * 0.3} stroke="#2A2E39" strokeWidth="0.5" strokeDasharray="5 5" />
                            <Line x1="0" y1={subChartHeight * 0.7} x2={totalWidth} y2={subChartHeight * 0.7} stroke="#2A2E39" strokeWidth="0.5" strokeDasharray="5 5" />
                            <Polyline
                                points={rsiLevels.map((v, i) => v !== null ? `${i * CANDLE_SPACING + CANDLE_SPACING / 2},${subChartHeight * (1 - v / 100)}` : '').filter(p => p).join(' ')}
                                fill="none"
                                stroke="#8B5CF6"
                                strokeWidth="1.5"
                            />
                            <SvgText x="10" y="15" fill="#8B5CF6" fontSize="10" fontWeight="bold">RSI (14)</SvgText>
                        </G>
                    )}

                    {/* MACD Sub-chart */}
                    {activeIndicators.includes('MACD') && macdData && (
                        <G transform={`translate(0, ${CHART_HEIGHT + (activeIndicators.includes('RSI') ? subChartHeight : 0)})`}>
                            <Line x1="0" y1="0" x2={totalWidth} y2="0" stroke="#2A2E39" strokeWidth="1" />
                            {/* Histogram */}
                            {macdData.histogram.map((h, i) => {
                                const barH = Math.abs(h) * 2;
                                return (
                                    <Rect
                                        key={i}
                                        x={i * CANDLE_SPACING + (CANDLE_SPACING - 3) / 2}
                                        y={h >= 0 ? subChartHeight / 2 - barH : subChartHeight / 2}
                                        width="3"
                                        height={barH}
                                        fill={h >= 0 ? '#10B981' : '#EF4444'}
                                        opacity="0.5"
                                    />
                                );
                            })}
                            {/* MACD Line */}
                            <Polyline
                                points={macdData.macdLine.map((v, i) => `${i * CANDLE_SPACING + CANDLE_SPACING / 2},${subChartHeight / 2 - v * 2}`).join(' ')}
                                fill="none"
                                stroke="#3B82F6"
                                strokeWidth="1.2"
                            />
                            {/* Signal Line */}
                            <Polyline
                                points={macdData.signalLine.map((v, i) => `${i * CANDLE_SPACING + CANDLE_SPACING / 2},${subChartHeight / 2 - v * 2}`).join(' ')}
                                fill="none"
                                stroke="#F59E0B"
                                strokeWidth="1.2"
                            />
                            <SvgText x="10" y="15" fill="#E1E7ED" fontSize="10" fontWeight="bold">MACD (12, 26, 9)</SvgText>
                        </G>
                    )}
                </Svg>
            </View>
        );
    };

    const intervals = ['5M', '15M', '1H', '1D', '1W'];
    const selectedCandle = selectedIndex !== null ? history[selectedIndex] : null;

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />

            {/* Premium Header */}
            <View className="flex-row justify-between items-center px-6 pt-12 pb-4">
                <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 -ml-2 bg-white/5 rounded-full">
                    <ChevronLeft size={24} color="#E1E7ED" />
                </TouchableOpacity>
                <View className="flex-row gap-3">
                    <TouchableOpacity
                        onPress={() => setIsWatchlistModalVisible(true)}
                        className="p-2 bg-white/5 rounded-full"
                    >
                        <Plus size={20} color="#E1E7ED" />
                    </TouchableOpacity>
                    <TouchableOpacity className="p-2 bg-white/5 rounded-full"><Share2 size={20} color="#E1E7ED" /></TouchableOpacity>
                    <TouchableOpacity className="p-2 bg-white/5 rounded-full"><Star size={20} color="#E1E7ED" /></TouchableOpacity>
                </View>
            </View>

            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                {/* Information Section */}
                <View className="px-6 mt-4">
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center mr-3 border border-primary/20">
                                <Text className="text-primary font-black text-lg">{symbol[0]}</Text>
                            </View>
                            <View>
                                <Text className="text-text-primary font-black text-xl tracking-tight">{symbol.split('.')[0]}</Text>
                                <Text className="text-text-muted text-[10px] font-semibold uppercase tracking-widest mt-0.5">Live Analytics</Text>
                            </View>
                        </View>
                        {selectedCandle ? (
                            <View className="items-end">
                                <Text className="text-text-muted text-[10px] font-bold uppercase mb-1">Price at touch</Text>
                                <Text className="text-text-primary font-bold text-lg">₹{selectedCandle.close.toFixed(2)}</Text>
                            </View>
                        ) : (
                            <View className="items-end">
                                <View className={`px-2 py-1 rounded-lg ${(stockData?.change ?? 0) >= 0 ? 'bg-success/10' : 'bg-error/10'}`}>
                                    <Text className={`font-bold text-xs ${(stockData?.change ?? 0) >= 0 ? 'text-success' : 'text-error'}`}>
                                        {(stockData?.change ?? 0) >= 0 ? 'ACTIVE' : 'BEARISH'}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>

                    <View className="mt-6">
                        <Text className="text-text-primary text-5xl font-black tracking-tighter">
                            ₹{stockData?.price?.toFixed(2) || '---'}
                        </Text>
                        <View className="flex-row items-center mt-2">
                            <View className={`flex-row items-center px-3 py-1.5 rounded-xl mr-3 ${(stockData?.change ?? 0) >= 0 ? 'bg-success/10 border border-success/20' : 'bg-error/10 border border-error/20'}`}>
                                <TrendingUp size={16} color={(stockData?.change ?? 0) >= 0 ? '#10B981' : '#EF4444'} />
                                <Text className={`font-black text-base ml-2 ${(stockData?.change ?? 0) >= 0 ? 'text-success' : 'text-error'}`}>
                                    {stockData?.change_percent ? `${stockData.change_percent.toFixed(2)}%` : '0.00%'}
                                </Text>
                            </View>
                            <Text className="text-text-muted font-bold text-sm tracking-tight">
                                {stockData?.change !== undefined ? `${stockData.change > 0 ? '+' : ''}${stockData.change.toFixed(2)}` : '0.00'} Since Open
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Interval & Analysis Bar */}
                <View className="mt-6 px-6">
                    <View className="flex-row items-center justify-between mb-4">
                        <View className="flex-row items-center gap-2">
                            <Activity size={16} color="#00E0A1" />
                            <Text className="text-text-primary font-bold text-sm">Analysis Tools</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setShowIndicatorMenu(!showIndicatorMenu)}
                            className="bg-surface/50 p-2 px-3 rounded-lg border border-border/50 flex-row items-center gap-2"
                        >
                            <Settings2 size={14} color="#E1E7ED" />
                            <Text className="text-text-primary text-[10px] font-bold uppercase">Indicators ({activeIndicators.length})</Text>
                        </TouchableOpacity>
                    </View>

                    {showIndicatorMenu && (
                        <View className="bg-surface/20 p-4 rounded-2xl border border-border/30 mb-4 flex-row flex-wrap gap-2">
                            {['SMA50', 'SMA200', 'RSI', 'MACD'].map((ind) => (
                                <TouchableOpacity
                                    key={ind}
                                    onPress={() => {
                                        if (activeIndicators.includes(ind)) {
                                            setActiveIndicators(activeIndicators.filter(a => a !== ind));
                                        } else {
                                            setActiveIndicators([...activeIndicators, ind]);
                                        }
                                    }}
                                    className={`px-3 py-1.5 rounded-lg border ${activeIndicators.includes(ind) ? 'bg-primary/20 border-primary' : 'bg-background border-border/50'}`}
                                >
                                    <Text className={`text-[10px] font-bold ${activeIndicators.includes(ind) ? 'text-primary' : 'text-text-muted'}`}>{ind}</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                                onPress={() => setShowRangePicker(true)}
                                className="px-3 py-1.5 rounded-lg border bg-background border-border/50 flex-row items-center gap-1"
                            >
                                <Calendar size={12} color="#6B7280" />
                                <Text className="text-[10px] font-bold text-text-muted">Period: {chartPeriod.toUpperCase()}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setIsDrawingMode(!isDrawingMode)}
                                className={`px-3 py-1.5 rounded-lg border flex-row items-center gap-1 ${isDrawingMode ? 'bg-primary/20 border-primary' : 'bg-background border-border/50'}`}
                            >
                                <PencilLine size={12} color={isDrawingMode ? "#00E0A1" : "#6B7280"} />
                                <Text className={`text-[10px] font-bold ${isDrawingMode ? 'text-primary' : 'text-text-muted'}`}>Draw Tools</Text>
                            </TouchableOpacity>
                            {drawings.length > 0 && (
                                <TouchableOpacity
                                    onPress={() => setDrawings([])}
                                    className="px-3 py-1.5 rounded-lg border bg-error/10 border-error/20 flex-row items-center gap-1"
                                >
                                    <X size={10} color="#EF4444" />
                                    <Text className="text-[10px] font-bold text-error">Clear</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    <View className="bg-surface/30 p-1 rounded-2xl flex-row justify-between border border-border/50">
                        {intervals.map((item) => (
                            <TouchableOpacity
                                key={item}
                                onPress={() => setChartInterval(item)}
                                className={`px-5 py-2.5 rounded-xl ${chartInterval === item ? 'bg-surface shadow-sm border border-border' : ''}`}
                            >
                                <Text className={`font-black text-xs ${chartInterval === item ? 'text-text-primary' : 'text-text-muted'}`}>{item}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Interactive Chart - No Boundaries, Immersive */}
                <View className="mt-4 min-h-[280px]">
                    {loading && history.length === 0 ? (
                        <View className="h-[280px] items-center justify-center">
                            <ActivityIndicator size="large" color="#00E0A1" />
                        </View>
                    ) : (
                        <ScrollView
                            ref={scrollRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            className="bg-transparent"
                            contentContainerStyle={{ paddingVertical: 0, minWidth: SCREEN_WIDTH, justifyContent: 'center' }}
                        >
                            {renderCandleChart()}
                        </ScrollView>
                    )}
                </View>

                {/* Action Section */}
                <View className="px-6 mt-2 pb-12">
                    <View className="bg-surface/20 p-5 rounded-[32px] border border-border/40">
                        <View className="flex-row justify-between items-center mb-4">
                            <View>
                                <Text className="text-text-muted text-[10px] font-bold uppercase tracking-[3px]">Buying Power</Text>
                                <Text className="text-text-primary font-black text-xl mt-1">₹84,250.00</Text>
                            </View>
                            <Text className="text-primary font-bold text-xs">RELOAD</Text>
                        </View>

                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => navigation.navigate('Trade', { symbol, side: 'SELL' })}
                                className="flex-1 bg-error/10 border border-error/30 py-4 rounded-3xl items-center justify-center active:scale-[0.96]"
                            >
                                <Text className="text-error font-black text-sm tracking-wider uppercase" numberOfLines={1}>Short</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => navigation.navigate('Trade', { symbol, side: 'BUY' })}
                                className="flex-1 bg-success/10 border border-success/30 py-4 rounded-3xl items-center justify-center active:scale-[0.96]"
                            >
                                <Text className="text-success font-black text-sm tracking-wider uppercase" numberOfLines={1}>Buy</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </ScrollView>

            {/* Watchlist Modal */}
            <Modal
                visible={isWatchlistModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setIsWatchlistModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/60">
                    <View className="bg-surface rounded-t-[40px] border-t border-border p-8 min-h-[50%]">
                        <View className="flex-row justify-between items-center mb-8">
                            <View>
                                <Text className="text-text-primary text-2xl font-black">Add to Watchlist</Text>
                                <Text className="text-text-muted text-sm font-bold">{symbol}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => {
                                    setIsWatchlistModalVisible(false);
                                    setIsCreatingNew(false);
                                }}
                                className="w-10 h-10 bg-background rounded-full items-center justify-center border border-border"
                            >
                                <X size={20} color="#E1E7ED" />
                            </TouchableOpacity>
                        </View>

                        {isCreatingNew ? (
                            <View>
                                <View className="flex-row items-center mb-4">
                                    <ListPlus size={18} color="#2563eb" />
                                    <Text className="text-text-primary font-bold ml-2 text-base">New Watchlist Name</Text>
                                </View>
                                <TextInput
                                    className="bg-background border border-border p-5 rounded-2xl text-text-primary font-bold text-lg mb-6"
                                    placeholder="Enter Watchlist Name"
                                    placeholderTextColor="#6B7280"
                                    autoFocus
                                    value={newWatchlistName}
                                    onChangeText={setNewWatchlistName}
                                />
                                <View className="flex-row gap-4">
                                    <TouchableOpacity
                                        onPress={() => setIsCreatingNew(false)}
                                        className="flex-1 py-4 rounded-2xl border border-border items-center"
                                    >
                                        <Text className="text-text-muted font-bold">Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        disabled={watchLoading}
                                        onPress={createWatchlist}
                                        className={`flex-1 py-4 rounded-2xl items-center ${watchLoading ? 'bg-primary/50' : 'bg-primary'}`}
                                    >
                                        {watchLoading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">Create & Add</Text>}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View className="flex-1">
                                {watchLoading && userWatchlists.length === 0 ? (
                                    <ActivityIndicator size="large" color="#2563eb" className="mt-10" />
                                ) : (
                                    <FlatList
                                        data={userWatchlists}
                                        keyExtractor={(item) => item._id || item.id}
                                        ListHeaderComponent={
                                            <TouchableOpacity
                                                onPress={() => setIsCreatingNew(true)}
                                                className="flex-row items-center p-5 bg-primary/10 rounded-2xl border border-primary/20 mb-4"
                                            >
                                                <ListPlus size={20} color="#2563eb" className="mr-3" />
                                                <Text className="text-primary font-bold ml-3">Create New Watchlist</Text>
                                            </TouchableOpacity>
                                        }
                                        renderItem={({ item }) => (
                                            <TouchableOpacity
                                                onPress={() => addToWatchlist(item._id || item.id)}
                                                className="flex-row items-center justify-between p-5 bg-background border border-border rounded-2xl mb-3"
                                            >
                                                <View>
                                                    <Text className="text-text-primary font-bold">{item.name}</Text>
                                                    <Text className="text-text-muted text-xs">{item.symbols?.length || 0} stocks</Text>
                                                </View>
                                                {item.symbols?.includes(symbol) ? (
                                                    <View className="bg-success/20 px-3 py-1 rounded-full">
                                                        <Text className="text-success text-[10px] font-bold">ADDED</Text>
                                                    </View>
                                                ) : (
                                                    <Plus size={18} color="#6B7280" />
                                                )}
                                            </TouchableOpacity>
                                        )}
                                        ListEmptyComponent={
                                            <View className="items-center mt-10 py-10 opacity-50">
                                                <Text className="text-text-muted font-bold">No watchlists found</Text>
                                            </View>
                                        }
                                        contentContainerStyle={{ paddingBottom: 40 }}
                                    />
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
            {/* Period/Range Picker Modal */}
            <Modal
                visible={showRangePicker}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setShowRangePicker(false)}
            >
                <Pressable
                    className="flex-1 bg-black/60 items-center justify-center p-6"
                    onPress={() => setShowRangePicker(false)}
                >
                    <View className="bg-surface w-full rounded-[32px] border border-border p-6" onStartShouldSetResponder={() => true}>
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-text-primary text-xl font-black">Select Period</Text>
                            <TouchableOpacity onPress={() => setShowRangePicker(false)}>
                                <X size={20} color="#E1E7ED" />
                            </TouchableOpacity>
                        </View>
                        <View className="gap-3">
                            {[
                                { label: '1 Day', value: '1d' },
                                { label: '5 Days', value: '5d' },
                                { label: '1 Month', value: '1mo' },
                                { label: '3 Months', value: '3mo' },
                                { label: '1 Year', value: '1y' },
                                { label: 'YTD', value: 'ytd' },
                                { label: 'Custom Range', value: 'custom' },
                            ].map((p) => (
                                <TouchableOpacity
                                    key={p.value}
                                    onPress={() => {
                                        setChartPeriod(p.value);
                                        setShowRangePicker(false);
                                    }}
                                    className={`p-4 rounded-2xl flex-row justify-between items-center ${chartPeriod === p.value ? 'bg-primary/10 border border-primary/30' : 'bg-background border border-border/50'}`}
                                >
                                    <Text className={`font-bold ${chartPeriod === p.value ? 'text-primary' : 'text-text-primary'}`}>{p.label}</Text>
                                    {chartPeriod === p.value && <View className="w-2 h-2 rounded-full bg-primary" />}
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity
                            onPress={() => setShowRangePicker(false)}
                            className="mt-6 py-4 bg-surface border border-border rounded-2xl items-center"
                        >
                            <Text className="text-text-muted font-bold">Close</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
};

export default StockDetailScreen;
