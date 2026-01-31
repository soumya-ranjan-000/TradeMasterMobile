import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ScrollView, StatusBar, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import { Briefcase, ArrowUpRight, ArrowDownRight, History, Layers, Info, ShieldCheck, X, Target, TrendingUp, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react-native';
import { API_URL, BREEZE_API_URL, TEST_USER_ID } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
const PortfolioScreen = () => {
    const navigation = useNavigation<CompositeNavigationProp<
        BottomTabNavigationProp<MainTabParamList, 'Portfolio'>,
        NativeStackNavigationProp<RootStackParamList>
    >>();
    const [userId, setUserId] = useState<string>(TEST_USER_ID);
    const [activeTab, setActiveTab] = useState<'POSITIONS' | 'ORDERS'>('POSITIONS');
    const [positions, setPositions] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [modifyingPos, setModifyingPos] = useState<any>(null);
    const [trades, setTrades] = useState<any[]>([]);
    const [newSL, setNewSL] = useState('');
    const [newTarget, setNewTarget] = useState('');
    const [newTrailingSL, setNewTrailingSL] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [account, setAccount] = useState<any>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const savedId = await AsyncStorage.getItem('USER_ID');
            const uid = savedId || TEST_USER_ID;
            setUserId(uid);

            // Always fetch all for accurate summary calculation
            const [posRes, ordRes, accRes, tRes] = await Promise.all([
                fetch(`${API_URL}/positions/${uid}`),
                fetch(`${API_URL}/orders/${uid}`),
                fetch(`${API_URL}/account/${uid}`),
                fetch(`${API_URL}/trades/${uid}`)
            ]);

            const posData = await posRes.json();
            const ordData = await ordRes.json();
            const accData = await accRes.json();
            const tData = await tRes.json();

            setPositions(Array.isArray(posData) ? posData : []);
            setOrders(Array.isArray(ordData) ? ordData : []);
            setAccount(accData);
            setTrades(Array.isArray(tData) ? tData : []);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            let timer: any;
            const init = async () => {
                fetchData();
                try {
                    const msRes = await fetch(`${BREEZE_API_URL}/api/market-status`);
                    const msData = await msRes.json();
                    if (msData.is_open) {
                        timer = setInterval(fetchData, 10000); // Poll every 10s for live P&L
                    }
                } catch (e) {
                    timer = setInterval(fetchData, 10000);
                }
            };
            init();
            return () => timer && clearInterval(timer);
        }, [activeTab])
    );

    const updatePositionRisk = async () => {
        if (!modifyingPos) return;
        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/positions`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    symbol: modifyingPos.symbol,
                    position_id: modifyingPos.position_id,
                    stop_loss: newSL ? parseFloat(newSL) : null,
                    target: newTarget ? parseFloat(newTarget) : null,
                    trailing_sl: newTrailingSL ? parseFloat(newTrailingSL) : null
                })
            });
            if (response.ok) {
                setModifyingPos(null);
                fetchData();
                Alert.alert("Protection Updated", `Risk levels for ${modifyingPos.symbol} have been synchronized.`);
            } else {
                const err = await response.json();
                Alert.alert("Update Failed", err.detail || "Error updating protection");
            }
        } catch (error) {
            console.error("Update failed:", error);
        } finally {
            setLoading(false);
        }
    };

    const quickExit = async (symbol: string, currentLtp: number, positionId?: string) => {
        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/positions/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    symbol: symbol,
                    price: currentLtp,
                    position_id: positionId
                })
            });
            if (response.ok) {
                const result = await response.json();
                const pnl = result.realized_pnl || 0;
                const pnlText = pnl >= 0 ? `+₹${pnl.toFixed(2)}` : `-₹${Math.abs(pnl).toFixed(2)}`;
                Alert.alert("Position Closed", `Exited ${symbol} with ${pnl >= 0 ? 'Profit' : 'Loss'} of ${pnlText}`);
                fetchData();
            } else {
                const err = await response.json();
                Alert.alert("Error", err.detail || "Quick exit failed");
            }
        } catch (error) {
            console.error("Quick exit failed:", error);
            Alert.alert("Error", "Network error");
        } finally {
            setLoading(false);
        }
    };

    const totalUnrealizedPnL = positions.reduce((acc, pos) => acc + (pos.unrealized_pnl || 0), 0);
    const totalInvested = positions.reduce((acc, pos) => acc + (pos.quantity * pos.average_price), 0);
    const dayPnl = positions.reduce((acc, pos) => acc + ((pos.day_change_abs || 0) * pos.quantity), 0);

    // Total P&L is Today's Performance (Unrealized + Today's Realized)
    const today = new Date().toISOString().split('T')[0];
    const todayRealizedPnL = orders.reduce((acc, ord) => {
        if (!ord.created_at) return acc;
        try {
            const ordDate = new Date(ord.created_at).toISOString().split('T')[0];
            if (ordDate === today && ord.realized_pnl) {
                return acc + ord.realized_pnl;
            }
        } catch (e) {
            console.error("Error parsing order date:", e);
        }
        return acc;
    }, 0);

    const totalPnLToday = (dayPnl || 0) + (todayRealizedPnL || 0);
    const currentVal = (totalInvested || 0) + (totalUnrealizedPnL || 0);

    // Total Returns: Total Gain/Loss from all positions (Unrealized + All Realized)
    const allRealizedPnL = orders.reduce((acc, ord) => acc + (ord.realized_pnl || 0), 0);
    const totalReturnsOverall = (totalUnrealizedPnL || 0) + allRealizedPnL;
    const totalReturnsPerc = totalInvested !== 0 ? (totalReturnsOverall / totalInvested) * 100 : 0;

    // --- Order Grouping Logic ---
    const [expandedTrades, setExpandedTrades] = useState<string[]>([]);

    const toggleTrade = (id: string) => {
        setExpandedTrades(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    };

    const groupedTrades = useCallback(() => {
        if (!trades || trades.length === 0) return [];

        return trades.map(t => {
            // Find orders belonging to this trade
            const tradeOrders = orders.filter(o => t.order_ids.includes(o.order_id))
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            return {
                id: t.position_id,
                symbol: t.symbol,
                orders: tradeOrders,
                realized_pnl: t.realized_pnl,
                status: t.status,
                timestamp: t.updated_at,
                type: t.type
            };
        });
    }, [trades, orders]);

    const tradeData = groupedTrades();

    const renderPosition = ({ item }: { item: any }) => (
        <View className="bg-surface p-5 rounded-[28px] border border-border mb-4">
            <View className="flex-row justify-between items-center mb-4">
                <View className="flex-row items-center">
                    <View className={`w-10 h-10 rounded-2xl items-center justify-center mr-3 ${item.unrealized_pnl >= 0 ? 'bg-success/10' : 'bg-error/10'}`}>
                        <Text className={`font-bold text-lg ${item.unrealized_pnl >= 0 ? 'text-success' : 'text-error'}`}>{item.symbol[0]}</Text>
                    </View>
                    <View>
                        <Text className="text-text-primary font-bold text-base">{item.symbol}</Text>
                        <Text className="text-text-muted text-[10px] font-bold">Avg. Price: ₹{(item.average_price || 0).toFixed(2)}</Text>
                        <Text className="text-text-muted text-[10px] font-bold">Avg. Market Price: ₹{(item.current_ltp || 0).toFixed(2)}</Text>
                    </View>
                </View>
                <View className="items-end">
                    <Text className="text-text-primary font-bold text-base">{item.quantity} Shares</Text>
                    <View className="flex-row items-center mt-1">
                        {(item.unrealized_pnl || 0) >= 0 ? <ArrowUpRight size={12} color="#10B981" /> : <ArrowDownRight size={12} color="#EF4444" />}
                        <Text className={`text-xs font-bold ml-1 ${(item.unrealized_pnl || 0) >= 0 ? 'text-success' : 'text-error'}`}>
                            {(item.unrealized_pnl || 0) >= 0 ? '+' : '-'}₹{Math.abs(item.unrealized_pnl || 0).toFixed(2)}
                            {item.quantity !== 0 && item.average_price !== 0 && (
                                ` (${(((item.unrealized_pnl || 0) / (Math.abs(item.quantity) * item.average_price)) * 100).toFixed(2)}%)`
                            )}
                        </Text>
                    </View>
                </View>
            </View>

            <View className="h-[1px] bg-border mb-4" />

            <View className="flex-row justify-between items-end mb-4">
                <View>
                    <Text className="text-text-secondary text-[10px] uppercase font-bold tracking-widest">Invested</Text>
                    <Text className="text-text-primary font-bold text-sm">₹{(item.quantity * item.average_price).toLocaleString()}</Text>
                </View>
                <View className="items-end">
                    <Text className="text-text-secondary text-[10px] uppercase font-bold tracking-widest">Day Change</Text>
                    <Text className={`font-bold text-sm ${(item.day_change_perc || 0) >= 0 ? 'text-success' : 'text-error'}`}>
                        {(item.day_change_perc || 0) >= 0 ? '+' : '-'}{(item.day_change_perc || 0).toFixed(2)}%
                    </Text>
                    <Text className={`text-[10px] font-bold ${(item.day_change_perc || 0) >= 0 ? 'text-success opacity-80' : 'text-error opacity-80'}`}>
                        {(item.day_change_perc || 0) >= 0 ? '+' : '-'}₹{Math.abs((item.day_change_abs || 0) * item.quantity).toFixed(2)}
                    </Text>
                </View>
            </View>

            <View className="flex-row gap-3">
                <TouchableOpacity
                    onPress={() => quickExit(item.symbol, item.current_ltp || item.average_price, item.position_id)}
                    className="flex-1 bg-error/10 border border-error/20 py-3 rounded-xl items-center justify-center"
                >
                    <Text className="text-error font-black text-xs uppercase tracking-wider" numberOfLines={1}>Quick Exit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => {
                        setModifyingPos(item);
                        setNewSL(item.stop_loss?.toString() || '');
                        setNewTarget(item.target?.toString() || '');
                        setNewTrailingSL(item.trailing_sl?.toString() || '');
                    }}
                    className="flex-1 bg-surface border border-border py-3 rounded-xl items-center justify-center"
                >
                    <Text className="text-text-primary font-bold text-xs uppercase tracking-wider" numberOfLines={1}>Modify</Text>
                </TouchableOpacity>
            </View>

            <View className="flex-row justify-between mt-4 bg-background/50 rounded-xl p-2 px-3">
                <View className="flex-row items-center">
                    <ShieldCheck size={10} color="#6B7280" />
                    <Text className="text-text-muted text-[10px] font-bold ml-1 uppercase">SL: {item.stop_loss ? `₹${item.stop_loss}` : 'NONE'}</Text>
                </View>
                <View className="flex-row items-center">
                    <Target size={10} color="#6B7280" />
                    <Text className="text-text-muted text-[10px] font-bold ml-1 uppercase">TP: {item.target ? `₹${item.target.toFixed(2)}` : 'NONE'}</Text>
                </View>
                {item.trailing_sl && (
                    <View className="flex-row items-center">
                        <History size={10} color="#6B7280" />
                        <Text className="text-text-muted text-[10px] font-bold ml-1 uppercase">TSL: ₹{item.trailing_sl.toFixed(2)}</Text>
                    </View>
                )}
            </View>
        </View>
    );

    const renderOrder = ({ item }: { item: any }) => {
        const isExpanded = expandedTrades.includes(item.id);
        const hasPnL = item.realized_pnl !== 0;

        return (
            <View className="bg-surface rounded-[28px] border border-border mb-4 overflow-hidden">
                <TouchableOpacity
                    onPress={() => toggleTrade(item.id)}
                    activeOpacity={0.7}
                    className="p-5"
                >
                    <View className="flex-row justify-between items-center">
                        <View className="flex-row items-center">
                            <View className={`w-8 h-8 rounded-xl items-center justify-center mr-3 ${item.status === 'CLOSED' ? 'bg-primary/20' : 'bg-success/10'}`}>
                                <Briefcase size={14} color={item.status === 'CLOSED' ? '#00E0A1' : '#10B981'} />
                            </View>
                            <View>
                                <Text className="text-text-primary font-bold text-base">{item.symbol}</Text>
                                <Text className="text-text-muted text-[10px] font-bold uppercase tracking-widest mt-0.5">
                                    {item.status} TRADE • {item.orders.length} EXECUTIONS
                                </Text>
                            </View>
                        </View>
                        <View className="items-end">
                            <Text className={`font-black text-sm ${item.realized_pnl >= 0 ? 'text-success' : 'text-error'}`}>
                                {item.realized_pnl >= 0 ? '+' : '-'}₹{Math.abs(item.realized_pnl).toFixed(2)}
                            </Text>
                            <View className="flex-row items-center mt-1">
                                <Text className="text-text-muted text-[10px] mr-1">{new Date(item.timestamp).toLocaleDateString()}</Text>
                                {isExpanded ? <ChevronDown size={14} color="#6B7280" /> : <ChevronRight size={14} color="#6B7280" />}
                            </View>
                        </View>
                    </View>
                </TouchableOpacity>

                {isExpanded && (
                    <View className="bg-background/40 border-t border-border/50 p-4 pt-2">
                        {item.orders.map((ord: any, idx: number) => (
                            <TouchableOpacity
                                key={ord.order_id}
                                onPress={() => setSelectedOrder(ord)}
                                className={`flex-row justify-between items-center py-3 ${idx !== item.orders.length - 1 ? 'border-b border-border/30' : ''}`}
                            >
                                <View className="flex-row items-center">
                                    <View className={`px-2 py-0.5 rounded-md mr-3 ${ord.side === 'BUY' ? 'bg-success/10' : 'bg-error/10'}`}>
                                        <Text className={`text-[9px] font-black ${ord.side === 'BUY' ? 'text-success' : 'text-error'}`}>{ord.side}</Text>
                                    </View>
                                    <View>
                                        <Text className="text-text-primary text-xs font-bold">
                                            {ord.side === 'BUY' ? 'Bought' : 'Sold'} {ord.quantity} @ ₹{ord.average_fill_price.toFixed(2)}
                                        </Text>
                                        <View className="flex-row items-center mt-0.5">
                                            <Text className="text-text-muted text-[9px] font-bold uppercase tracking-tighter">Value: ₹{(ord.quantity * ord.average_fill_price).toLocaleString()}</Text>
                                            <Text className="text-text-muted text-[9px] ml-2 opacity-50">• {new Date(ord.created_at).toLocaleTimeString()}</Text>
                                        </View>
                                    </View>
                                </View>
                                {ord.realized_pnl ? (
                                    <Text className={`text-[10px] font-black ${ord.realized_pnl >= 0 ? 'text-success' : 'text-error'}`}>
                                        {ord.realized_pnl >= 0 ? '+' : '-'}₹{Math.abs(ord.realized_pnl).toFixed(2)}
                                    </Text>
                                ) : null}
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>
        );
    };

    return (
        <View className="flex-1 bg-background pt-12">
            <StatusBar barStyle="light-content" backgroundColor="#0E1116" />

            <View className="px-4 mb-6">
                <Text className="text-3xl font-black text-text-primary">Portfolio</Text>
            </View>

            {/* Summary Card */}
            <View className="px-4 mb-8">
                <LinearGradient
                    colors={['#151921', '#0B0E11']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    className="rounded-[32px] p-6 border border-border/50 shadow-2xl relative overflow-hidden"
                >
                    <View className="flex-row justify-between mb-4">
                        <View>
                            <Text className="text-text-secondary text-xs font-bold uppercase tracking-widest">Total Value</Text>
                            <Text className="text-text-primary text-3xl font-black mt-1">₹{currentVal.toLocaleString()}</Text>
                        </View>
                        <View className={`w-12 h-12 rounded-2xl items-center justify-center ${totalReturnsOverall >= 0 ? 'bg-success/10' : 'bg-error/10'}`}>
                            {totalReturnsOverall >= 0 ? <ArrowUpRight size={24} color="#10B981" /> : <ArrowDownRight size={24} color="#EF4444" />}
                        </View>
                    </View>

                    <TouchableOpacity
                        onPress={() => navigation.navigate('Performance')}
                        className="bg-white/10 py-3 rounded-2xl items-center mb-6 border border-white/10"
                    >
                        <View className="flex-row items-center">
                            <BarChart3 size={14} color="#00E0A1" className="mr-2" />
                            <Text className="text-white text-xs font-black uppercase tracking-widest">Show Analytics</Text>
                        </View>
                    </TouchableOpacity>

                    <View className="flex-row justify-between">
                        <View>
                            <Text className="text-text-muted text-[10px] font-bold uppercase mb-1">Total P&L</Text>
                            <Text className={`text-base font-black ${totalReturnsOverall >= 0 ? 'text-success' : 'text-error'}`}>
                                {totalReturnsOverall >= 0 ? '+' : '-'}₹{Math.abs(totalReturnsOverall).toLocaleString()} ({totalReturnsPerc.toFixed(2)}%)
                            </Text>
                        </View>
                        <View className="items-end">
                            <Text className="text-text-muted text-[10px] font-bold uppercase mb-1">Realized (Today)</Text>
                            <Text className={`text-base font-black ${todayRealizedPnL >= 0 ? 'text-success' : 'text-error'}`}>
                                {todayRealizedPnL >= 0 ? '+' : '-'}₹{Math.abs(todayRealizedPnL).toLocaleString()}
                            </Text>
                        </View>
                    </View>

                    {/* Decorative Element */}
                    <View className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full bg-primary/5 border border-primary/10" />
                </LinearGradient>
            </View>

            {/* Premium Selector */}
            <View className="px-4 mb-6">
                <View className="bg-surface p-1.5 rounded-2xl flex-row border border-border">
                    <TouchableOpacity
                        onPress={() => setActiveTab('POSITIONS')}
                        className={`flex-1 py-3.5 rounded-[14px] flex-row items-center justify-center ${activeTab === 'POSITIONS' ? 'bg-background border border-border' : ''}`}
                    >
                        <Layers size={16} color={activeTab === 'POSITIONS' ? '#00E0A1' : '#6B7280'} className="mr-2" />
                        <Text className={`font-bold text-sm ${activeTab === 'POSITIONS' ? 'text-text-primary' : 'text-text-muted'}`}>Positions</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setActiveTab('ORDERS')}
                        className={`flex-1 py-3.5 rounded-[14px] flex-row items-center justify-center ${activeTab === 'ORDERS' ? 'bg-background border border-border' : ''}`}
                    >
                        <History size={16} color={activeTab === 'ORDERS' ? '#00E0A1' : '#6B7280'} className="mr-2" />
                        <Text className={`font-bold text-sm ${activeTab === 'ORDERS' ? 'text-text-primary' : 'text-text-muted'}`}>Orders</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* List */}
            {activeTab === 'POSITIONS' ? (
                <FlatList
                    data={positions}
                    keyExtractor={(item) => `${item.symbol}-${item.position_id || ''}`}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
                    renderItem={renderPosition}
                    refreshControl={
                        <RefreshControl
                            refreshing={loading}
                            onRefresh={fetchData}
                            tintColor="#00E0A1"
                            colors={["#00E0A1"]}
                        />
                    }
                    ListEmptyComponent={
                        loading ? (
                            <View className="items-center mt-20">
                                <ActivityIndicator size="large" color="#00E0A1" />
                                <Text className="text-text-muted font-bold mt-4">Loading Positions...</Text>
                            </View>
                        ) : (
                            <View className="items-center mt-20 opacity-50 px-10">
                                <Layers size={48} color="#2A2E39" />
                                <Text className="text-text-muted text-lg font-bold mt-4">No Open Positions</Text>
                                <Text className="text-text-muted text-center mt-2">You don't have any active trades currently.</Text>
                            </View>
                        )
                    }
                />
            ) : (
                <FlatList
                    data={tradeData}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
                    renderItem={renderOrder}
                    refreshControl={
                        <RefreshControl
                            refreshing={loading}
                            onRefresh={fetchData}
                            tintColor="#00E0A1"
                            colors={["#00E0A1"]}
                        />
                    }
                    ListEmptyComponent={
                        loading ? (
                            <View className="items-center mt-20">
                                <ActivityIndicator size="large" color="#00E0A1" />
                                <Text className="text-text-muted font-bold mt-4">Loading Order History...</Text>
                            </View>
                        ) : (
                            <View className="items-center mt-20 opacity-50 px-10">
                                <History size={48} color="#2A2E39" />
                                <Text className="text-text-muted text-lg font-bold mt-4">No Trade History</Text>
                                <Text className="text-text-muted text-center mt-2">Your completed trades will appear here.</Text>
                            </View>
                        )
                    }
                />
            )}
            {/* Modify Risk Modal */}
            <Modal
                visible={!!modifyingPos}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setModifyingPos(null)}
            >
                <View className="flex-1 justify-end bg-black/60">
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        className="bg-surface rounded-t-[40px] border-t border-border overflow-hidden"
                        style={{ maxHeight: '90%' }}
                    >
                        <View className="flex-row justify-between items-center p-8 pb-4">
                            <View>
                                <Text className="text-text-primary text-2xl font-black">Modify Protection</Text>
                                <Text className="text-text-muted text-sm font-bold">{modifyingPos?.symbol}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setModifyingPos(null)}
                                className="w-10 h-10 bg-background rounded-full items-center justify-center border border-border"
                            >
                                <X size={20} color="#E1E7ED" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            className="px-8"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 40 }}
                        >
                            <View className="gap-8">
                                <View>
                                    <View className="flex-row items-center mb-4">
                                        <ShieldCheck size={18} color="#EF4444" />
                                        <Text className="text-text-primary font-bold ml-2 text-base">Stop Loss</Text>
                                    </View>
                                    <TextInput
                                        className="bg-background border border-border p-5 rounded-2xl text-text-primary font-bold text-lg"
                                        placeholder="Enter Price"
                                        placeholderTextColor="#6B7280"
                                        keyboardType="numeric"
                                        value={newSL}
                                        onChangeText={setNewSL}
                                    />
                                    <View className="flex-row gap-2 mt-3">
                                        {[1, 2, 5].map(p => (
                                            <TouchableOpacity
                                                key={p}
                                                onPress={() => {
                                                    const avg = modifyingPos.average_price;
                                                    const val = modifyingPos.quantity > 0 ? avg * (1 - p / 100) : avg * (1 + p / 100);
                                                    setNewSL(val.toFixed(2));
                                                }}
                                                className="px-4 py-2 bg-error/10 border border-error/20 rounded-xl"
                                            >
                                                <Text className="text-error text-xs font-bold">-{p}%</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                <View>
                                    <View className="flex-row items-center mb-4">
                                        <Target size={18} color="#10B981" />
                                        <Text className="text-text-primary font-bold ml-2 text-base">Target Price</Text>
                                    </View>
                                    <TextInput
                                        className="bg-background border border-border p-5 rounded-2xl text-text-primary font-bold text-lg"
                                        placeholder="Enter Price"
                                        placeholderTextColor="#6B7280"
                                        keyboardType="numeric"
                                        value={newTarget}
                                        onChangeText={setNewTarget}
                                    />
                                    <View className="flex-row gap-2 mt-3">
                                        {[2, 5, 10].map(p => (
                                            <TouchableOpacity
                                                key={p}
                                                onPress={() => {
                                                    const avg = modifyingPos.average_price;
                                                    const val = modifyingPos.quantity > 0 ? avg * (1 + p / 100) : avg * (1 - p / 100);
                                                    setNewTarget(val.toFixed(2));
                                                }}
                                                className="px-4 py-2 bg-success/10 border border-success/20 rounded-xl"
                                            >
                                                <Text className="text-success text-xs font-bold">+{p}%</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                <View>
                                    <View className="flex-row items-center mb-4">
                                        <History size={18} color="#00E0A1" />
                                        <Text className="text-text-primary font-bold ml-2 text-base">Trailing SL (Distance)</Text>
                                    </View>
                                    <TextInput
                                        className="bg-background border border-border p-5 rounded-2xl text-text-primary font-bold text-lg"
                                        placeholder="Enter Distance"
                                        placeholderTextColor="#6B7280"
                                        keyboardType="numeric"
                                        value={newTrailingSL}
                                        onChangeText={setNewTrailingSL}
                                    />
                                    <View className="flex-row gap-2 mt-3">
                                        {[0.5, 1, 2].map(p => (
                                            <TouchableOpacity
                                                key={p}
                                                onPress={() => {
                                                    const avg = modifyingPos.average_price;
                                                    const val = avg * (p / 100);
                                                    setNewTrailingSL(val.toFixed(2));
                                                }}
                                                className="px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl"
                                            >
                                                <Text className="text-primary text-xs font-bold">{p}% Dist</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </View>

                            <TouchableOpacity
                                disabled={loading}
                                onPress={updatePositionRisk}
                                className={`py-5 rounded-2xl items-center mt-10 mb-4 shadow-xl ${loading ? 'bg-primary/50' : 'bg-primary shadow-primary/20'}`}
                            >
                                {loading ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text className="text-white font-black text-lg uppercase tracking-tight">Update Protection</Text>
                                )}
                            </TouchableOpacity>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Order Details Modal */}
            <Modal
                visible={!!selectedOrder}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setSelectedOrder(null)}
            >
                <View className="flex-1 justify-center bg-black/80 px-6">
                    <View className="bg-surface rounded-[40px] border border-border p-8 overflow-hidden">
                        <View className="flex-row justify-between items-center mb-8">
                            <View>
                                <Text className="text-text-primary text-2xl font-black">{selectedOrder?.symbol}</Text>
                                <View className="flex-row items-center mt-1">
                                    <View className={`px-3 py-1 rounded-lg mr-2 ${selectedOrder?.side === 'BUY' ? 'bg-success/20' : 'bg-error/20'}`}>
                                        <Text className={`text-xs font-black tracking-widest ${selectedOrder?.side === 'BUY' ? 'text-success' : 'text-error'}`}>
                                            {selectedOrder?.side}
                                        </Text>
                                    </View>
                                    <Text className="text-text-muted text-xs font-bold uppercase tracking-tight">
                                        {new Date(selectedOrder?.created_at).toLocaleString()}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                onPress={() => setSelectedOrder(null)}
                                className="w-12 h-12 bg-background rounded-2xl items-center justify-center border border-border"
                            >
                                <X size={24} color="#E1E7ED" />
                            </TouchableOpacity>
                        </View>

                        <View className="gap-6">
                            <View className="flex-row justify-between items-center bg-background/50 p-5 rounded-3xl border border-border/50">
                                <View>
                                    <Text className="text-text-secondary text-[10px] uppercase font-bold tracking-widest mb-1">Quantity</Text>
                                    <Text className="text-text-primary text-xl font-black">{selectedOrder?.filled_quantity} Shares</Text>
                                </View>
                                <View className="items-end">
                                    <Text className="text-text-secondary text-[10px] uppercase font-bold tracking-widest mb-1">Avg. Market Price</Text>
                                    <Text className="text-text-primary text-xl font-black">₹{selectedOrder?.average_fill_price.toFixed(2)}</Text>
                                </View>
                            </View>

                            <View className="p-6 gap-4 bg-surface rounded-3xl border border-border">
                                <View className="flex-row justify-between">
                                    <Text className="text-text-secondary font-bold">
                                        {selectedOrder?.side === 'BUY' ? 'Total Investment' : 'Transaction Value'}
                                    </Text>
                                    <Text className="text-text-primary font-black">
                                        ₹{(selectedOrder?.filled_quantity * selectedOrder?.average_fill_price).toLocaleString()}
                                    </Text>
                                </View>
                                <View className="flex-row justify-between">
                                    <Text className="text-text-secondary font-bold">Order Type</Text>
                                    <Text className="text-text-primary font-black">{selectedOrder?.order_type}</Text>
                                </View>
                                <View className="flex-row justify-between">
                                    <Text className="text-text-secondary font-bold">Status</Text>
                                    <Text className="text-primary font-black">{selectedOrder?.status}</Text>
                                </View>

                                {selectedOrder?.side === 'SELL' && (
                                    <>
                                        <View className="h-[1px] bg-border my-2" />
                                        <View className="flex-row justify-between">
                                            <Text className="text-text-secondary font-bold">Realized P&L</Text>
                                            <Text className={`font-black ${(selectedOrder?.realized_pnl || 0) >= 0 ? 'text-success' : 'text-error'}`}>
                                                {(selectedOrder?.realized_pnl || 0) >= 0 ? '+' : '-'}₹{Math.abs(selectedOrder?.realized_pnl || 0).toFixed(2)}
                                            </Text>
                                        </View>
                                    </>
                                )}

                                {selectedOrder?.error_message && (
                                    <View className="mt-2 p-3 bg-primary/10 rounded-xl border border-primary/20">
                                        <Text className="text-primary text-[10px] font-bold uppercase tracking-widest text-center">
                                            Note: {selectedOrder?.error_message}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Summary Footer */}
                        <View className="mt-8 flex-row items-center justify-center gap-2 opacity-50">
                            <ShieldCheck size={14} color="#6B7280" />
                            <Text className="text-text-muted text-[10px] font-bold uppercase">Transaction Verified • Paper Trading Network</Text>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default PortfolioScreen;
