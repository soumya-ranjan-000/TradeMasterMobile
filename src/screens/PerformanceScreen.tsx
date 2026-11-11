import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, TrendingUp, Target, BarChart3, PieChart as PieIcon, Calendar, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react-native';
import { API_URL, TEST_USER_ID } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect, Circle, G, Line, Text as SvgText, Defs, LinearGradient as SVGGradiant, Stop } from 'react-native-svg';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 48;
const CHART_HEIGHT = 200;

const PerformanceScreen = () => {
    const navigation = useNavigation();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [equityCurve, setEquityCurve] = useState<any[]>([]);

    const fetchAnalytics = async () => {
        try {
            setLoading(true);
            const savedId = await AsyncStorage.getItem('USER_ID');
            const uid = savedId || TEST_USER_ID;

            // Closed trades, NET of charges (paper service /analytics).
            const res = await fetch(`${API_URL}/analytics/${encodeURIComponent(uid)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const a = await res.json();
            setStats({
                winRate: a.win_rate ?? 0,
                profitFactor: a.profit_factor ?? null,      // null = no losing trades yet
                avgWin: Math.round(a.avg_win ?? 0),
                avgLoss: Math.round(Math.abs(a.avg_loss ?? 0)),
                totalTrades: a.total_trades ?? 0,
                winningTrades: a.winning_trades ?? 0,
                totalProfit: a.net_pnl ?? 0,
                totalCharges: a.total_charges ?? 0,
                expectancy: a.expectancy ?? 0,
                maxDrawdown: a.max_drawdown_pct ?? 0,
                returnPct: a.return_pct ?? 0,
            });
            setEquityCurve((a.equity_curve || []).map((p: any) => p.equity));
            setLoading(false);

        } catch (error) {
            console.error("Failed to fetch analytics:", error);
            setStats(null);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const renderEquityChart = () => {
        if (equityCurve.length < 2) return null;

        const max = Math.max(...equityCurve);
        const min = Math.min(...equityCurve);
        const range = max - min || 1;

        const getX = (i: number) => (i / (equityCurve.length - 1)) * CHART_WIDTH;
        const getY = (v: number) => CHART_HEIGHT * (1 - (v - min) / range);

        let path = `M ${getX(0)} ${getY(equityCurve[0])}`;
        for (let i = 1; i < equityCurve.length; i++) {
            path += ` L ${getX(i)} ${getY(equityCurve[i])}`;
        }

        const areaPath = `${path} L ${getX(equityCurve.length - 1)} ${CHART_HEIGHT} L 0 ${CHART_HEIGHT} Z`;

        return (
            <View className="bg-surface rounded-[32px] border border-border p-6 mb-6">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-text-primary font-black text-lg">Equity Curve</Text>
                    <View className="bg-success/10 px-3 py-1 rounded-full">
                        <Text className="text-success text-[10px] font-bold">+18.5% Total</Text>
                    </View>
                </View>

                <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                    <Defs>
                        <SVGGradiant id="fade" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor="#00E0A1" stopOpacity="0.3" />
                            <Stop offset="1" stopColor="#00E0A1" stopOpacity="0" />
                        </SVGGradiant>
                    </Defs>
                    <Path d={areaPath} fill="url(#fade)" />
                    <Path d={path} fill="none" stroke="#00E0A1" strokeWidth="3" />

                    {/* Grid lines */}
                    <Line x1="0" y1={CHART_HEIGHT / 2} x2={CHART_WIDTH} y2={CHART_HEIGHT / 2} stroke="#2A2E39" strokeWidth="1" strokeDasharray="5 5" />
                </Svg>

                <View className="flex-row justify-between mt-4">
                    <Text className="text-text-muted text-[10px] font-bold uppercase tracking-widest">30 Days Ago</Text>
                    <Text className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Today</Text>
                </View>
            </View>
        );
    };

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <LinearGradient
                colors={['#1C1F26', '#0E1116']}
                className="px-6 pt-12 pb-6 border-b border-border/30"
            >
                <View className="flex-row items-center justify-between">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 -ml-2 bg-white/5 rounded-full">
                        <ChevronLeft size={24} color="#E1E7ED" />
                    </TouchableOpacity>
                    <Text className="text-xl font-black text-text-primary">Performance Analytics</Text>
                    <TouchableOpacity onPress={fetchAnalytics} className="p-2 bg-white/5 rounded-full">
                        <Calendar size={20} color="#00E0A1" />
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#00E0A1" />
                    <Text className="text-text-muted font-bold mt-4">Analyzing your trades...</Text>
                </View>
            ) : !stats ? (
                <View className="flex-1 items-center justify-center px-8">
                    <Text className="text-text-muted font-bold text-center">Could not load analytics from the paper trading service.</Text>
                    <TouchableOpacity onPress={fetchAnalytics} className="mt-4 px-6 py-3 bg-primary rounded-xl">
                        <Text className="text-white font-black uppercase text-xs">Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>

                    {renderEquityChart()}

                    {/* Stats Grid */}
                    <View className="flex-row flex-wrap justify-between gap-4 mb-6">
                        <View className="bg-surface rounded-3xl border border-border p-5 w-[47%]">
                            <View className="flex-row items-center mb-2">
                                <Target size={14} color="#00E0A1" />
                                <Text className="text-text-muted text-[10px] font-bold uppercase ml-2">Win Rate</Text>
                            </View>
                            <Text className="text-text-primary text-2xl font-black">{stats.winRate}%</Text>
                            <View className="mt-2 w-full h-1 bg-background rounded-full overflow-hidden">
                                <View className="h-full bg-primary" style={{ width: `${stats.winRate}%` }} />
                            </View>
                        </View>

                        <View className="bg-surface rounded-3xl border border-border p-5 w-[47%]">
                            <View className="flex-row items-center mb-2">
                                <TrendingUp size={14} color="#00E0A1" />
                                <Text className="text-text-muted text-[10px] font-bold uppercase ml-2">Profit Factor</Text>
                            </View>
                            <Text className="text-text-primary text-2xl font-black">{stats.profitFactor ?? '—'}</Text>
                            <Text className="text-success text-[10px] font-bold mt-1">Excellent Range</Text>
                        </View>

                        <View className="bg-surface rounded-3xl border border-border p-5 w-[47%]">
                            <View className="flex-row items-center mb-2">
                                <ArrowUpRight size={14} color="#10B981" />
                                <Text className="text-text-muted text-[10px] font-bold uppercase ml-2">Avg Win</Text>
                            </View>
                            <Text className="text-text-primary text-2xl font-black">₹{stats.avgWin}</Text>
                        </View>

                        <View className="bg-surface rounded-3xl border border-border p-5 w-[47%]">
                            <View className="flex-row items-center mb-2">
                                <ArrowDownRight size={14} color="#EF4444" />
                                <Text className="text-text-muted text-[10px] font-bold uppercase ml-2">Avg Loss</Text>
                            </View>
                            <Text className="text-text-primary text-2xl font-black">₹{stats.avgLoss}</Text>
                        </View>
                    </View>

                    {/* Trade Distribution */}
                    <View className="bg-surface rounded-[32px] border border-border p-6 mb-20">
                        <Text className="text-text-primary font-black text-lg mb-6">Trade Distribution</Text>

                        <View className="flex-row justify-between items-center mb-4">
                            <View className="flex-row items-center">
                                <View className="w-2 h-2 rounded-full bg-success mr-2" />
                                <Text className="text-text-muted text-xs font-bold">Winning Trades</Text>
                            </View>
                            <Text className="text-text-primary font-black">{stats.winningTrades}</Text>
                        </View>

                        <View className="flex-row justify-between items-center mb-6">
                            <TouchableOpacity className="flex-row items-center">
                                <View className="w-2 h-2 rounded-full bg-error mr-2" />
                                <Text className="text-text-muted text-xs font-bold">Losing Trades</Text>
                            </TouchableOpacity>
                            <Text className="text-text-primary font-black">{stats.totalTrades - stats.winningTrades}</Text>
                        </View>

                        <View className="flex-row h-4 bg-background rounded-full overflow-hidden border border-border">
                            <View style={{ width: `${stats.totalTrades ? (stats.winningTrades / stats.totalTrades) * 100 : 0}%` }} className="bg-success" />
                            <View className="flex-1 bg-error" />
                        </View>

                        <View className="mt-8 p-4 bg-primary/5 rounded-2xl border border-primary/10 flex-row items-center">
                            <Info size={18} color="#00E0A1" />
                            <Text className="text-text-muted text-[11px] font-bold flex-1 ml-3 leading-tight">
                                {stats.totalTrades === 0
                                    ? 'No closed trades yet. Stats are net of brokerage, taxes and slippage.'
                                    : `Net P&L ₹${Math.round(stats.totalProfit).toLocaleString()} after ₹${Math.round(stats.totalCharges).toLocaleString()} charges • Expectancy ₹${Math.round(stats.expectancy)}/trade • Max drawdown ${stats.maxDrawdown}%` +
                                      (stats.avgLoss > 0 ? ` • Avg win/loss ${(stats.avgWin / stats.avgLoss).toFixed(1)}x` : '')}
                            </Text>
                        </View>
                    </View>

                </ScrollView>
            )}
        </View>
    );
};

export default PerformanceScreen;
