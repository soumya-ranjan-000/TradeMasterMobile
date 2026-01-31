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

            // Simulating analytics data
            // In a real app, this would be a dedicated backend endpoint
            // const res = await fetch(`${API_URL}/analytics/${uid}`);

            setTimeout(() => {
                setStats({
                    winRate: 68.5,
                    profitFactor: 2.4,
                    avgWin: 1250,
                    avgLoss: 450,
                    totalTrades: 42,
                    winningTrades: 29,
                    totalProfit: 18500,
                    maxDrawdown: 12.4
                });

                // Generate a mock equity curve
                const curve = [];
                let balance = 100000;
                for (let i = 0; i < 20; i++) {
                    balance += (Math.random() - 0.3) * 2000;
                    curve.push(balance);
                }
                setEquityCurve(curve);
                setLoading(false);
            }, 1000);

        } catch (error) {
            console.error("Failed to fetch analytics:", error);
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
                            <Text className="text-text-primary text-2xl font-black">{stats.profitFactor}</Text>
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
                            <View style={{ width: `${(stats.winningTrades / stats.totalTrades) * 100}%` }} className="bg-success" />
                            <View className="flex-1 bg-error" />
                        </View>

                        <View className="mt-8 p-4 bg-primary/5 rounded-2xl border border-primary/10 flex-row items-center">
                            <Info size={18} color="#00E0A1" />
                            <Text className="text-text-muted text-[11px] font-bold flex-1 ml-3 leading-tight">
                                Your Risk-to-Reward ratio is 1:{(stats.avgWin / stats.avgLoss).toFixed(1)}. This is a statistically edge-positive trading system.
                            </Text>
                        </View>
                    </View>

                </ScrollView>
            )}
        </View>
    );
};

export default PerformanceScreen;
