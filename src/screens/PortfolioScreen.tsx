import React, { useState, useCallback, useMemo, useRef } from 'react';
import { toast } from '../components/Toast';
import { ScreenHeader, IconButton, confirmAction } from '../ui';
import { colors, signColor } from '../theme';
import { inr, istClock, istDate, istDayKey, istDayLabel, istWhen, portfolioSummary } from '../format';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ScrollView, StatusBar, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation, CompositeNavigationProp, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import { Briefcase, ArrowUpRight, ArrowDownRight, History, Layers, Info, ShieldCheck, X, Target, TrendingUp, ChevronDown, ChevronRight, BarChart3, Clock, Lock } from '../icons';
import { TEST_USER_ID } from '../config';
import { paperFetch, serverDate } from '../auth';
import { isExchangeOpen, getMarketSession, isHolidayToday, nextMarketOpen, MarketSession } from '../api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMarketData, useLivePrices, Tick } from '../context/MarketDataContext';
import { useAppActive } from '../appState';
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

// --- list rows (memoized: a price tick re-renders only the rows it affects) ----------

const PositionRow = React.memo(({ item, expanded: isExpanded, onToggle, onQuickExit, onModify }: {
    item: any;
    expanded: boolean;
    onToggle: (id: string) => void;
    onQuickExit: (symbol: string, currentLtp: number, positionId?: string) => void;
    onModify: (item: any) => void;
}) => {
    return (
        <View className="bg-surface rounded-[20px] border border-border mb-3 overflow-hidden">
            <TouchableOpacity
                onPress={() => onToggle(item.position_id)}
                activeOpacity={0.7}
                className="p-4"
            >
                {/* Left column shrinks (min-w-0); the quantity / P&L column never does,
                    so long scanner tags can no longer push it off the card. */}
                <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center flex-1 min-w-0 mr-3">
                        <View className={`w-8 h-8 rounded-xl items-center justify-center mr-3 ${(item.unrealized_pnl || 0) >= -0.005 ? 'bg-success/10' : 'bg-error/10'}`}>
                            <Text className={`font-bold text-base ${(item.unrealized_pnl || 0) >= -0.005 ? 'text-success' : 'text-error'}`}>{item.symbol[0]}</Text>
                        </View>
                        <View className="flex-1 min-w-0">
                            <View className="flex-row items-center">
                                <Text className="text-text-primary font-bold text-sm shrink" numberOfLines={1}>{item.symbol}</Text>
                                <Text className="text-text-muted text-[11px] font-black ml-2 px-1.5 py-0.5 rounded bg-background border border-border">
                                    {item.product === 'DELIVERY' ? 'CNC' : 'MIS'}{item.quantity < 0 ? ' • SHORT' : ''}
                                </Text>
                            </View>
                            {item.source === 'scanner' && (
                                <Text className="text-primary text-[11px] font-black mt-1 self-start px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20"
                                    numberOfLines={1}>
                                    SCANNER{item.strategy ? ` • ${item.strategy}` : ''}
                                </Text>
                            )}
                            <Text className="text-text-muted text-[11px] font-bold mt-1" numberOfLines={1}>Avg {inr(item.average_price || 0)} · LTP {inr(item.current_ltp || 0)}</Text>
                            {item.opened_at ? (
                                <Text className="text-text-muted text-[11px] mt-0.5 opacity-70" numberOfLines={1}>
                                    Opened {istWhen(serverDate(item.opened_at))}
                                </Text>
                            ) : null}
                        </View>
                    </View>
                    <View className="items-end shrink-0">
                        <Text className="text-text-primary font-bold text-sm">{Math.abs(item.quantity)} {Math.abs(item.quantity) === 1 ? 'Share' : 'Shares'}</Text>
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
                            <Text className="text-text-primary font-bold text-xs">{inr(Math.abs(item.quantity) * item.average_price)}</Text>
                        </View>
                        <View className="items-end">
                            <Text className="text-text-secondary text-[11px] uppercase font-bold tracking-widest">Day Change</Text>
                            <View className="flex-row items-center">
                                <Text className={`font-bold text-xs ${(item.day_change_perc || 0) >= 0 ? 'text-success' : 'text-error'}`}>
                                    {(item.day_change_perc || 0) >= 0 ? '+' : ''}{(item.day_change_perc || 0).toFixed(2)}%
                                </Text>
                                <Text className={`text-[11px] font-bold ml-1 ${(item.day_change_perc || 0) >= 0 ? 'text-success opacity-80' : 'text-error opacity-80'}`}>
                                    ({inr((item.day_change_abs || 0) * item.quantity, { sign: true })})
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View className="flex-row gap-2 mb-3">
                        <TouchableOpacity
                            onPress={() => onQuickExit(item.symbol, item.current_ltp || item.average_price, item.position_id)}
                            className="flex-1 bg-error/10 border border-error/20 py-2 rounded-lg items-center justify-center"
                        >
                            <Text className="text-error font-black text-[11px] uppercase tracking-wider">Quick Exit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => onModify(item)}
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
});

const OrderHeaderRow = React.memo(({ item }: { item: any }) => {
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
});

const PendingOrderRow = React.memo(({ item, ltp, marketOpen, opensAtMs, loading, onSelect, onCancel }: {
    item: any;
    ltp: number | undefined;
    marketOpen: boolean;
    opensAtMs: number;
    loading: boolean;
    /** Minute counter: re-renders the relative times ("Today, …", "Mon 9:15"). */
    clock: number;
    onSelect: (order: any) => void;
    onCancel: (order: any) => void;
}) => {
    const isBuy = item.side !== 'SELL';
    const status = pendingStatus(item, ltp, marketOpen, new Date(opensAtMs));
    const rule = entryRule(item);
    const risk = [item.stop_loss ? `SL ${px(item.stop_loss)}` : '', item.target ? `Target ${px(item.target)}` : ''].filter(Boolean).join(' · ');
    return (
        <View className="bg-surface rounded-2xl border border-primary/20 mb-3 overflow-hidden">
            <TouchableOpacity
                onPress={() => onSelect(item)}
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
                onPress={() => onCancel(item)}
                accessibilityRole="button"
                accessibilityLabel={`Cancel the ${item.side} order for ${item.quantity} ${item.symbol}`}
                className="border-t border-border/50 py-2.5 items-center"
            >
                <Text className={`font-black text-[11px] uppercase tracking-wider ${loading ? 'text-error/50' : 'text-error'}`}>Cancel order</Text>
            </TouchableOpacity>
        </View>
    );
});

const ClosedOrderRow = React.memo(({ item, onSelect }: { item: any; clock: number; onSelect: (order: any) => void }) => {
    const isBuy = item.side !== 'SELL';
    const tag = isExpired(item) ? 'EXPIRED' : item.status;
    return (
        <TouchableOpacity
            onPress={() => onSelect(item)}
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
});

const TradeRow = React.memo(({ item, expanded: isExpanded, openPnl, onToggle, onSelect }: {
    item: any;
    expanded: boolean;
    /** Live unrealized P&L of an OPEN trade's position (undefined if not loaded). */
    openPnl?: number;
    onToggle: (id: string) => void;
    onSelect: (order: any) => void;
}) => {
    const closed = item.status === 'CLOSED';
    const n = item.orders.length;
    // A trade's realized_pnl is NET of charges, so an open trade with nothing sold
    // yet showed only its entry charges (e.g. -₹30.19), which read like a loss.
    // Open: the live P&L of what is still held. Closed: the net result.
    const headline: number | undefined = closed ? item.realized_pnl : openPnl;
    const sub = closed
        ? `net · charges ${inr(item.charges || 0)}`
        : `open · charges ${inr(item.charges || 0)}${item.gross_pnl ? ` · booked ${inr(item.realized_pnl, { sign: true })}` : ''}`;
    return (
        <View className="bg-surface rounded-2xl border border-border mb-3 overflow-hidden">
            <TouchableOpacity
                onPress={() => onToggle(item.id)}
                activeOpacity={0.7}
                className="p-4"
            >
                <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center flex-1 min-w-0 mr-3">
                        <View className={`w-7 h-7 rounded-lg items-center justify-center mr-3 ${closed ? 'bg-primary/20' : 'bg-success/10'}`}>
                            <Briefcase size={12} color={closed ? '#00E0A1' : '#10B981'} />
                        </View>
                        <View className="flex-1 min-w-0">
                            <Text className="text-text-primary font-bold text-sm" numberOfLines={1}>{item.symbol}</Text>
                            <Text className="text-text-muted text-[11px] font-bold uppercase tracking-widest" numberOfLines={1}>
                                {closed ? 'Closed' : 'Open'} • {n} {n === 1 ? 'execution' : 'executions'}
                            </Text>
                        </View>
                    </View>
                    <View className="items-end shrink-0">
                        {headline != null ? (
                            <Text className={`font-black text-sm ${headline >= -0.005 ? 'text-success' : 'text-error'}`}>
                                {inr(headline, { sign: true })}
                            </Text>
                        ) : (
                            <Text className="font-black text-sm text-text-muted">Open</Text>
                        )}
                        <Text className="text-text-muted text-[11px]" numberOfLines={1}>{sub}</Text>
                        <View className="flex-row items-center">
                            <Text className="text-text-muted text-[11px] mr-1">{istClock(serverDate(item.timestamp))}</Text>
                            {isExpanded ? <ChevronDown size={12} color="#6B7280" /> : <ChevronRight size={12} color="#6B7280" />}
                        </View>
                    </View>
                </View>
            </TouchableOpacity>

            {isExpanded && (
                <View className="bg-background/40 border-t border-border/50 p-4 pt-2">
                    {item.orders.map((ord: any, idx: number) => {
                        const qty = ord.filled_quantity || ord.quantity;
                        const price = ord.average_fill_price || 0;
                        const leg = ord.realized_pnl;
                        return (
                            <TouchableOpacity
                                key={ord.order_id}
                                onPress={() => onSelect(ord)}
                                className={`flex-row justify-between items-center py-3 ${idx !== n - 1 ? 'border-b border-border/30' : ''}`}
                            >
                                <View className="flex-row items-center flex-1 min-w-0 mr-2">
                                    <View className={`px-2 py-0.5 rounded-md mr-3 ${ord.side === 'BUY' ? 'bg-success/10' : 'bg-error/10'}`}>
                                        <Text className={`text-[11px] font-black ${ord.side === 'BUY' ? 'text-success' : 'text-error'}`}>{ord.side}</Text>
                                    </View>
                                    <View className="flex-1 min-w-0">
                                        {/* quantity x price per share = total */}
                                        <Text className="text-text-primary text-xs font-bold" numberOfLines={1}
                                            accessibilityLabel={`${qty} shares at ${inr(price)} each, ${inr(qty * price)} in total`}>
                                            {qty} × {inr(price)} = <Text className="text-primary font-black">{inr(qty * price)}</Text>
                                        </Text>
                                        <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={1}>
                                            {ord.side === 'BUY' ? 'Bought' : 'Sold'} {qty} {qty === 1 ? 'share' : 'shares'} at {inr(price)} each · {istClock(serverDate(ord.filled_at || ord.created_at))}
                                        </Text>
                                    </View>
                                </View>
                                {leg !== undefined && leg !== null ? (
                                    <View className="items-end shrink-0">
                                        <Text className={`text-[11px] font-black ${(leg || 0) >= -0.005 ? 'text-success' : 'text-error'}`}>
                                            {inr(leg || 0, { sign: true })}
                                        </Text>
                                        <Text className="text-text-muted text-[10px]">gross</Text>
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}
        </View>
    );
});

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

    const { subscribe, unsubscribe } = useMarketData();
    const isFocused = useIsFocused();

    // NSE session (holiday + next_session from the market pulse) for pending-order status.
    const [session, setSession] = useState<MarketSession | null>(null);
    // Re-render every minute so "waiting for market open" flips at 09:15.
    const [clockTick, setClockTick] = useState(0);
    React.useEffect(() => {
        if (!isFocused) return;
        const id = setInterval(() => setClockTick(t => t + 1), 60_000);
        return () => clearInterval(id);
    }, [isFocused]);
    const nowDate = new Date();
    const marketOpen = isExchangeOpen(nowDate) && !isHolidayToday(session, nowDate);
    const opensAt = nextMarketOpen(session?.next_session, nowDate);
    const opensAtMs = opensAt.getTime();

    // Live prices for pending orders while the Orders tab is visible. subscribe/
    // unsubscribe change identity on every tick, so they are read through a ref.
    const subRef = React.useRef({ subscribe, unsubscribe });
    subRef.current = { subscribe, unsubscribe };
    const pendingSymbolsKey = useMemo(
        () => Array.from(new Set(orders.filter(o => o.status === 'PENDING').map(o => String(o.symbol)))).sort().join(','),
        [orders]);
    React.useEffect(() => {
        if (!isFocused || activeTab !== 'ORDERS' || !pendingSymbolsKey) return;
        const syms = pendingSymbolsKey.split(',');
        syms.forEach(sym => subRef.current.subscribe(sym));
        return () => syms.forEach(sym => subRef.current.unsubscribe(sym));
    }, [isFocused, activeTab, pendingSymbolsKey]);

    // Ticks for the open positions and pending orders only, frozen while unfocused.
    const tickKeys = useMemo(() => {
        const keys = new Set<string>();
        positions.forEach(p => keys.add(`NSE:${stockCode(p.symbol)}`));
        if (pendingSymbolsKey) pendingSymbolsKey.split(',').forEach(sym => keys.add(`NSE:${stockCode(sym)}`));
        return Array.from(keys);
    }, [positions, pendingSymbolsKey]);
    const ticks = useLivePrices(tickKeys, !isFocused);

    // Apply live prices to positions for real-time P&L. A position whose tick did
    // not change keeps its previous object, so its memoized row is not re-rendered.
    const livePosCache = useRef(new Map<any, { tick: Tick; value: any }>());
    const livePositions = React.useMemo(() => {
        const prevCache = livePosCache.current;
        const nextCache = new Map<any, { tick: Tick; value: any }>();
        const result = positions.map(pos => {
            const stock_code = pos.symbol.split('.')[0].toUpperCase();
            const tick = ticks[`NSE:${stock_code}`];
            if (tick) {
                const hit = prevCache.get(pos);
                if (hit && hit.tick === tick) {
                    nextCache.set(pos, hit);
                    return hit.value;
                }
                const current_ltp = tick.ltp;
                const unrealized_pnl = (current_ltp - pos.average_price) * pos.quantity;
                const value = {
                    ...pos,
                    current_ltp,
                    unrealized_pnl,
                    day_change_abs: tick.day_change_abs,
                    day_change_perc: tick.day_change_perc
                };
                nextCache.set(pos, { tick, value });
                return value;
            }
            return pos;
        });
        livePosCache.current = nextCache;
        return result;
    }, [positions, ticks]);

    /** `silent`: the 30s background refresh, which must not flash the spinner or disable buttons. */
    const fetchData = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const savedId = await AsyncStorage.getItem('USER_ID');
            const uid = savedId || TEST_USER_ID;
            setUserId(uid);
            getMarketSession().then(setSession).catch(() => { });

            // Positions are synced in parallel with the rest.
            const [ordRes, accRes, tRes, dRes] = await Promise.all([
                paperFetch(`/orders/${uid}`),
                paperFetch(`/account/${uid}`),
                paperFetch(`/trades/${uid}`),
                paperFetch(`/stats/daily/${uid}`),
                refreshPositions(),
            ]);

            const ordData = await ordRes.json();
            const accData = await accRes.json();
            const tData = await tRes.json();
            const dData = dRes.ok ? await dRes.json() : {};

            setOrders(Array.isArray(ordData) ? ordData : []);
            setAccount(accData);
            setTrades(Array.isArray(tData) ? tData : []);
            setDailyPnl(dData && typeof dData === 'object' && !Array.isArray(dData) ? dData : {});
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [activeTab])
    );

    // Cash, orders, trades and today's realized P&L every 30s while this screen
    // is open (positions already poll in PositionContext). Before, they only
    // reloaded on focus, so an SL/target exit left Cash and P&L stale.
    const appActive = useAppActive();
    const fetchRef = useRef(fetchData);
    fetchRef.current = fetchData;
    React.useEffect(() => {
        if (!isFocused || !appActive) return;
        const t = setInterval(() => fetchRef.current(true), 30_000);
        return () => clearInterval(t);
    }, [isFocused, appActive]);

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

    // Today's realized P&L, NET of charges, for the IST trading day. Order
    // realized_pnl is gross (charges are separate), so it is not summed here.
    const todayRealizedPnL = dailyPnl[istDayKey(Date.now())] || 0;
    // Same figures and labels as the web's Paper Trading panel.
    const sum = portfolioSummary(account, livePositions, todayRealizedPnL);
    const totalUnrealizedPnL = sum.unrealized;
    // `balance` is FREE cash; pending orders hold `reserved` on top of it.
    const reserved = Number(account?.reserved) || 0;

    // Keep lifetime stats for potential Analytics usage
    const allRealizedPnL = orders.reduce((acc, ord) => acc + (ord.realized_pnl || 0), 0);
    const lifetimeReturns = (totalUnrealizedPnL || 0) + allRealizedPnL;
    // --- Order Grouping Logic ---
    const [expandedTrades, setExpandedTrades] = useState<string[]>([]);
    const [expandedPositions, setExpandedPositions] = useState<string[]>([]);

    const toggleTrade = useCallback((id: string) => {
        setExpandedTrades(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    }, []);

    const togglePosition = useCallback((id: string) => {
        setExpandedPositions(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    }, []);

    // Row callbacks with a stable identity (memoized rows); they call the latest handlers.
    const handlers = useRef({ quickExit, confirmCancel });
    handlers.current = { quickExit, confirmCancel };
    const onQuickExit = useCallback((symbol: string, currentLtp: number, positionId?: string) => {
        handlers.current.quickExit(symbol, currentLtp, positionId);
    }, []);
    const onCancelOrder = useCallback((o: any) => handlers.current.confirmCancel(o), []);
    const onModify = useCallback((item: any) => {
        setModifyingPos(item);
        setNewSL(item.stop_loss?.toString() || '');
        setNewTarget(item.target?.toString() || '');
        setNewTrailingSL(item.trailing_sl?.toString() || '');
    }, []);

    // Live unrealized P&L per position: the headline of its OPEN trade card.
    const openPnlByPosition = useMemo(() => {
        const m: Record<string, number> = {};
        livePositions.forEach((p: any) => { m[p.position_id] = p.unrealized_pnl || 0; });
        return m;
    }, [livePositions]);

    const groupedTrades = useMemo(() => {
        if (!trades || trades.length === 0) return [];

        // Orders by id (with their position in `orders` and parsed creation time),
        // instead of scanning every order for every trade.
        const byId = new Map<string, { o: any; idx: number; at: number }>();
        orders.forEach((o, idx) => {
            if (!byId.has(o.order_id)) byId.set(o.order_id, { o, idx, at: serverDate(o.created_at)?.getTime() ?? 0 });
        });

        return trades.map(t => {
            // Find orders belonging to this trade (newest first; ties keep the `orders` order)
            const entries: { o: any; idx: number; at: number }[] = [];
            new Set<string>(t.order_ids || []).forEach(id => {
                const e = byId.get(id);
                if (e) entries.push(e);
            });
            const tradeOrders = entries
                .sort((a, b) => (b.at - a.at) || (a.idx - b.idx))
                .map(e => e.o);

            return {
                id: t.position_id,
                symbol: t.symbol,
                orders: tradeOrders,
                realized_pnl: t.realized_pnl,
                gross_pnl: t.gross_pnl,
                charges: t.charges,
                status: t.status,
                timestamp: t.updated_at,
                type: t.type
            };
        });
    }, [trades, orders]);

    const tradeData = useMemo(() => {
        const rawTrades = groupedTrades;
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
    }, [groupedTrades, orders]);

    const renderPosition = useCallback(({ item }: { item: any }) => (
        <PositionRow
            item={item}
            expanded={expandedPositions.includes(item.position_id)}
            onToggle={togglePosition}
            onQuickExit={onQuickExit}
            onModify={onModify}
        />
    ), [expandedPositions, togglePosition, onQuickExit, onModify]);

    const renderOrder = useCallback(({ item }: { item: any }) => {
        if (item.itemType === 'HEADER') return <OrderHeaderRow item={item} />;
        if (item.itemType === 'PENDING_ORDER') {
            return (
                <PendingOrderRow
                    item={item}
                    ltp={ticks[`NSE:${stockCode(item.symbol)}`]?.ltp}
                    marketOpen={marketOpen}
                    opensAtMs={opensAtMs}
                    loading={loading}
                    clock={clockTick}
                    onSelect={setSelectedOrder}
                    onCancel={onCancelOrder}
                />
            );
        }
        if (item.itemType === 'CLOSED_ORDER') return <ClosedOrderRow item={item} clock={clockTick} onSelect={setSelectedOrder} />;
        return <TradeRow item={item} expanded={expandedTrades.includes(item.id)} openPnl={openPnlByPosition[item.id]}
            onToggle={toggleTrade} onSelect={setSelectedOrder} />;
    }, [ticks, marketOpen, opensAtMs, loading, clockTick, onCancelOrder, expandedTrades, toggleTrade, openPnlByPosition]);
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
                        {sum.accountValue != null ? inr(sum.accountValue) : '—'}
                    </Text>
                    <Text className="text-[13px] font-bold" style={{ color: signColor(sum.todayPnl) }}
                        accessibilityLabel={`Today's P&L ${inr(sum.todayPnl, { sign: true })}: closed today plus today's move on open positions`}>
                        {inr(sum.todayPnl, { sign: true })} today
                    </Text>
                    <View className="flex-row mt-3 pt-3 border-t border-border">
                        <View className="flex-1">
                            <Text className="text-text-muted text-xs font-semibold">Cash</Text>
                            <Text className="text-text-primary text-sm font-bold mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>{sum.cash != null ? inr(sum.cash, { compact: true }) : '—'}</Text>
                        </View>
                        <View className="flex-1">
                            <Text className="text-text-muted text-xs font-semibold">Current value</Text>
                            <Text className="text-text-primary text-sm font-bold mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>{inr(sum.currentValue, { compact: true })}</Text>
                        </View>
                        <View className="flex-1 items-end">
                            <Text className="text-text-muted text-xs font-semibold">Unrealized P&L</Text>
                            <Text className="text-sm font-bold mt-0.5" style={{ color: signColor(sum.unrealized), fontVariant: ['tabular-nums'] }}>
                                {inr(sum.unrealized, { sign: true, compact: true })}
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
