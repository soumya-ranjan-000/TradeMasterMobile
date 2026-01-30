import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator, Dimensions, PanResponder, Animated } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ChevronLeft, Share2, Star, TrendingUp, Plus } from 'lucide-react-native';
import { BREEZE_API_URL, API_URL } from '../config';
import Svg, { Rect, Line, Defs, LinearGradient as SVGGradiant, Stop, Text as SvgText } from 'react-native-svg';

type StockDetailScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'StockDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_HEIGHT = 350;
const CANDLE_WIDTH_BASE = 12;
const CANDLE_SPACING = 16;

const StockDetailScreen = () => {
    const route = useRoute();
    const navigation = useNavigation<StockDetailScreenNavigationProp>();
    const [chartInterval, setChartInterval] = useState('1D');
    const [stockData, setStockData] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Interaction State
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const scrollRef = useRef<ScrollView>(null);

    const params = route.params as { symbol: string } | undefined;
    const symbol = params?.symbol || 'RELIANCE';

    const fetchStockData = async () => {
        try {
            // Using API_URL (paper trading service) which fetches directly from Breeze
            const response = await fetch(`${API_URL}/market/price?symbol=${symbol}`);
            const data = await response.json();
            setStockData(data);
        } catch (error) {
            console.error("Failed to fetch stock detail:", error);
        }
    };

    const fetchHistory = async () => {
        try {
            setLoading(true);
            let period = '1d';
            let intervalValue = '5m';

            switch (chartInterval) {
                case '5M': period = '1d'; intervalValue = '5m'; break;
                case '15M': period = '1d'; intervalValue = '15m'; break;
                case '1H': period = '5d'; intervalValue = '1h'; break;
                case '1D': period = '1mo'; intervalValue = '1d'; break;
                case '1W': period = '6mo'; intervalValue = '1wk'; break;
            }

            const response = await fetch(`${BREEZE_API_URL}/api/history?symbol=${symbol}&period=${period}&interval=${intervalValue}`);
            const data = await response.json();
            // We only show the last 60 candles to keep it clean, but allow scrolling
            const plotData = Array.isArray(data) ? data : [];
            setHistory(plotData);

            // Auto-scroll to end after a short delay
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
        let timer: any;
        const init = async () => {
            // Always fetch once on load
            fetchStockData();

            try {
                const msRes = await fetch(`${BREEZE_API_URL}/api/market-status`);
                const msData = await msRes.json();

                // Only poll if market is open
                if (msData.is_open) {
                    timer = setInterval(fetchStockData, 10000);
                }
            } catch (e) {
                // Fallback to polling if check fails (but use slower interval)
                timer = setInterval(fetchStockData, 10000);
            }
        };
        init();
        return () => timer && clearInterval(timer);
    }, [symbol]);

    useEffect(() => {
        fetchHistory();
    }, [symbol, chartInterval]);

    const handleTouch = (evt: any) => {
        const x = evt.nativeEvent.locationX;
        const index = Math.floor(x / CANDLE_SPACING);
        if (index >= 0 && index < history.length) {
            setSelectedIndex(index);
        }
    };

    const renderCandleChart = () => {
        if (history.length === 0) return null;

        const maxHigh = Math.max(...history.map(d => d.high));
        const minLow = Math.min(...history.map(d => d.low));
        const range = maxHigh - minLow || 1;
        const totalWidth = history.length * CANDLE_SPACING + 40;

        const getY = (price: number) => 40 + (CHART_HEIGHT - 80) * (1 - (price - minLow) / range);

        const currentPrice = stockData?.price || (history.length > 0 ? history[history.length - 1].close : 0);
        const currentY = getY(currentPrice);

        return (
            <View onTouchStart={handleTouch} onTouchMove={handleTouch} onTouchEnd={() => setSelectedIndex(null)}>
                <Svg width={totalWidth} height={CHART_HEIGHT}>
                    <Defs>
                        <SVGGradiant id="priceLineGradient" x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor="#2563eb" stopOpacity="0.1" />
                            <Stop offset="1" stopColor="#2563eb" stopOpacity="0.5" />
                        </SVGGradiant>
                    </Defs>

                    {/* Current Price Line */}
                    <Line
                        x1="0"
                        y1={currentY}
                        x2={totalWidth}
                        y2={currentY}
                        stroke="#2563eb"
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
                    <TouchableOpacity className="p-2 bg-white/5 rounded-full"><Plus size={20} color="#E1E7ED" /></TouchableOpacity>
                    <TouchableOpacity className="p-2 bg-white/5 rounded-full"><Share2 size={20} color="#E1E7ED" /></TouchableOpacity>
                    <TouchableOpacity className="p-2 bg-white/5 rounded-full"><Star size={20} color="#E1E7ED" /></TouchableOpacity>
                </View>
            </View>

            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                {/* Information Section */}
                <View className="px-6 mt-6">
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center">
                            <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center mr-4 border border-primary/20">
                                <Text className="text-primary font-black text-xl">{symbol[0]}</Text>
                            </View>
                            <View>
                                <Text className="text-text-primary font-black text-2xl tracking-tight">{symbol.split('.')[0]}</Text>
                                <Text className="text-text-muted text-xs font-semibold uppercase tracking-widest mt-0.5">Live Analytics</Text>
                            </View>
                        </View>
                        {selectedCandle ? (
                            <View className="items-end">
                                <Text className="text-text-muted text-[10px] font-bold uppercase mb-1">Price at touch</Text>
                                <Text className="text-text-primary font-bold text-lg">₹{selectedCandle.close.toFixed(2)}</Text>
                            </View>
                        ) : (
                            <View className="items-end">
                                <View className={`px-2 py-1 rounded-lg ${stockData?.change >= 0 ? 'bg-success/10' : 'bg-error/10'}`}>
                                    <Text className={`font-bold text-xs ${stockData?.change >= 0 ? 'text-success' : 'text-error'}`}>
                                        {stockData?.change >= 0 ? 'ACTIVE' : 'BEARISH'}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>

                    <View className="mt-8">
                        <Text className="text-text-primary text-6xl font-black tracking-tighter">
                            ₹{stockData?.price?.toFixed(2) || '---'}
                        </Text>
                        <View className="flex-row items-center mt-3">
                            <View className={`flex-row items-center px-3 py-1.5 rounded-xl mr-3 ${stockData?.change >= 0 ? 'bg-success/10 border border-success/20' : 'bg-error/10 border border-error/20'}`}>
                                <TrendingUp size={16} color={stockData?.change >= 0 ? '#10B981' : '#EF4444'} />
                                <Text className={`font-black text-base ml-2 ${stockData?.change >= 0 ? 'text-success' : 'text-error'}`}>
                                    {stockData?.change_percent ? `${stockData.change_percent.toFixed(2)}%` : '0.00%'}
                                </Text>
                            </View>
                            <Text className="text-text-muted font-bold text-sm tracking-tight">
                                {stockData?.change ? `${stockData.change > 0 ? '+' : ''}${stockData.change.toFixed(2)}` : '0.00'} Since Open
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Interval Bar - Minimalist */}
                <View className="mt-10 px-6">
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
                <View className="mt-4 min-h-[350px]">
                    {loading && history.length === 0 ? (
                        <View className="h-[350px] items-center justify-center">
                            <ActivityIndicator size="large" color="#2563eb" />
                        </View>
                    ) : (
                        <ScrollView
                            ref={scrollRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            className="bg-transparent"
                            contentContainerStyle={{ paddingVertical: 0 }}
                        >
                            {renderCandleChart()}
                        </ScrollView>
                    )}
                </View>

                {/* Action Section */}
                <View className="px-6 mt-4 pb-12">
                    <View className="bg-surface/20 p-6 rounded-[40px] border border-border/40">
                        <View className="flex-row justify-between items-center mb-8">
                            <View>
                                <Text className="text-text-muted text-[10px] font-bold uppercase tracking-[3px]">Buying Power</Text>
                                <Text className="text-text-primary font-black text-xl mt-1">₹84,250.00</Text>
                            </View>
                            <Text className="text-primary font-bold text-xs">RELOAD</Text>
                        </View>

                        <View className="flex-row gap-4">
                            <TouchableOpacity
                                onPress={() => navigation.navigate('Trade', { symbol, side: 'SELL' })}
                                className="flex-1 bg-error/10 border border-error/30 py-6 rounded-[32px] items-center active:scale-[0.96]"
                            >
                                <Text className="text-error font-black text-base tracking-widest uppercase">Short</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => navigation.navigate('Trade', { symbol, side: 'BUY' })}
                                className="flex-1 bg-success/10 border border-success/30 py-6 rounded-[32px] items-center active:scale-[0.96]"
                            >
                                <Text className="text-success font-black text-base tracking-widest uppercase">Buy</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
};

export default StockDetailScreen;
