import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, Alert,
} from 'react-native';
import {
    ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, ChevronLeft, RefreshCw, Radar, Send,
    ShieldAlert, Target, AlertTriangle, CircleCheck, CircleX, Clock,
} from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, BridgeStatus, ScanCandidate, ScanExecution, ScanStyle, scanner } from '../api';
import { TEST_USER_ID } from '../config';

/**
 * TradeMasterBackend's opportunity scanner: ranked candidates with entry,
 * stop and target, and the paper orders the execution bridge placed for them.
 */

const STATUS_COLOR: Record<string, string> = {
    qualified: '#10B981',
    watchlist: '#F59E0B',
};

const EXEC_STYLE: Record<ScanExecution['status'], { color: string; label: string }> = {
    placed: { color: '#10B981', label: 'Placed' },
    rejected: { color: '#EF4444', label: 'Rejected' },
    failed: { color: '#F59E0B', label: 'Failed' },
    cancelled: { color: '#94A3B8', label: 'Cancelled' },
};

const rupee = (v?: number | null) => (v == null ? '---' : `₹${Number(v).toFixed(2)}`);
const timeAgo = (iso?: string | null) => {
    if (!iso) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `${mins}m ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
};
const errorText = (e: unknown) =>
    e instanceof ApiError
        ? (e.status === 401 ? 'Backend refused the API key (check EXPO_PUBLIC_BACKEND_API_KEY).' : e.message)
        : 'Cannot reach TradeMasterBackend.';

const ScannerScreen = () => {
    const navigation = useNavigation<any>();
    const [style, setStyle] = useState<ScanStyle>('intraday');
    const [view, setView] = useState<'OPPORTUNITIES' | 'ORDERS'>('OPPORTUNITIES');
    const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
    const [executions, setExecutions] = useState<ScanExecution[]>([]);
    const [bridge, setBridge] = useState<BridgeStatus | null>(null);
    const [universes, setUniverses] = useState<Record<ScanStyle, string>>({ intraday: 'nifty100', swing: 'nifty500' });
    const [marketOpen, setMarketOpen] = useState<boolean | null>(null);
    const [userId, setUserId] = useState(TEST_USER_ID);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [sending, setSending] = useState<string | null>(null);
    const [scanRun, setScanRun] = useState<string | null>(null);
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async (s: ScanStyle = style) => {
        try {
            setError(null);
            const [c, e] = await Promise.all([scanner.candidates(s), scanner.executions()]);
            setCandidates(c.candidates);
            setExecutions(e.items);
            setBridge(e.bridge);
        } catch (err) {
            setError(errorText(err));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [style]);

    useEffect(() => {
        (async () => {
            const saved = await AsyncStorage.getItem('USER_ID');
            if (saved) setUserId(saved);
            try {
                const meta = await scanner.meta();
                setMarketOpen(!!meta.market?.open);
                setUniverses({
                    intraday: meta.schedules?.intraday?.universe || 'nifty100',
                    swing: meta.schedules?.swing?.universe || 'nifty500',
                });
            } catch {
                // Meta only refines defaults; load() reports connection problems.
            }
        })();
        return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const switchStyle = (s: ScanStyle) => {
        if (s === style) return;
        setStyle(s);
        setExpanded(null);
        setLoading(true);
        load(s);
    };

    const pollRun = (runId: string) => {
        pollTimer.current = setTimeout(async () => {
            try {
                const run = await scanner.run(runId);
                if (run.status === 'running') return pollRun(runId);
                setScanRun(null);
                if (run.status === 'failed') {
                    Alert.alert('Scan failed', run.errors?.[0] || 'See backend logs');
                }
                load();
            } catch {
                setScanRun(null);
            }
        }, 3000);
    };

    const runScan = async () => {
        try {
            const run = await scanner.scan(style, universes[style]);
            setScanRun(run.id);
            pollRun(run.id);
        } catch (err) {
            Alert.alert('Scan not started', errorText(err));
        }
    };

    const sendToPaper = (c: ScanCandidate) => {
        const target = c.targets?.[0];
        const go = async () => {
            try {
                setSending(c.id);
                const rec = await scanner.execute(c.id);
                if (rec.status === 'placed') {
                    Alert.alert('Paper order placed',
                        `${c.symbol} ${c.direction.toUpperCase()} x${rec.request.quantity} @ ${rupee(rec.request.entry)} (${rec.request.entry_type})` +
                        (rec.request.user_id !== userId ? `\n\nNote: placed in account "${rec.request.user_id}", not yours ("${userId}").` : ''));
                } else {
                    Alert.alert(`Order ${rec.status}`, rec.error || 'See the Paper Orders tab');
                }
                load();
            } catch (err) {
                Alert.alert('Cannot send', errorText(err).replace(/^Cannot send: /, ''));
            } finally {
                setSending(null);
            }
        };
        Alert.alert(
            'Send to paper trading?',
            `${c.direction === 'long' ? 'BUY' : 'SELL'} ${c.quantity ?? '?'} ${c.symbol}\n` +
            `Entry ≤ ${rupee(c.direction === 'long' ? c.entry_high : c.entry_low)} • SL ${rupee(c.stop)} • Target ${rupee(target)}` +
            (bridge && bridge.paper_user_id !== userId ? `\n\nAccount: "${bridge.paper_user_id}"` : ''),
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Send', onPress: go }],
        );
    };

    const execByCandidate = React.useMemo(() => {
        const m: Record<string, ScanExecution> = {};
        executions.forEach(e => { m[e.candidate_id] = e; });
        return m;
    }, [executions]);

    // --- pieces -----------------------------------------------------------------
    const renderBridgeBanner = () => {
        if (!bridge) return null;
        const otherAccount = bridge.paper_user_id !== userId;
        if (bridge.enabled && !otherAccount) {
            return (
                <View className="mx-6 mb-4 p-3 rounded-2xl bg-success/10 border border-success/20 flex-row items-center">
                    <CircleCheck size={16} color="#10B981" />
                    <Text className="text-text-primary text-[11px] font-bold ml-2 flex-1">
                        Auto paper-trading ON • sends on {bridge.trigger === 'entry_confirmed' ? 'entry confirmation' : 'qualification'}
                    </Text>
                </View>
            );
        }
        return (
            <View className="mx-6 mb-4 p-3 rounded-2xl bg-primary/5 border border-border flex-row items-start">
                <AlertTriangle size={16} color="#F59E0B" />
                <Text className="text-text-muted text-[11px] font-bold ml-2 flex-1 leading-4">
                    {bridge.enabled ? 'Auto paper-trading ON. ' : 'Auto paper-trading OFF: you can still send candidates by hand. '}
                    {otherAccount ? `Scanner orders go to account "${bridge.paper_user_id}", you are "${userId}". Set portfolio.paper_user_id in the scanner config to match.` : ''}
                    {!bridge.outbound_key_set ? ' Backend has no PAPER_TRADING_SERVICE_API_KEY.' : ''}
                </Text>
            </View>
        );
    };

    const renderExecBadge = (e?: ScanExecution) => {
        if (!e) return null;
        const s = EXEC_STYLE[e.status];
        return (
            <View className="px-2 py-0.5 rounded-md ml-2" style={{ backgroundColor: `${s.color}20` }}>
                <Text className="text-[9px] font-black uppercase" style={{ color: s.color }}>Paper: {s.label}</Text>
            </View>
        );
    };

    const renderCandidate = (c: ScanCandidate) => {
        const open = expanded === c.id;
        const long = c.direction === 'long';
        const color = STATUS_COLOR[c.status] || '#94A3B8';
        const exec = execByCandidate[c.id];
        const canSend = !exec || exec.status === 'failed' || exec.status === 'rejected';
        const swingShort = c.style === 'swing' && !long;
        return (
            <TouchableOpacity
                key={c.id}
                activeOpacity={0.9}
                onPress={() => setExpanded(open ? null : c.id)}
                className="bg-surface rounded-3xl border border-border/40 mb-3 overflow-hidden"
            >
                <View className="p-5">
                    <View className="flex-row justify-between items-center">
                        <View className="flex-row items-center flex-1">
                            <View className="w-11 h-11 rounded-2xl items-center justify-center mr-3"
                                style={{ backgroundColor: long ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
                                {long ? <ArrowUpRight size={22} color="#10B981" /> : <ArrowDownRight size={22} color="#EF4444" />}
                            </View>
                            <View className="flex-1">
                                <View className="flex-row items-center">
                                    {c.rank != null && <Text className="text-text-muted font-black text-xs mr-1">#{c.rank}</Text>}
                                    <Text className="text-text-primary font-black text-lg tracking-tight">{c.symbol}</Text>
                                </View>
                                <View className="flex-row items-center mt-1 flex-wrap">
                                    <View className="px-2 py-0.5 rounded-md mr-2" style={{ backgroundColor: `${color}20` }}>
                                        <Text className="text-[9px] font-black uppercase" style={{ color }}>{c.status}</Text>
                                    </View>
                                    <Text className="text-text-muted text-[10px] font-bold">{c.strategy} • {c.setup_state}</Text>
                                    {renderExecBadge(exec)}
                                </View>
                            </View>
                        </View>
                        <View className="items-end">
                            <Text className="text-text-primary font-black text-lg">{Math.round(c.score)}</Text>
                            <Text className="text-text-muted text-[9px] font-bold uppercase">Score</Text>
                        </View>
                    </View>

                    {open && (
                        <View className="mt-5 pt-5 border-t border-border/30">
                            <View className="flex-row justify-between mb-5">
                                <View className="items-center flex-1 border-r border-border/20">
                                    <ArrowUpRight size={14} color="#00E0A1" />
                                    <Text className="text-text-muted text-[8px] font-bold uppercase my-1">Entry band</Text>
                                    <Text className="text-text-primary font-black text-xs">{c.entry_low.toFixed(2)}–{c.entry_high.toFixed(2)}</Text>
                                </View>
                                <View className="items-center flex-1 border-r border-border/20">
                                    <ShieldAlert size={14} color="#EF4444" />
                                    <Text className="text-text-muted text-[8px] font-bold uppercase my-1">Stop</Text>
                                    <Text className="text-error font-black text-xs">{rupee(c.stop)}</Text>
                                </View>
                                <View className="items-center flex-1">
                                    <Target size={14} color="#10B981" />
                                    <Text className="text-text-muted text-[8px] font-bold uppercase my-1">Target</Text>
                                    <Text className="text-success font-black text-xs">{rupee(c.targets?.[0])}</Text>
                                </View>
                            </View>

                            <View className="flex-row justify-between mb-4">
                                <Text className="text-text-muted text-[11px] font-bold">LTP {rupee(c.reference_price)}{c.change_pct != null ? ` (${c.change_pct >= 0 ? '+' : ''}${c.change_pct.toFixed(2)}%)` : ''}</Text>
                                <Text className="text-text-muted text-[11px] font-bold">Net R:R {c.reward_risk_net?.toFixed(2) ?? '---'} • Qty {c.quantity ?? '---'}</Text>
                            </View>

                            {!!c.status_reason && (
                                <Text className="text-text-muted text-[11px] italic mb-3">{c.status_reason}</Text>
                            )}
                            {c.flags.map(f => (
                                <View key={f.code} className="flex-row items-center mb-1">
                                    <AlertTriangle size={11} color={f.severity === 'block' ? '#EF4444' : '#F59E0B'} />
                                    <Text className="text-text-muted text-[10px] ml-1 flex-1">{f.message}</Text>
                                </View>
                            ))}
                            {exec?.error && (
                                <Text className="text-error text-[10px] font-bold mt-2">Paper: {exec.error}</Text>
                            )}
                            <Text className="text-text-muted text-[9px] mt-2">
                                Updated {timeAgo(c.updated_at)}{c.expires_at ? ` • expires ${new Date(c.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                                {c.entry_confirmed_at ? ' • entry confirmed' : ''}
                            </Text>

                            <View className="flex-row mt-4 gap-3">
                                <TouchableOpacity
                                    onPress={() => navigation.navigate('StockDetail', { symbol: c.symbol })}
                                    className="flex-1 py-3.5 rounded-2xl items-center border border-border bg-background"
                                >
                                    <Text className="text-text-primary font-black text-xs uppercase">Chart</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    disabled={!canSend || swingShort || sending === c.id}
                                    onPress={() => sendToPaper(c)}
                                    className={`flex-[2] py-3.5 rounded-2xl items-center flex-row justify-center ${canSend && !swingShort ? 'bg-primary' : 'bg-primary/30'}`}
                                >
                                    {sending === c.id ? <ActivityIndicator color="white" size="small" /> : <Send size={14} color="white" />}
                                    <Text className="text-white font-black text-xs uppercase ml-2">
                                        {swingShort ? 'Swing shorts not tradable' : canSend ? 'Send to Paper' : 'Already sent'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const renderExecution = (e: ScanExecution) => {
        const s = EXEC_STYLE[e.status];
        const Icon = e.status === 'placed' ? CircleCheck : e.status === 'failed' ? Clock : CircleX;
        return (
            <View key={e.candidate_id} className="bg-surface rounded-3xl border border-border/40 mb-3 p-4">
                <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center flex-1">
                        <Icon size={18} color={s.color} />
                        <View className="ml-3 flex-1">
                            <Text className="text-text-primary font-black">
                                {e.symbol} <Text className="text-text-muted text-xs">{e.direction === 'long' ? 'BUY' : 'SELL'} x{e.request?.quantity ?? '?'}</Text>
                            </Text>
                            <Text className="text-text-muted text-[10px] font-bold">
                                {e.strategy} • {e.style} • {e.trigger}{e.attempts > 1 ? ` • ${e.attempts} attempts` : ''}
                            </Text>
                        </View>
                    </View>
                    <View className="items-end">
                        <Text className="text-[10px] font-black uppercase" style={{ color: s.color }}>{s.label}</Text>
                        <Text className="text-text-muted text-[9px]">{timeAgo(e.updated_at)}</Text>
                    </View>
                </View>
                <Text className="text-text-muted text-[10px] mt-2">
                    {e.request?.entry_type?.toUpperCase()} {rupee(e.request?.entry)} • SL {rupee(e.request?.stop_loss)} • TGT {rupee(e.request?.target)}
                    {e.order_status ? ` • order ${e.order_status}` : ''}{e.fill_price ? ` @ ${rupee(e.fill_price)}` : ''}
                </Text>
                {!!e.error && <Text className="text-error text-[10px] font-bold mt-1">{e.error}</Text>}
            </View>
        );
    };

    const qualified = candidates.filter(c => c.status === 'qualified');
    const watch = candidates.filter(c => c.status !== 'qualified');

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />

            <View className="px-6 pt-14 pb-4 flex-row justify-between items-end">
                <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 -ml-2 mr-2">
                        <ChevronLeft size={26} color="#E1E7ED" />
                    </TouchableOpacity>
                    <View>
                        <Text className="text-text-primary text-3xl font-black">Scanner</Text>
                        <Text className="text-text-muted text-xs font-bold uppercase tracking-widest mt-1">
                            Opportunities • {marketOpen == null ? '' : marketOpen ? 'Market open' : 'Market closed'}
                        </Text>
                    </View>
                </View>
                <View className="flex-row">
                    <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} className="p-3 bg-surface rounded-2xl border border-border/30 mr-2">
                        <RefreshCw size={18} color="#00E0A1" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        disabled={!!scanRun}
                        onPress={runScan}
                        className={`p-3 rounded-2xl ${scanRun ? 'bg-primary/40' : 'bg-primary shadow-lg shadow-primary/20'}`}
                    >
                        {scanRun ? <ActivityIndicator color="white" size="small" /> : <Radar size={18} color="white" />}
                    </TouchableOpacity>
                </View>
            </View>

            {scanRun && (
                <Text className="text-primary text-[11px] font-bold px-6 mb-3">
                    Scanning {universes[style]} ({style})… results refresh when it finishes.
                </Text>
            )}

            <View className="px-6 mb-4 flex-row gap-3">
                <View className="flex-1 bg-surface p-1 rounded-2xl flex-row border border-border">
                    {(['intraday', 'swing'] as ScanStyle[]).map(s => (
                        <TouchableOpacity key={s} onPress={() => switchStyle(s)}
                            className={`flex-1 py-2.5 rounded-xl items-center ${style === s ? 'bg-primary' : ''}`}>
                            <Text className={`text-[11px] font-black uppercase ${style === s ? 'text-white' : 'text-text-muted'}`}>{s}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View className="flex-1 bg-surface p-1 rounded-2xl flex-row border border-border">
                    {(['OPPORTUNITIES', 'ORDERS'] as const).map(v => (
                        <TouchableOpacity key={v} onPress={() => setView(v)}
                            className={`flex-1 py-2.5 rounded-xl items-center ${view === v ? 'bg-primary-blue' : ''}`}>
                            <Text className={`text-[11px] font-black uppercase ${view === v ? 'text-white' : 'text-text-muted'}`}>
                                {v === 'OPPORTUNITIES' ? 'Ideas' : 'Paper'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {renderBridgeBanner()}

            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#00E0A1" />
                </View>
            ) : (
                <ScrollView
                    className="flex-1 px-6"
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#00E0A1" />}
                >
                    {error && (
                        <View className="p-4 rounded-2xl bg-error/10 border border-error/20 mb-4">
                            <Text className="text-error text-xs font-bold">{error}</Text>
                        </View>
                    )}

                    {view === 'OPPORTUNITIES' ? (
                        <>
                            {!error && candidates.length === 0 && (
                                <Text className="text-text-muted text-center mt-16 font-bold">
                                    No active {style} candidates.{'\n'}Tap the radar to run a scan.
                                </Text>
                            )}
                            {qualified.length > 0 && (
                                <Text className="text-text-muted text-[10px] font-black uppercase tracking-widest mb-3">Qualified • {qualified.length}</Text>
                            )}
                            {qualified.map(renderCandidate)}
                            {watch.length > 0 && (
                                <Text className="text-text-muted text-[10px] font-black uppercase tracking-widest mb-3 mt-3">Watchlist • {watch.length}</Text>
                            )}
                            {watch.map(renderCandidate)}
                        </>
                    ) : (
                        <>
                            {!error && executions.length === 0 && (
                                <Text className="text-text-muted text-center mt-16 font-bold">No scanner orders yet.</Text>
                            )}
                            {executions.map(renderExecution)}
                        </>
                    )}
                    <View className="h-24" />
                </ScrollView>
            )}
        </View>
    );
};

export default ScannerScreen;
