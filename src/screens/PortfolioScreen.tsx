import React, { useState, useCallback } from 'react';
import { toast } from '../components/Toast';
import { ScreenHeader, IconButton, confirmAction } from '../ui';
import { colors, signColor } from '../theme';
import { inr, istClock, istDate, istDayKey, istDayLabel, istWhen } from '../format';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ScrollView, StatusBar, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation, CompositeNavigationProp, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import { Briefcase, ArrowUpRight, ArrowDownRight, History, Layers, Info, ShieldCheck, X, Target, TrendingUp, ChevronDown, ChevronRight, BarChart3, Clock, Lock } from 'lucide-react-native';
import { TEST_USER_ID } from '../config';
import { paperFetch, serverDate } from '../auth';
import { isExchangeOpen, getMarketSession, isHolidayToday, nextMarketOpen, MarketSession } from '../api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMarketData } from '../context/MarketDataContext';
import { usePositions } from '../context/PositionContext';

// --- order wording ----------------------------------------------------------------
const productTag = (p?: string) => (p === 'DELIVERY' ? 'CNC' : 'MIS');
const sideWord = (side?: string) => (side === 'SELL' ? 'Sell' : 'Buy');
const px = (v?: number | null) => inr(v, { trim: true });
const stockCode = (symbol: string) => symbol.split('.')[0].toUpperCase();
/** Server time an order last changed (cancel/expiry time for closed orders). */
const orderTime = (o: any) => serverDate(o.updated_at || o.created_at);

/** Lower and upper edge of a band order (BUY: trigger..limit, SELL: limit..trigger). */
const bandOf = (o: any): [number, number] =>
    [Math.min(o.trigger_price, o.price), Math.max(o.trigger_price, o.price)];

/** "Buy between ₹9,200 – ₹9,266" / "Buy at ≤ ₹1,398.35" / "Sell at ≥ ₹…" / "Buy at market price". */
function entryRule(o: any): string {
    const s = sideWord(o.side);
    if (o.order_type !== 'LIMIT') return `${s} at market price`;
    if (o.trigger_price != null) {
        const [lo, hi] = bandOf(o);
        return `${s} between ${px(lo)} – ${px(hi)}`;
    }
    return `${s} at ${o.side === 'SELL' ? '≥' : '≤'} ${px(o.price)}`;
}

/** "Day order · expires today 3:30 PM" / "Until cancelled" / "Expires Tue 24 Nov, 3:30 PM". */
function validityText(o: any): string {
    const exp = serverDate(o.expires_at);
    const when = exp
        ? (istDayKey(exp) === istDayKey(Date.now()) ? `today ${istClock(exp)}` : `${istDate(exp, true)}, ${istClock(exp)}`)
        : null;
    if (o.validity === 'DAY') return `Day order · ${when ? `expires ${when}` : 'cancelled at the close if not filled'}`;
    if (when) return `Expires ${when}`;
    return 'Until cancelled';
}

/** What a pending order is waiting for, given the session and the live price. */
function pendingStatus(o: any, ltp: number | null | undefined, marketOpen: boolean, opensAt: Date): { text: string; color: string } {
    if (!marketOpen) {
        const day = istDayLabel(opensAt);
        return { text: `Waiting for market open · ${day || 'today'} ${istClock(opensAt)}`, color: colors.warning };
    }
    if (!ltp || ltp <= 0) return { text: 'Market open · waiting for a live price', color: colors.textMuted };
    const l = `LTP ${px(ltp)}`;
    if (o.order_type !== 'LIMIT') return { text: `${l} · filling at market`, color: colors.success };
    const off = (edge: number) => `${((Math.abs(ltp - edge) / edge) * 100).toFixed(1)}%`;
    if (o.trigger_price != null) {
        const [lo, hi] = bandOf(o);
        if (ltp >= lo && ltp <= hi) return { text: `${l} · inside band — filling`, color: colors.success };
        return { text: ltp < lo ? `${l} · ${off(lo)} below band` : `${l} · ${off(hi)} above band`, color: colors.textSecondary };
    }
    const fillable = o.side === 'SELL' ? ltp >= o.price : ltp <= o.price;
    if (fillable) return { text: `${l} · at limit — filling`, color: colors.success };
    return { text: `${l} · ${off(o.price)} ${ltp > o.price ? 'above' : 'below'} limit`, color: colors.textSecondary };
}

/** CANCELLED / REJECTED orders the server expired carry "Expired…" as their reason. */
const isExpired = (o: any) => /^expired/i.test(o?.error_message || '');
const closedReason = (o: any) => o?.error_message || (o?.status === 'REJECTED' ? 'Rejected' : 'Cancelled');

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
    // {IST date: realized P&L NET of charges}, from the paper service.
    const [dailyPnl, setDailyPnl] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);

    const [modifyingPos, setModifyingPos] = useState<any>(null);
    const [newSL, setNewSL] = useState('');
    const [newTarget, setNewTarget] = useState('');
    const [newTrailingSL, setNewTrailingSL] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    const { ticks, subscribe, unsubscribe } = useMarketData();
    const isFocused = useIsFocused();

    // NSE session (holiday + next_session from the market pulse) for pending-order status.
    const [session, setSession] = useState<MarketSession | null>(null);
    // Re-render every minute so "waiting for market open" flips at 09:15.
    const [, setClockTick] = useState(0);
    React.useEffect(() => {
        if (!isFocused) return;
        const id = setInterval(() => setClockTick(t => t + 1), 60_000);
        return () => clearInterval(id);
    }, [isFocused]);
    const nowDate = new Date();
    const marketOpen = isExchangeOpen(nowDate) && !isHolidayToday(session, nowDate);
    const opensAt = nextMarketOpen(session?.next_session, nowDate);

    // Live prices for pending orders while the Orders tab is visible. subscribe/
    // unsubscribe change identity on every tick, so they are read through a ref.
    const subRef = React.useRef({ subscribe, unsubscribe });
    subRef.current = { subscribe, unsubscribe };
    const pendingSymbolsKey = Array.from(new Set(orders.filter(o => o.status === 'PENDING').map(o => String(o.symbol)))).sort().join(',');
    React.useEffect(() => {
        if (!isFocused || activeTab !== 'ORDERS' || !pendingSymbolsKey) return;
        const syms = pendingSymbolsKey.split(',');
        syms.forEach(sym => subRef.current.subscribe(sym));
        return () => syms.forEach(sym => subRef.current.unsubscribe(sym));
    }, [isFocused, activeTab, pendingSymbolsKey]);

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
            getMarketSession().then(setSession).catch(() => { });

            const [ordRes, accRes, tRes, dRes] = await Promise.all([
                paperFetch(`/orders/${uid}`),
                paperFetch(`/account/${uid}`),
                paperFetch(`/trades/${uid}`),
                paperFetch(`/stats/daily/${uid}`)
            ]);

            const ordData = await ordRes.json();
            const accData = await accRes.json();
            const tData = await tRes.json();
            const dData = dRes.ok ? await dRes.json() : {};

            setOrders(Array.isArray(ordData) ? ordData : []);
            setAccount(accData);
            setTrades(Array.isArray(tData) ? tData : []);
            setDailyPnl(dData && typeof dData === 'object' && !Array.isArray(dData) ? dData : {});

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
            const response = await paperFetch(`/positions`, {
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
                toast.success("Stop-loss / target updated", `${modifyingPos.symbol} protection saved.`);
            } else {
                const err = await response.json();
                toast.error("Update failed", err.detail || "Could not update stop-loss / target.");
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
            const response = await paperFetch(`/positions/close`, {
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
                const pnlText = inr(pnl, { sign: true });
                toast.success("Position closed", `Exited ${symbol} · P&L ${pnlText}`);
                fetchData();
            } else {
                const err = await response.json();
                toast.error("Exit failed", err.detail || "Could not close the position.");
            }
        } catch (error) {
            console.error("Quick exit failed:", error);
            toast.error("Network error", "Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    };

    const cancelOrder = async (orderId: string) => {
        try {
            setLoading(true);
            const response = await paperFetch(`/orders/${userId}/${orderId}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                toast.success("Order cancelled", "Your limit order was cancelled.");
                setSelectedOrder(null);
                fetchData();
            } else {
                const err = await response.json();
                toast.error("Cancellation failed", err.detail || "Could not cancel the order.");
            }
        } catch (error) {
            console.error("Cancel order failed:", error);
            toast.error("Network error", "Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    };

    const confirmCancel = (o: any) => {
        const held = (o.reserved_amount || 0) > 0 ? ` The ${inr(o.reserved_amount, { decimals: 0 })} held for it goes back to your cash.` : '';
        confirmAction('Cancel order', `Cancel ${o.side} ${o.quantity} ${o.symbol}?\n${entryRule(o)}.${held}`, 'Cancel order', () => cancelOrder(o.order_id), true);
    };

    const totalUnrealizedPnL = livePositions.reduce((acc, pos) => acc + (pos.unrealized_pnl || 0), 0);
    // Shorts carry a negative quantity: exposure is the absolute value.
    const totalInvested = livePositions.reduce((acc, pos) => acc + (Math.abs(pos.quantity) * pos.average_price), 0);

    // Day's Unrealized Performance (Movement of open positions since last close)
    const dayUnrealizedPnL = livePositions.reduce((acc, pos) => acc + ((pos.day_change_abs || 0) * pos.quantity), 0);

    // Today's realized P&L, NET of charges, for the IST trading day. Order
    // realized_pnl is gross (charges are separate), so it is not summed here.
    const istKey = istDayKey(Date.now());
    const todayRealizedPnL = dailyPnl[istKey] || 0;

    // 1. "Today" Performance = Today's Realized + Today's Unrealized variation
    const totalPnLToday = dayUnrealizedPnL + todayRealizedPnL;

    // 2. "Total P&L" on summary card = Net Portfolio Status 
    // This includes all open unrealized gains + what was closed TODAY.
    // Historical realized from previous days is ignored for the "Current Portfolio" view.
    const currentPortfolioPnL = totalUnrealizedPnL + todayRealizedPnL;
    const currentPortfolioPerc = totalInvested !== 0 ? (currentPortfolioPnL / totalInvested) * 100 : 0;

    const currentVal = (totalInvested || 0) + (totalUnrealizedPnL || 0);
    // `balance` is FREE cash; pending orders hold `reserved` on top of it.
    const reserved = Number(account?.reserved) || 0;

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
                .sort((a, b) => (serverDate(b.created_at)?.getTime() ?? 0) - (serverDate(a.created_at)?.getTime() ?? 0));

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
            sections.push({ itemType: 'HEADER', title: 'Pending Orders', count: pendingOrders.length, unit: 'order' });
            pendingOrders.forEach(o => sections.push({ itemType: 'PENDING_ORDER', ...o }));
        }

        if (openTrades.length > 0) {
            sections.push({ itemType: 'HEADER', title: 'Open Trades', count: openTrades.length });
            openTrades.forEach(t => sections.push({ itemType: 'TRADE', ...t }));
        }

        // Cancelled / expired / rejected orders from the last 3 days, newest first.
        const cutoff = Date.now() - 3 * 86_400_000;
        const closedOrders = orders
            .filter(o => (o.status === 'CANCELLED' || o.status === 'REJECTED') && (orderTime(o)?.getTime() ?? 0) >= cutoff)
            .sort((a, b) => (orderTime(b)?.getTime() ?? 0) - (orderTime(a)?.getTime() ?? 0));
        if (closedOrders.length > 0) {
            sections.push({ itemType: 'HEADER', title: 'Cancelled & expired (last 3 days)', count: closedOrders.length, unit: 'order' });
            closedOrders.forEach(o => sections.push({ itemType: 'CLOSED_ORDER', ...o }));
        }

        if (closedTrades.length > 0) {
            // Group closed trades by date
            // Keyed by IST day (YYYY-MM-DD) so the keys sort as strings.
            const groupedByDate: Record<string, any[]> = {};
            closedTrades.forEach(t => {
                const key = istDayKey(serverDate(t.timestamp)) || 'unknown';
                if (!groupedByDate[key]) groupedByDate[key] = [];
                groupedByDate[key].push(t);
            });

            // Sort dates descending
            const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));
            sortedDates.forEach(key => {
                const title = key === 'unknown' ? 'Earlier' : `${istDate(serverDate(`${key}T00:00:00`))} ${key.slice(0, 4)}`;
                sections.push({ itemType: 'HEADER', title, count: groupedByDate[key].length });
                groupedByDate[key].forEach(t => sections.push({ itemType: 'TRADE', ...t }));
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
                                <View className="flex-row items-center">
                                    <Text className="text-text-primary font-bold text-sm">{item.symbol}</Text>
                                    <Text className="text-text-muted text-[11px] font-black ml-2 px-1.5 py-0.5 rounded bg-background border border-border">
                                        {item.product === 'DELIVERY' ? 'CNC' : 'MIS'}{item.quantity < 0 ? ' • SHORT' : ''}
                                    </Text>
                                    {item.source === 'scanner' && (
                                        <Text className="text-primary text-[11px] font-black ml-1 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                                            SCANNER{item.strategy ? ` • ${item.strategy}` : ''}
                                        </Text>
                                    )}
                                </View>
                                <Text className="text-text-muted text-[11px] font-bold">Avg {inr(item.average_price || 0)} · LTP {inr(item.current_ltp || 0)}</Text>
                            </View>
                        </View>
                        <View className="items-end">
                            <Text className="text-text-primary font-bold text-sm">{item.quantity} {item.quantity === 1 ? 'Share' : 'Shares'}</Text>
                            <View className="flex-row items-center mt-0.5">
                                {(item.unrealized_pnl || 0) >= -0.005 ? <ArrowUpRight size={10} color="#10B981" /> : <ArrowDownRight size={10} color="#EF4444" />}
                                <Text className={`text-[11px] font-bold ml-1 ${(item.unrealized_pnl || 0) >= -0.005 ? 'text-success' : 'text-error'}`}>
                                    {inr(item.unrealized_pnl || 0, { sign: true })}
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
                                <Text className="text-text-secondary text-[11px] uppercase font-bold tracking-widest">Invested</Text>
                                <Text className="text-text-primary font-bold text-xs">{inr(item.quantity * item.average_price)}</Text>
                            </View>
                            <View className="items-end">
                                <Text className="text-text-secondary text-[11px] uppercase font-bold tracking-widest">Day Change</Text>
                                <View className="flex-row items-center">
                                    <Text className={`font-bold text-xs ${(item.day_change_perc || 0) >= 0 ? 'text-success' : 'text-error'}`}>
                                        {(item.day_change_perc || 0) >= 0 ? '+' : '-'}{(item.day_change_perc || 0).toFixed(2)}%
                                    </Text>
                                    <Text className={`text-[11px] font-bold ml-1 ${(item.day_change_perc || 0) >= 0 ? 'text-success opacity-80' : 'text-error opacity-80'}`}>
                                        ({inr((item.day_change_abs || 0) * item.quantity, { sign: true })})
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View className="flex-row gap-2 mb-3">
                            <TouchableOpacity
                                onPress={() => quickExit(item.symbol, item.current_ltp || item.average_price, item.position_id)}
                                className="flex-1 bg-error/10 border border-error/20 py-2 rounded-lg items-center justify-center"
                            >
                                <Text className="text-error font-black text-[11px] uppercase tracking-wider">Quick Exit</Text>
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
                                <Text className="text-text-primary font-bold text-[11px] uppercase tracking-wider">Modify</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row justify-between bg-background/50 rounded-lg p-2 px-3">
                            <View className="flex-row items-center">
                                <ShieldCheck size={10} color="#6B7280" />
                                <Text className="text-text-muted text-[11px] font-bold ml-1 uppercase">SL: {item.stop_loss ? inr(item.stop_loss) : 'NONE'}</Text>
                            </View>
                            <View className="flex-row items-center">
                                <Target size={10} color="#6B7280" />
                                <Text className="text-text-muted text-[11px] font-bold ml-1 uppercase">TP: {item.target ? inr(item.target) : 'NONE'}</Text>
                            </View>
                            {item.trailing_sl && (
                                <View className="flex-row items-center">
                                    <History size={10} color="#6B7280" />
                                    <Text className="text-text-muted text-[11px] font-bold ml-1 uppercase">TSL: {item.trailing_sl.toFixed(2)}</Text>
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
                    <Text className="text-text-muted font-black text-[11px] uppercase tracking-[2px] flex-1 mr-3">{item.title}</Text>
                    <View className="bg-surface px-2 py-0.5 rounded-md border border-border/50">
                        <Text className="text-text-muted text-[11px] font-bold">
                            {item.unit === 'order'
                                ? `${item.count} ${item.count === 1 ? 'order' : 'orders'}`
                                : `${item.count} ${item.count === 1 ? 'Trade' : 'Trades'}`}
                        </Text>
                    </View>
                </View>
            );
        }

        if (item.itemType === 'PENDING_ORDER') {
            const isBuy = item.side !== 'SELL';
            const ltp = ticks[`NSE:${stockCode(item.symbol)}`]?.ltp;
            const status = pendingStatus(item, ltp, marketOpen, opensAt);
            const rule = entryRule(item);
            const risk = [item.stop_loss ? `SL ${px(item.stop_loss)}` : '', item.target ? `Target ${px(item.target)}` : ''].filter(Boolean).join(' · ');
            return (
                <View className="bg-surface rounded-2xl border border-primary/20 mb-3 overflow-hidden">
                    <TouchableOpacity
                        onPress={() => setSelectedOrder(item)}
                        activeOpacity={0.7}
                        className="p-4 pb-3"
                        accessibilityRole="button"
                        accessibilityLabel={`Pending: ${sideWord(item.side)} ${item.quantity} ${item.symbol}. ${rule}. ${status.text}`}
                        accessibilityHint="Opens the order details"
                    >
                        <View className="flex-row justify-between items-start">
                            <View className="flex-1 mr-3">
                                <View className="flex-row items-center">
                                    <View className={`px-2 py-0.5 rounded-md mr-2 ${isBuy ? 'bg-success/10' : 'bg-error/10'}`}>
                                        <Text className={`text-[11px] font-black ${isBuy ? 'text-success' : 'text-error'}`}>{item.side}</Text>
                                    </View>
                                    <Text className="text-text-primary font-bold text-sm flex-shrink" numberOfLines={1}>{item.quantity} × {item.symbol}</Text>
                                </View>
                                <View className="flex-row items-center flex-wrap mt-1.5">
                                    <Text className="text-text-muted text-[11px] font-black px-1.5 py-0.5 rounded bg-background border border-border">
                                        {productTag(item.product)}
                                    </Text>
                                    {item.source === 'scanner' && (
                                        <Text className="text-primary text-[11px] font-black ml-1 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                                            SCANNER{item.strategy ? ` • ${item.strategy}` : ''}
                                        </Text>
                                    )}
                                </View>
                            </View>
                            <View className="items-end">
                                <Text className="text-text-muted text-[11px]">{istWhen(serverDate(item.created_at))}</Text>
                                {(item.reserved_amount || 0) > 0 && (
                                    <Text className="text-text-muted text-[11px] mt-0.5">{inr(item.reserved_amount, { decimals: 0, compact: true })} held</Text>
                                )}
                            </View>
                        </View>

                        <Text className="text-text-primary text-[13px] font-bold mt-3">{rule}</Text>
                        {!!risk && <Text className="text-text-muted text-[11px] font-bold mt-1">{risk}</Text>}
                        <View className="flex-row items-center mt-1">
                            <Clock size={11} color={colors.textMuted} />
                            <Text className="text-text-muted text-[11px] font-semibold ml-1">{validityText(item)}</Text>
                        </View>
                        <Text className="text-xs font-bold mt-2" style={{ color: status.color }}>{status.text}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        disabled={loading}
                        onPress={() => confirmCancel(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel the ${item.side} order for ${item.quantity} ${item.symbol}`}
                        className="border-t border-border/50 py-2.5 items-center"
                    >
                        <Text className={`font-black text-[11px] uppercase tracking-wider ${loading ? 'text-error/50' : 'text-error'}`}>Cancel order</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        if (item.itemType === 'CLOSED_ORDER') {
            const isBuy = item.side !== 'SELL';
            const tag = isExpired(item) ? 'EXPIRED' : item.status;
            return (
                <TouchableOpacity
                    onPress={() => setSelectedOrder(item)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${tag}: ${sideWord(item.side)} ${item.quantity} ${item.symbol}. ${closedReason(item)}`}
                    className="bg-surface rounded-2xl border border-border mb-2 px-4 py-3"
                >
                    <View className="flex-row justify-between items-center">
                        <View className="flex-row items-center flex-1 mr-2">
                            <Text className={`text-[11px] font-black mr-2 ${isBuy ? 'text-success' : 'text-error'}`}>{item.side}</Text>
                            <Text className="text-text-primary text-xs font-bold flex-shrink" numberOfLines={1}>{item.quantity} × {item.symbol}</Text>
                            <Text className="text-text-muted text-[11px] font-black ml-2 px-1.5 py-0.5 rounded bg-background border border-border">{tag}</Text>
                        </View>
                        <Text className="text-text-muted text-[11px]">{istWhen(orderTime(item))}</Text>
                    </View>
                    <Text className="text-text-secondary text-[11px] mt-1" numberOfLines={2}>{closedReason(item)}</Text>
                </TouchableOpacity>
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
                                <Text className="text-text-muted text-[11px] font-bold uppercase tracking-widest">
                                    {item.status} TRADE • {item.orders.length} EXECUTIONS
                                </Text>
                            </View>
                        </View>
                        <View className="items-end">
                            <Text className={`font-black text-sm ${item.realized_pnl >= 0 ? 'text-success' : 'text-error'}`}>
                                {inr(item.realized_pnl, { sign: true })}
                            </Text>
                            <View className="flex-row items-center">
                                <Text className="text-text-muted text-[11px] mr-1">{istClock(serverDate(item.timestamp))}</Text>
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
                                        <Text className={`text-[11px] font-black ${ord.side === 'BUY' ? 'text-success' : 'text-error'}`}>{ord.side}</Text>
                                    </View>
                                    <View>
                                        <Text className="text-text-primary text-xs font-bold">
                                            {ord.side === 'BUY' ? 'Bought' : 'Sold'} {ord.quantity} @ {inr(ord.average_fill_price)}
                                        </Text>
                                        <View className="flex-row items-center mt-0.5">
                                            <Text className="text-text-muted text-[11px] font-bold uppercase tracking-tighter">Value {inr(ord.quantity * ord.average_fill_price)}</Text>
                                            <Text className="text-text-muted text-[11px] ml-2 opacity-50">• {istClock(serverDate(ord.filled_at || ord.created_at))}</Text>
                                        </View>
                                    </View>
                                </View>
                                {ord.realized_pnl !== undefined && ord.realized_pnl !== null ? (
                                    <Text className={`text-[11px] font-black ${(ord.realized_pnl || 0) >= -0.005 ? 'text-success' : 'text-error'}`}>
                                        {inr(ord.realized_pnl || 0, { sign: true })}
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
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" backgroundColor="#0E1116" />

            <ScreenHeader
                title="Portfolio"
                subtitle="Paper trading"
                right={<IconButton label="Performance analytics" onPress={() => navigation.navigate('Performance')}>
                    <BarChart3 size={18} color={colors.primary} />
                </IconButton>}
            />

            {/* Summary: what the account is worth and how it splits */}
            <View className="px-5 mb-4">
                <View className="bg-surface rounded-3xl border border-border p-4">
                    <Text className="text-text-muted text-xs font-semibold">Account value</Text>
                    <Text className="text-text-primary text-[28px] font-black mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>
                        {account ? inr((account.balance ?? 0) + reserved + (currentVal || 0)) : '—'}
                    </Text>
                    <Text className="text-[13px] font-bold" style={{ color: signColor(totalPnLToday) }}>
                        {inr(totalPnLToday || 0, { sign: true })} today
                    </Text>
                    <View className="flex-row mt-3 pt-3 border-t border-border">
                        <View className="flex-1">
                            <Text className="text-text-muted text-xs font-semibold">Cash</Text>
                            <Text className="text-text-primary text-sm font-bold mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>{account ? inr(account.balance, { compact: true }) : '—'}</Text>
                        </View>
                        <View className="flex-1">
                            <Text className="text-text-muted text-xs font-semibold">In positions</Text>
                            <Text className="text-text-primary text-sm font-bold mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>{inr(currentVal || 0, { compact: true })}</Text>
                        </View>
                        <View className="flex-1 items-end">
                            <Text className="text-text-muted text-xs font-semibold">Open P&L</Text>
                            <Text className="text-sm font-bold mt-0.5" style={{ color: signColor(currentPortfolioPnL), fontVariant: ['tabular-nums'] }}>
                                {inr(currentPortfolioPnL || 0, { sign: true, compact: true })}
                            </Text>
                        </View>
                    </View>
                    {reserved > 0 && (
                        <View className="flex-row items-center mt-2" accessibilityLabel={`${inr(reserved, { decimals: 0 })} held for pending orders, not included in cash`}>
                            <Lock size={11} color={colors.textMuted} />
                            <Text className="text-text-muted text-xs font-semibold ml-1.5" style={{ fontVariant: ['tabular-nums'] }}>
                                Held for orders {inr(reserved, { decimals: 0 })} · not in Cash
                            </Text>
                        </View>
                    )}
                </View>
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
                    keyExtractor={(item, index) => item.itemType === 'HEADER' ? `header-${item.title}-${index}` : String(item.id || item.order_id || index)}
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
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close"
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
                                        {istWhen(serverDate(selectedOrder?.created_at))}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close"
                                onPress={() => setSelectedOrder(null)}
                                className="w-12 h-12 bg-background rounded-2xl items-center justify-center border border-border"
                            >
                                <X size={24} color="#E1E7ED" />
                            </TouchableOpacity>
                        </View>

                        <View className="gap-6">
                            <View className="flex-row justify-between items-center bg-background/50 p-5 rounded-3xl border border-border/50">
                                <View>
                                    <Text className="text-text-secondary text-[11px] uppercase font-bold tracking-widest mb-1">Quantity</Text>
                                    <Text className="text-text-primary text-xl font-black">
                                        {selectedOrder?.status === 'FILLED' ? selectedOrder?.filled_quantity : selectedOrder?.quantity} Shares
                                    </Text>
                                </View>
                                <View className="items-end">
                                    <Text className="text-text-secondary text-[11px] uppercase font-bold tracking-widest mb-1">
                                        {selectedOrder?.status === 'FILLED' ? 'Avg. Fill Price' : selectedOrder?.order_type === 'LIMIT' ? 'Limit Price' : 'Price'}
                                    </Text>
                                    <Text className="text-text-primary text-xl font-black">
                                        {inr(selectedOrder?.status === 'FILLED' ? selectedOrder?.average_fill_price : selectedOrder?.price)}
                                    </Text>
                                </View>
                            </View>

                            <View className="p-6 gap-4 bg-surface rounded-3xl border border-border">
                                <View className="flex-row justify-between">
                                    <Text className="text-text-secondary font-bold">
                                        {selectedOrder?.side === 'BUY' ? 'Estimated Investment' : 'Target Value'}
                                    </Text>
                                    <Text className="text-text-primary font-black">
                                        {inr((selectedOrder?.status === 'FILLED' ? (selectedOrder?.filled_quantity || 0) : selectedOrder?.quantity) *
                                            (selectedOrder?.status === 'FILLED' ? (selectedOrder?.average_fill_price || 0) : selectedOrder?.price))}
                                    </Text>
                                </View>
                                <View className="flex-row justify-between">
                                    <Text className="text-text-secondary font-bold">Order Type</Text>
                                    <Text className="text-text-primary font-black">{selectedOrder?.order_type} · {productTag(selectedOrder?.product)}</Text>
                                </View>
                                <View className="flex-row justify-between">
                                    <Text className="text-text-secondary font-bold">Status</Text>
                                    <Text className="text-primary font-black">{isExpired(selectedOrder) ? 'EXPIRED' : selectedOrder?.status}</Text>
                                </View>
                                {selectedOrder?.status === 'PENDING' && (
                                    <>
                                        <View className="flex-row justify-between">
                                            <Text className="text-text-secondary font-bold mr-4">Entry</Text>
                                            <Text className="text-text-primary font-bold flex-shrink text-right">{entryRule(selectedOrder)}</Text>
                                        </View>
                                        <View className="flex-row justify-between">
                                            <Text className="text-text-secondary font-bold mr-4">Validity</Text>
                                            <Text className="text-text-primary font-bold flex-shrink text-right">{validityText(selectedOrder)}</Text>
                                        </View>
                                        {(selectedOrder?.reserved_amount || 0) > 0 && (
                                            <View className="flex-row justify-between">
                                                <Text className="text-text-secondary font-bold">Cash held</Text>
                                                <Text className="text-text-primary font-bold">{inr(Number(selectedOrder?.reserved_amount))}</Text>
                                            </View>
                                        )}
                                    </>
                                )}

                                {(selectedOrder?.charges || 0) > 0 && (
                                    <View className="flex-row justify-between">
                                        <Text className="text-text-secondary font-bold">Charges</Text>
                                        <Text className="text-text-primary font-bold">{inr(Number(selectedOrder?.charges))}</Text>
                                    </View>
                                )}
                                {selectedOrder?.source && selectedOrder?.source !== 'manual' && (
                                    <View className="flex-row justify-between">
                                        <Text className="text-text-secondary font-bold">Source</Text>
                                        <Text className="text-text-primary font-bold uppercase">{selectedOrder?.source}{selectedOrder?.strategy ? ` • ${selectedOrder?.strategy}` : ''}</Text>
                                    </View>
                                )}
                                {selectedOrder?.realized_pnl !== undefined && selectedOrder?.realized_pnl !== null && (
                                    <>
                                        <View className="h-[1px] bg-border my-2" />
                                        <View className="flex-row justify-between">
                                            <Text className="text-text-secondary font-bold">Realized P&L (gross)</Text>
                                            <Text className={`font-black ${(selectedOrder?.realized_pnl || 0) >= 0 ? 'text-success' : 'text-error'}`}>
                                                {inr(selectedOrder?.realized_pnl || 0, { sign: true })}
                                            </Text>
                                        </View>
                                    </>
                                )}

                                {(selectedOrder?.status === 'CANCELLED' || selectedOrder?.status === 'REJECTED') ? (
                                    <View className="mt-2 p-3 bg-error/10 rounded-xl border border-error/20">
                                        <Text className="text-text-secondary text-[11px] font-bold uppercase tracking-widest mb-1">Reason</Text>
                                        <Text className="text-text-primary text-xs font-bold">{closedReason(selectedOrder)}</Text>
                                    </View>
                                ) : selectedOrder?.error_message ? (
                                    <View className="mt-2 p-3 bg-primary/10 rounded-xl border border-primary/20">
                                        <Text className="text-primary text-[11px] font-bold uppercase tracking-widest text-center">
                                            Note: {selectedOrder?.error_message}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        </View>

                        {selectedOrder?.status === 'PENDING' && (
                            <TouchableOpacity
                                disabled={loading}
                                onPress={() => confirmCancel(selectedOrder)}
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
                            <Text className="text-text-muted text-[11px] font-bold uppercase">Transaction Verified • Paper Trading Network</Text>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default PortfolioScreen;
