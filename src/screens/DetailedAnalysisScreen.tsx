import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
    ChevronLeft,
    ShieldCheck,
    AlertTriangle,
    Zap,
    BarChart3,
    LocateFixed,
    Layers,
    MessageSquareText
} from 'lucide-react-native';

const DetailedAnalysisScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { symbol, analysis } = route.params as { symbol: string; analysis: any };

    if (!analysis) {
        return (
            <View className="flex-1 bg-background items-center justify-center p-6">
                <Text className="text-text-primary text-xl font-bold">No analysis data available</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Intraday' as any)} className="mt-4 bg-primary px-6 py-2 rounded-full">
                    <Text className="text-white font-bold">Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const { risk_management, indicators, technical_data } = analysis;
    const { factors, pivots, adr, raw_signals } = technical_data || {};
    const bias = indicators?.ema_crossover || 'Neutral';

    const IndicatorRow = ({ label, value, status }: { label: string, value: string, status?: string }) => {
        const getStatusColor = () => {
            const v = value?.toLowerCase();
            if (v?.includes('bullish') || v?.includes('above') || v?.includes('buy')) return '#10B981';
            if (v?.includes('bearish') || v?.includes('below') || v?.includes('sell') || v?.includes('overbought')) return '#EF4444';
            return '#F59E0B';
        };

        return (
            <View className="flex-row justify-between items-center py-3 border-b border-border/20">
                <Text className="text-text-muted text-xs font-bold uppercase">{label}</Text>
                <View className="flex-row items-center">
                    <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: getStatusColor() }} />
                    <Text className="text-text-primary font-bold text-sm">{value}</Text>
                </View>
            </View>
        );
    };

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View className="px-6 pt-14 pb-6 flex-row items-center">
                <TouchableOpacity onPress={() => navigation.navigate('Intraday' as any)} className="p-2 bg-white/5 rounded-full mr-4">
                    <ChevronLeft size={24} color="#E1E7ED" />
                </TouchableOpacity>
                <View>
                    <Text className="text-text-primary text-2xl font-black">{symbol.split('.')[0]}</Text>
                    <Text className="text-text-muted text-xs font-bold uppercase tracking-widest">Technical Deep-Dive</Text>
                </View>
            </View>

            <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>

                {/* Confidence & Bias Hero */}
                <View className="bg-surface rounded-[40px] p-8 border border-border/40 mb-6 items-center">
                    <View className="bg-primary/20 p-4 rounded-full mb-4">
                        <Zap size={32} color="#00E0A1" />
                    </View>
                    <Text className="text-text-muted text-[10px] font-black uppercase tracking-[4px]">AI Confidence</Text>
                    <Text className="text-text-primary text-6xl font-black my-2">{analysis.confidence}%</Text>
                    <View className="flex-row items-center bg-background/50 px-4 py-2 rounded-full border border-border/30">
                        <Text className="text-text-muted text-xs mr-2">Market Bias:</Text>
                        <Text className={`font-black uppercase text-xs ${bias?.toUpperCase().includes('BULL') ? 'text-success' : 'text-error'}`}>{bias}</Text>
                    </View>
                </View>

                {/* Risk Management Card */}
                <View className="mb-8">
                    <View className="flex-row items-center mb-4">
                        <ShieldCheck size={20} color="#00E0A1" />
                        <Text className="text-text-primary font-black ml-2 uppercase text-sm tracking-widest">Risk Management</Text>
                    </View>
                    <View className="bg-surface rounded-3xl p-6 border border-border/40">
                        <View className="flex-row justify-between mb-4">
                            <Text className="text-text-muted font-bold">Reward/Risk Ratio</Text>
                            <Text className="text-success font-black">{risk_management?.risk_reward || risk_management?.risk_reward_ratio?.toString() || '---'}</Text>
                        </View>
                        <View className="flex-row justify-between mb-4">
                            <Text className="text-text-muted font-bold">Position Size</Text>
                            <Text className="text-text-primary font-black">{risk_management?.position_size_advice || '---'}</Text>
                        </View>
                        <View className={`p-4 rounded-2xl flex-row items-center ${risk_management?.trade_status === 'Approved' ? 'bg-success/10' : 'bg-error/10'}`}>
                            {risk_management?.trade_status === 'Approved' ? <ShieldCheck size={18} color="#10B981" /> : <AlertTriangle size={18} color="#EF4444" />}
                            <Text className={`font-black text-xs ml-2 ${risk_management?.trade_status === 'Approved' ? 'text-success' : 'text-error'}`}>
                                Institutional Filter: {risk_management?.trade_status || 'Checking...'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Technical Gauges */}
                <View className="mb-8">
                    <View className="flex-row items-center mb-4">
                        <BarChart3 size={20} color="#00E0A1" />
                        <Text className="text-text-primary font-black ml-2 uppercase text-sm tracking-widest">Technical Gauges</Text>
                    </View>
                    <View className="bg-surface rounded-3xl p-6 border border-border/40">
                        <IndicatorRow label="EMA Cross" value={indicators?.ema_crossover || 'Neutral'} />
                        <IndicatorRow label="RSI Status" value={indicators?.rsi_status || `${indicators?.rsi?.toFixed(1)} RSI` || 'Neutral'} />
                        <IndicatorRow label="MACD" value={indicators?.macd_status || 'Neutral'} />
                        <IndicatorRow label="VWAP" value={indicators?.vwap_status || 'At Value'} />
                        <IndicatorRow label="ADR Range" value={raw_signals?.adr_exhaustion ? `${raw_signals.adr_exhaustion}% Used` : 'Optimal'} />
                    </View>
                </View>

                {/* Key Factors */}
                <View className="mb-12">
                    <View className="flex-row items-center mb-4">
                        <MessageSquareText size={20} color="#00E0A1" />
                        <Text className="text-text-primary font-black ml-2 uppercase text-sm tracking-widest">Key Factors</Text>
                    </View>
                    {factors?.map((f: string, i: number) => (
                        <View key={i} className="flex-row mb-3 bg-surface/40 p-4 rounded-2xl border border-border/20">
                            <View className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary mr-3" />
                            <Text className="text-text-primary text-xs flex-1 font-medium leading-5">{f}</Text>
                        </View>
                    )) || <Text className="text-text-muted italic px-4">No specific factors identified.</Text>}
                </View>

                {/* Pivots Level */}
                {pivots && (
                    <View className="mb-12">
                        <View className="flex-row items-center mb-4">
                            <LocateFixed size={20} color="#00E0A1" />
                            <Text className="text-text-primary font-black ml-2 uppercase text-sm tracking-widest">Pivot Levels</Text>
                        </View>
                        <View className="bg-surface rounded-3xl p-6 border border-border/40 flex-row flex-wrap justify-between">
                            <View className="w-1/3 mb-4 items-center">
                                <Text className="text-text-muted text-[8px] font-black uppercase mb-1">R2</Text>
                                <Text className="text-error font-bold text-xs">₹{pivots.r2?.toFixed(2)}</Text>
                            </View>
                            <View className="w-1/3 mb-4 items-center">
                                <Text className="text-text-muted text-[8px] font-black uppercase mb-1">R1</Text>
                                <Text className="text-error font-bold text-xs">₹{pivots.r1?.toFixed(2)}</Text>
                            </View>
                            <View className="w-1/3 mb-4 items-center">
                                <Text className="text-text-muted text-[8px] font-black uppercase mb-1">Pivot</Text>
                                <Text className="text-primary font-black text-xs">₹{pivots.pivot?.toFixed(2)}</Text>
                            </View>
                            <View className="w-1/3 items-center">
                                <Text className="text-text-muted text-[8px] font-black uppercase mb-1">S1</Text>
                                <Text className="text-success font-bold text-xs">₹{pivots.s1?.toFixed(2)}</Text>
                            </View>
                            <View className="w-1/3 items-center">
                                <Text className="text-text-muted text-[8px] font-black uppercase mb-1">S2</Text>
                                <Text className="text-success font-bold text-xs">₹{pivots.s2?.toFixed(2)}</Text>
                            </View>
                            <View className="w-1/3 items-center">
                                <Text className="text-text-muted text-[8px] font-black uppercase mb-1">ADR</Text>
                                <Text className="text-text-primary font-bold text-xs">{adr ? `${adr.toFixed(2)}%` : '---'}</Text>
                            </View>
                        </View>
                    </View>
                )}

            </ScrollView>
        </View>
    );
};

export default DetailedAnalysisScreen;
