import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ScrollView, StatusBar, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation, CompositeNavigationProp, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import { Briefcase, ArrowUpRight, ArrowDownRight, History, Layers, Info, ShieldCheck, X, Target, TrendingUp, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react-native';
import { API_URL, BREEZE_API_URL, TEST_USER_ID } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMarketData } from '../context/MarketDataContext';
import { usePositions } from '../context/PositionContext';

const PortfolioScreen = () => {
    const navigation = useNavigation<CompositeNavigationProp<
        BottomTabNavigationProp<MainTabParamList, 'Portfolio'>,
        NativeStackNavigationProp<RootStackParamList>
    >>();
    const { positions, loading: posLoading, refreshPositions } = usePositions();
    const [userId, setUserId] = useState<string>(TEST_USER_ID);
    const [activeTab, setActiveTab] = useState<'POSITIONS' | 'ORDERS'>('POSITIONS');
    const [orders, setOrders] = useState<any[]>([]);
    const [account, setAccount] = useState<any>(null);
    const [trades, setTrades] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const [modifyingPos, setModifyingPos] = useState<any>(null);
    const [newSL, setNewSL] = useState('');
    const [newTarget, setNewTarget] = useState('');
    const [newTrailingSL, setNewTrailingSL] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    const { ticks, subscribe, unsubscribe } = useMarketData();
    const isFocused = useIsFocused();

    // Apply live prices to positions for real-time P&L
    const livePositions = React.useMemo(() => {
        return positions.map(pos => {
            const stock_code = pos.symbol.split('.')[0].toUpperCase();
            const tick = ticks[`NSE:${stock_code}`];
            if (tick) {
                const current_ltp = tick.ltp;
                const unrealized_pnl = (current_ltp - pos.average_price) * pos.quantity;
                return {
                    ...pos,
                    current_ltp,
                    unrealized_pnl,
                    day_change_abs: tick.day_change_abs,
                    day_change_perc: tick.day_change_perc
                };
            }
            return pos;
        });
    }, [positions, ticks]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const savedId = await AsyncStorage.getItem('USER_ID');
            const uid = savedId || TEST_USER_ID;
            setUserId(uid);

            const [ordRes, accRes, tRes] = await Promise.all([
                fetch(`${API_URL}/orders/${uid}`),
                fetch(`${API_URL}/account/${uid}`),
                fetch(`${API_URL}/trades/${uid}`)
            ]);

            const ordData = await ordRes.json();
            const accData = await accRes.json();
            const tData = await tRes.json();

            setOrders(Array.isArray(ordData) ? ordData : []);
            setAccount(accData);
            setTrades(Array.isArray(tData) ? tData : []);

            // Sync positions too
            await refreshPositions();
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [activeTab])
    );

    // Subscription management for live P&L is now partially handled by NotificationContext
    // but we'll keep it here for screen-specific focus-based subscriptions if needed.
    // Actually, NotificationProvider handles it globally now, so we can simplify.

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

    const cancelOrder = async (orderId: string) => {
        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/orders/${userId}/${orderId}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                Alert.alert("Order Cancelled", "Your limit order has been successfully cancelled.");
                setSelectedOrder(null);
                fetchData();
            } else {
                const err = await response.json();
                Alert.alert("Cancellation Failed", err.detail || "Could not cancel order");
            }
        } catch (error) {
            console.error("Cancel order failed:", error);
            Alert.alert("Error", "Network error");
        } finally {
            setLoading(false);
        }
    };

    const totalUnrealizedPnL = livePositions.reduce((acc, pos) => acc + (pos.unrealized_pnl || 0), 0);
    const totalInvested = livePositions.reduce((acc, pos) => acc + (pos.quantity * pos.average_price), 0);

    // Day's Unrealized Performance (Movement of open positions since last close)
    const dayUnrealizedPnL = livePositions.reduce((acc, pos) => acc + ((pos.day_change_abs || 0) * pos.quantity), 0);

    // Robust "Is Today" check for local timezone
    const isToday = (dateString: string) => {
        if (!dateString) return false;
        try {
            const date = new Date(dateString);
            const now = new Date();
            return date.getDate() === now.getDate() &&
                date.getMonth() === now.getMonth() &&
                date.getFullYear() === now.getFullYear();
        } catch (e) {
            return false;
        }
    };

    // Today's Realized Gains (Closed positions today)
    const todayRealizedPnL = orders.reduce((acc, ord) => {
        if (isToday(ord.created_at) && ord.realized_pnl) {
            return acc + ord.realized_pnl;
        }
        return acc;
    }, 0);

    // 1. "Today" Performance = Today's Realized + Today's Unrealized variation
    const totalPnLToday = dayUnrealizedPnL + todayRealizedPnL;

    // 2. "Total P&L" on summary card = Net Portfolio Status 
    // This includes all open unrealized gains + what was closed TODAY.
    // Historical realized from previous days is ignored for the "Current Portfolio" view.
    const currentPortfolioPnL = totalUnrealizedPnL + todayRealizedPnL;
    const currentPortfolioPerc = totalInvested !== 0 ? (currentPortfolioPnL / totalInvested) * 100 : 0;

    const currentVal = (totalInvested || 0) + (totalUnrealizedPnL || 0);

    // Keep lifetime stats for potential Analytics usage
    const allRealizedPnL = orders.reduce((acc, ord) => acc + (ord.realized_pnl || 0), 0);
    const lifetimeReturns = (totalUnrealizedPnL || 0) + allRealizedPnL;
    // --- Order Grouping Logic ---
    const [expandedTrades, setExpandedTrades] = useState<string[]>([]);
    const [expandedPositions, setExpandedPositions] = useState<string[]>([]);

    const toggleTrade = (id: string) => {
        setExpandedTrades(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    };

    const togglePosition = (id: string) => {
        setExpandedPositions(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
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

    const tradeData = useCallback(() => {
        const rawTrades = groupedTrades();
        const openTrades = rawTrades.filter(t => t.status !== 'CLOSED');
        const closedTrades = rawTrades.filter(t => t.status === 'CLOSED');

        // Find pending orders (not yet part of any trade/position)
        const pendingOrders = orders.filter(o => o.status === 'PENDING');

        const sections: any[] = [];

        if (pendingOrders.length > 0) {
            sections.push({ itemType: 'HEADER', title: 'Pending Orders', count: pendingOrders.length });
            pendingOrders.forEach(o => sections.push({ itemType: 'PENDING_ORDER', ...o }));
        }

        if (openTrades.length > 0) {
            sections.push({ itemType: 'HEADER', title: 'Open Trades', count: openTrades.length });
            openTrades.forEach(t => sections.push({ itemType: 'TRADE', ...t }));
        }

        if (closedTrades.length > 0) {
            // Group closed trades by date
            const groupedByDate: Record<string, any[]> = {};
            closedTrades.forEach(t => {
                const date = new Date(t.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                if (!groupedByDate[date]) groupedByDate[date] = [];
                groupedByDate[date].push(t);
            });

            // Sort dates descending
            const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
            sortedDates.forEach(date => {
                sections.push({ itemType: 'HEADER', title: date, count: groupedByDate[date].length });
                groupedByDate[date].forEach(t => sections.push({ itemType: 'TRADE', ...t }));
            });
        }

        return sections;
    }, [trades, orders])();

    const renderPosition = ({ item }: { item: any }) => {
        const isExpanded = expandedPositions.includes(item.position_id);

        return (
            <View className="bg-surface rounded-[20px] border border-border mb-3 overflow-hidden">
                <TouchableOpacity
                    onPress={() => togglePosition(item.position_id)}
                    activeOpacity={0.7}
                    className="p-4"
                >
                    <View className="flex-row justify-between items-center">
                        <View className="flex-row items-center">
                            <View className={`w-8 h-8 rounded-xl items-center justify-center mr-3 ${(item.unrealized_pnl || 0) >= -0.005 ? 'bg-success/10' : 'bg-error/10'}`}>
                                <Text className={`font-bold text-base ${(item.unrealized_pnl || 0) >= -0.005 ? 'text-success' : 'text-error'}`}>{item.symbol[0]}</Text>
                            </View>
                            <View>
                                <Text className="text-text-primary font-bold text-sm">{item.symbol}</Text>
                                <Text className="text-text-muted text-[9px] font-bold">Avg. ₹{(item.average_price || 0).toFixed(2)} • LTP: ₹{(item.current_ltp || 0).toFixed(2)}</Text>
                            </View>
                        </View>
                        <View className="items-end">
                            <Text className="text-text-primary font-bold text-sm">{item.quantity} {item.quantity === 1 ? 'Share' : 'Shares'}</Text>
                            <View className="flex-row items-center mt-0.5">
                                {(item.unrealized_pnl || 0) >= -0.005 ? <ArrowUpRight size={10} color="#10B981" /> : <ArrowDownRight size={10} color="#EF4444" />}
                                <Text className={`text-[10px] font-bold ml-1 ${(item.unrealized_pnl || 0) >= -0.005 ? 'text-success' : 'text-error'}`}>
                                    {(item.unrealized_pnl || 0) >= -0.005 ? '+' : '-'}₹{Math.abs(item.unrealized_pnl || 0).toFixed(2)}
                                </Text>
                            </View>
                        </View>
                    </View>
                </TouchableOpacity>

                {isExpanded && (
                    <View className="px-4 pb-4 pt-0">
                        <View className="h-[1px] bg-border mb-3" />

                        <View className="flex-row justify-between items-end mb-3">
                            <View>
                                <Text className="text-text-secondary text-[8px] uppercase font-bold tracking-widest">Invested</Text>
                                <Text className="text-text-primary font-bold text-xs">₹{(item.quantity * item.average_price).toLocaleString()}</Text>
                            </View>
                            <View className="items-end">
                                <Text className="text-text-secondary text-[8px] uppercase font-bold tracking-widest">Day Change</Text>
                                <View className="flex-row items-center">
                                    <Text className={`font-bold text-xs ${(item.day_change_perc || 0) >= 0 ? 'text-success' : 'text-error'}`}>
                                        {(item.day_change_perc || 0) >= 0 ? '+' : '-'}{(item.day_change_perc || 0).toFixed(2)}%
                                    </Text>
                                    <Text className={`text-[9px] font-bold ml-1 ${(item.day_change_perc || 0) >= 0 ? 'text-success opacity-80' : 'text-error opacity-80'}`}>
                                        ({(item.day_change_perc || 0) >= 0 ? '+' : '-'}₹{Math.abs((item.day_change_abs || 0) * item.quantity).toFixed(2)})
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View className="flex-row gap-2 mb-3">
                            <TouchableOpacity
                                onPress={() => quickExit(item.symbol, item.current_ltp || item.average_price, item.position_id)}
                                className="flex-1 bg-error/10 border border-error/20 py-2 rounded-lg items-center justify-center"
                            >
                                <Text className="text-error font-black text-[10px] uppercase tracking-wider">Quick Exit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    setModifyingPos(item);
                                    setNewSL(item.stop_loss?.toString() || '');
                                    setNewTarget(item.target?.toString() || '');
                                    setNewTrailingSL(item.trailing_sl?.toString() || '');
                                }}
                                className="flex-1 bg-surface border border-border py-2 rounded-lg items-center justify-center"
                            >
                                <Text className="text-text-primary font-bold text-[10px] uppercase tracking-wider">Modify</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row justify-between bg-background/50 rounded-lg p-2 px-3">
                            <View className="flex-row items-center">
                                <ShieldCheck size={10} color="#6B7280" />
                                <Text className="text-text-muted text-[8px] font-bold ml-1 uppercase">SL: {item.stop_loss ? `₹${item.stop_loss}` : 'NONE'}</Text>
                            </View>
                            <View className="flex-row items-center">
                                <Target size={10} color="#6B7280" />
                                <Text className="text-text-muted text-[8px] font-bold ml-1 uppercase">TP: {item.target ? `₹${item.target.toFixed(2)}` : 'NONE'}</Text>
                            </View>
                            {item.trailing_sl && (
                                <View className="flex-row items-center">
                                    <History size={10} color="#6B7280" />
                                    <Text className="text-text-muted text-[8px] font-bold ml-1 uppercase">TSL: {item.trailing_sl.toFixed(2)}</Text>
                                </View>
                            )}
                        </View>
                    </View>
                )}
            </View>
        );
    };

    const renderOrder = ({ item }: { item: any }) => {
        if (item.itemType === 'HEADER') {
            return (
                <View className="py-4 px-2 flex-row justify-between items-center">
                    <Text className="text-text-muted font-black text-[10px] uppercase tracking-[2px]">{item.title}</Text>
                    <View className="bg-surface px-2 py-0.5 rounded-md border border-border/50">
                        <Text className="text-text-muted text-[8px] font-bold">{item.count} {item.count === 1 ? 'Trade' : 'Trades'}</Text>
                    </View>
                </View>
            );
        }

        if (item.itemType === 'PENDING_ORDER') {
            return (
                <View className="bg-surface rounded-2xl border border-secondary/30 mb-3 overflow-hidden shadow-sm shadow-secondary/5">
                    <TouchableOpacity
                        onPress={() => setSelectedOrder(item)}
                        activeOpacity={0.7}
                        className="p-4"
                    >
                        <View className="flex-row justify-between items-center">
                            <View className="flex-row items-center">
                                <View className={`w-7 h-7 rounded-lg items-center justify-center mr-3 bg-secondary/10`}>
                                    <TrendingUp size={12} color="#00E0A1" />
                                </View>
                                <View>
                                    <Text className="text-text-primary font-bold text-sm">{item.symbol}</Text>
                                    <Text className="text-primary text-[8px] font-black uppercase tracking-widest">
                                        PENDING {item.order_type} ORDER
                                    </Text>
                                </View>
                            </View>
                            <View className="items-end">
                                <View className={`px-2 py-0.5 rounded-md mb-1 ${item.side === 'BUY' ? 'bg-success/10' : 'bg-error/10'}`}>
                                    <Text className={`text-[8px] font-black ${item.side === 'BUY' ? 'text-success' : 'text-error'}`}>{item.side}</Text>
                                </View>
                                <Text className="text-text-primary font-black text-xs">₹{item.price?.toFixed(2)}</Text>
                                <Text className="text-text-muted text-[8px] mt-0.5">{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                </View>
            );
        }

        const isExpanded = expandedTrades.includes(item.id);

        return (
            <View className="bg-surface rounded-2xl border border-border mb-3 overflow-hidden">
                <TouchableOpacity
                    onPress={() => toggleTrade(item.id)}
                    activeOpacity={0.7}
                    className="p-4"
                >
                    <View className="flex-row justify-between items-center">
                        <View className="flex-row items-center">
                            <View className={`w-7 h-7 rounded-lg items-center justify-center mr-3 ${item.status === 'CLOSED' ? 'bg-primary/20' : 'bg-success/10'}`}>
                                <Briefcase size={12} color={item.status === 'CLOSED' ? '#00E0A1' : '#10B981'} />
                            </View>
                            <View>
                                <Text className="text-text-primary font-bold text-sm">{item.symbol}</Text>
                                <Text className="text-text-muted text-[8px] font-bold uppercase tracking-widest">
                                    {item.status} TRADE • {item.orders.length} EXECUTIONS
                                </Text>
                            </View>
                        </View>
                        <View className="items-end">
                            <Text className={`font-black text-sm ${item.realized_pnl >= 0 ? 'text-success' : 'text-error'}`}>
                                {item.realized_pnl >= 0 ? '+' : '-'}₹{Math.abs(item.realized_pnl).toFixed(2)}
                            </Text>
                            <View className="flex-row items-center">
                                <Text className="text-text-muted text-[8px] mr-1">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                {isExpanded ? <ChevronDown size={12} color="#6B7280" /> : <ChevronRight size={12} color="#6B7280" />}
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
                                {ord.realized_pnl !== undefined && ord.realized_pnl !== null ? (
                                    <Text className={`text-[10px] font-black ${(ord.realized_pnl || 0) >= -0.005 ? 'text-success' : 'text-error'}`}>
                                        {(ord.realized_pnl || 0) >= -0.005 ? '+' : '-'}₹{Math.abs(ord.realized_pnl || 0).toFixed(2)}
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
        <View className="flex-1 bg-background pt-10">
            <StatusBar barStyle="light-content" backgroundColor="#0E1116" />

            <View className="px-4 mb-3">
                <Text className="text-2xl font-black text-text-primary">Portfolio</Text>
            </View>

            {/* Compact Summary Card */}
            <View className="px-4 mb-4">
                <LinearGradient
                    colors={['#151921', '#0B0E11']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    className="rounded-[24px] p-4 border border-border/50 shadow-lg relative overflow-hidden"
                >
                    <View className="flex-row justify-between mb-3">
                        <View>
                            <Text className="text-text-secondary text-[10px] font-bold uppercase tracking-widest">Total Value</Text>
                            <Text className="text-text-primary text-2xl font-black mt-0.5">₹{currentVal.toLocaleString()}</Text>
                        </View>
                        <View className={`w-10 h-10 rounded-xl items-center justify-center ${(currentPortfolioPnL || 0) >= -0.005 ? 'bg-success/10' : 'bg-error/10'}`}>
                            {(currentPortfolioPnL || 0) >= -0.005 ? <ArrowUpRight size={20} color="#10B981" /> : <ArrowDownRight size={20} color="#EF4444" />}
                        </View>
                    </View>

                    <TouchableOpacity
                        onPress={() => navigation.navigate('Performance')}
                        className="bg-white/10 py-2 rounded-xl items-center mb-4 border border-white/10"
                    >
                        <View className="flex-row items-center">
                            <BarChart3 size={12} color="#00E0A1" className="mr-2" />
                            <Text className="text-white text-[10px] font-black uppercase tracking-widest">Analytics</Text>
                        </View>
                    </TouchableOpacity>

                    <View className="flex-row justify-between">
                        <View>
                            <Text className="text-text-muted text-[8px] font-bold uppercase mb-0.5">Total P&L</Text>
                            <Text className={`text-sm font-black ${(currentPortfolioPnL || 0) >= -0.005 ? 'text-success' : 'text-error'}`}>
                                {(currentPortfolioPnL || 0) >= -0.005 ? '+' : '-'}₹{Math.abs(currentPortfolioPnL || 0).toLocaleString()} ({currentPortfolioPerc.toFixed(2)}%)
                            </Text>
                        </View>
                        <View className="items-end">
                            <Text className="text-text-muted text-[8px] font-bold uppercase mb-0.5">Today</Text>
                            <Text className={`text-sm font-black ${(totalPnLToday || 0) >= -0.005 ? 'text-success' : 'text-error'}`}>
                                {(totalPnLToday || 0) >= -0.005 ? '+' : '-'}₹{Math.abs(totalPnLToday || 0).toLocaleString()}
                            </Text>
                        </View>
                    </View>

                    {/* Decorative Element */}
                    <View className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full bg-primary/5 border border-primary/10" />
                </LinearGradient>
            </View>

            {/* Compact Premium Selector */}
            <View className="px-4 mb-4">
                <View className="bg-surface p-1.5 rounded-xl flex-row border border-border">
                    <TouchableOpacity
                        onPress={() => setActiveTab('POSITIONS')}
                        className={`flex-1 py-2.5 rounded-lg flex-row items-center justify-center ${activeTab === 'POSITIONS' ? 'bg-background border border-border/50' : ''}`}
                    >
                        <Layers size={14} color={activeTab === 'POSITIONS' ? '#00E0A1' : '#6B7280'} className="mr-2" />
                        <Text className={`font-bold text-xs ${activeTab === 'POSITIONS' ? 'text-text-primary' : 'text-text-muted'}`}>Positions</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setActiveTab('ORDERS')}
                        className={`flex-1 py-2.5 rounded-lg flex-row items-center justify-center ${activeTab === 'ORDERS' ? 'bg-background border border-border/50' : ''}`}
                    >
                        <History size={14} color={activeTab === 'ORDERS' ? '#00E0A1' : '#6B7280'} className="mr-2" />
                        <Text className={`font-bold text-xs ${activeTab === 'ORDERS' ? 'text-text-primary' : 'text-text-muted'}`}>Orders</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* List */}
            {activeTab === 'POSITIONS' ? (
                <FlatList
                    data={livePositions}
                    keyExtractor={(item) => `${item.symbol}-${item.position_id || ''}`}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
                    renderItem={renderPosition}
                    refreshControl={
                        <RefreshControl
                            refreshing={loading}
                            onRefresh={() => {
                                setLoading(true);
                                fetchData().finally(() => setLoading(false));
                            }}
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
                    keyExtractor={(item, index) => item.itemType === 'HEADER' ? `header-${item.title}-${index}` : item.id}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
                    renderItem={renderOrder}
                    refreshControl={
                        <RefreshControl
                            refreshing={loading}
                            onRefresh={() => {
                                setLoading(true);
                                fetchData().finally(() => setLoading(false));
                            }}
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
                                    <Text className="text-text-primary text-xl font-black">
                                        {selectedOrder?.status === 'PENDING' ? selectedOrder?.quantity : selectedOrder?.filled_quantity} Shares
                                    </Text>
                                </View>
                                <View className="items-end">
                                    <Text className="text-text-secondary text-[10px] uppercase font-bold tracking-widest mb-1">
                                        {selectedOrder?.status === 'PENDING' ? 'Limit Price' : 'Avg. Fill Price'}
                                    </Text>
                                    <Text className="text-text-primary text-xl font-black">
                                        ₹{(selectedOrder?.status === 'PENDING' ? selectedOrder?.price : selectedOrder?.average_fill_price)?.toFixed(2)}
                                    </Text>
                                </View>
                            </View>

                            <View className="p-6 gap-4 bg-surface rounded-3xl border border-border">
                                <View className="flex-row justify-between">
                                    <Text className="text-text-secondary font-bold">
                                        {selectedOrder?.side === 'BUY' ? 'Estimated Investment' : 'Target Value'}
                                    </Text>
                                    <Text className="text-text-primary font-black">
                                        ₹{((selectedOrder?.status === 'PENDING' ? selectedOrder?.quantity : (selectedOrder?.filled_quantity || 0)) *
                                            (selectedOrder?.status === 'PENDING' ? selectedOrder?.price : (selectedOrder?.average_fill_price || 0))).toLocaleString()}
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

                        {selectedOrder?.status === 'PENDING' && (
                            <TouchableOpacity
                                disabled={loading}
                                onPress={() => {
                                    Alert.alert(
                                        "Cancel Order",
                                        "Are you sure you want to cancel this pending order?",
                                        [
                                            { text: "No", style: "cancel" },
                                            { text: "Yes, Cancel", style: "destructive", onPress: () => cancelOrder(selectedOrder.order_id) }
                                        ]
                                    );
                                }}
                                className={`mt-6 ${loading ? 'bg-error/5' : 'bg-error/10'} border border-error/20 py-4 rounded-2xl items-center`}
                            >
                                {loading ? (
                                    <ActivityIndicator size="small" color="#EF4444" />
                                ) : (
                                    <Text className="text-error font-black text-xs uppercase tracking-widest">Cancel Pending Order</Text>
                                )}
                            </TouchableOpacity>
                        )}

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
