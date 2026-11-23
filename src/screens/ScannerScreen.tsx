import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '../components/Toast';
import {
    View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, Alert,
    Switch, Platform,
} from 'react-native';
import {
    ChevronDown, ChevronUp, RefreshCw, Radar, Send, AlertTriangle, CircleCheck, CircleX, Clock,
} from '../icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, BridgeStatus, ScanCandidate, ScanExecution, ScanStyle, scanner } from '../api';
import { TEST_USER_ID } from '../config';
import { confirmAction, Skeleton, SkeletonRow, ScreenHeader, IconButton, Segmented } from '../ui';
import { colors } from '../theme';
import { ago, inr as fmtInr, istClock } from '../format';
import { serverDate } from '../auth';

/**
 * TradeMasterBackend's opportunity scanner, as one tab: a compact list of
 * setups (one row per stock and side, Bullish / Bearish, Ready / Waiting),
 * each expanding into the full card per strategy (entry band, R:R, quantity,
 * warnings, Chart, Send to Paper), plus the paper orders the execution
 * bridge placed. Replaces the separate Intraday watchlist screen, which
 * showed the same candidates in a second layout.
 */

/** NSE session (Mon-Fri 09:15-15:30 IST): intraday candidates only exist then. */
function inSession(now = new Date()): boolean {
    // IST = UTC+5:30 with no DST, so this needs no Intl time-zone support (Hermes).
    const ist = new Date(now.getTime() + 330 * 60_000);
    const day = ist.getUTCDay();
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

/** ₹9,200 / ₹155.33 (Indian grouping, no trailing .00). */
const inr = (v?: number | null) => fmtInr(v, { trim: true });

/**
 * Yes/No confirmation. React Native's Alert with buttons is a no-op on web
 * (react-native-web), so the browser build uses window.confirm.
 */
const SCAN_CACHE_KEY = 'SCANNER_CACHE_V1';

type Side = 'long' | 'short';
type SignalFilter = 'ALL' | 'READY' | 'WAITING';
interface StockGroup {
    key: string;
    best: ScanCandidate;           // qualified first, then the higher score
    all: ScanCandidate[];          // every strategy that fired on this stock and side
}

const EXEC_STYLE: Record<ScanExecution['status'], { color: string; label: string }> = {
    placed: { color: '#10B981', label: 'Placed' },
    rejected: { color: '#EF4444', label: 'Rejected' },
    failed: { color: '#F59E0B', label: 'Failed' },
    cancelled: { color: '#94A3B8', label: 'Cancelled' },
};

const rupee = inr;
const timeAgo = (iso?: string | null) => {
    if (!iso) return '';
    const at = serverDate(iso);
    if (!at) return '';
    const mins = Math.max(0, Math.round((Date.now() - at.getTime()) / 60000));
    if (mins < 60) return `${mins}m ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
};
const errorText = (e: unknown) =>
    e instanceof ApiError
        ? (e.status === 401 ? 'Backend refused the API key (check EXPO_PUBLIC_BACKEND_API_KEY).' : e.message)
        : 'Cannot reach TradeMasterBackend.';

/** Failed records the backend is holding back say so ("Waiting: daily cap…", "Not sent: …"). */
const execStyle = (e: ScanExecution) =>
    e.status === 'failed' && e.error?.startsWith('Waiting') ? { color: '#60A5FA', label: 'Waiting' }
        : e.status === 'failed' && e.error?.startsWith('Not sent') ? { color: '#94A3B8', label: 'Skipped' }
            : EXEC_STYLE[e.status];

const renderExecBadge = (e?: ScanExecution) => {
    if (!e) return null;
    const s = execStyle(e);
    return (
        <View className="px-2 py-0.5 rounded-md ml-2" style={{ backgroundColor: `${s.color}20` }}>
            <Text className="text-[11px] font-black uppercase" style={{ color: s.color }}>Paper: {s.label}</Text>
        </View>
    );
};

/** One stock+side row; memoized so the list only re-renders rows whose data changed. */
/** The paper account already has this stock (same side: don't add; other side: don't hedge). */
type Holding = { side: 'long' | 'short'; what: string; same: boolean } | null;
function holdingOf(bridge: BridgeStatus | null, symbol: string, direction: 'long' | 'short'): Holding {
    const sym = symbol.toUpperCase().replace(/\.(NS|BO)$/, '');
    const h = bridge?.holdings ?? {};
    const other = direction === 'long' ? 'short' : 'long';
    if (h[`${sym}|${direction}`]) return { side: direction, what: h[`${sym}|${direction}`], same: true };
    if (h[`${sym}|${other}`]) return { side: other, what: h[`${sym}|${other}`], same: false };
    return null;
}

const ScanRow = React.memo(({ g, open, exec, holding, onToggle, children }: {
    g: StockGroup;
    open: boolean;
    exec?: ScanExecution;
    holding?: Holding;
    onToggle: (key: string) => void;
    /** The expanded strategy cards (only for the open row). */
    children?: React.ReactNode;
}) => {
    const c = g.best;
    const ready = c.status === 'qualified';
    return (
        <View className="mb-2">
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onToggle(g.key)}
                className={`bg-surface rounded-2xl border px-4 py-3 ${open ? 'border-primary/40' : 'border-border/40'}`}
            >
                <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                        <Text className="text-text-primary font-black text-base tracking-tight mr-2">{c.symbol}</Text>
                        <View className="px-1.5 py-0.5 rounded-md" style={{ backgroundColor: ready ? '#10B98120' : '#F59E0B20' }}>
                            <Text className="text-[11px] font-black uppercase" style={{ color: ready ? '#10B981' : '#F59E0B' }}>
                                {ready ? 'Ready' : 'Waiting'}
                            </Text>
                        </View>
                        {holding && (
                            <View className="px-1.5 py-0.5 rounded-md ml-1.5" style={{ backgroundColor: holding.same ? '#3B82F620' : '#F59E0B20' }}>
                                <Text className="text-[11px] font-black uppercase" style={{ color: holding.same ? '#3B82F6' : '#F59E0B' }}>
                                    {holding.same ? 'Holding' : `Holding ${holding.side}`}
                                </Text>
                            </View>
                        )}
                    </View>
                    <View className="flex-row items-center">
                        <Text className="text-text-primary font-black text-base mr-1">{Math.round(c.score)}</Text>
                        {open ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
                    </View>
                </View>
                <Text className="text-text-muted text-[11px] font-bold mt-1">
                    {inr(c.entry_trigger)} · SL <Text className="text-error">{inr(c.stop)}</Text> · TGT{' '}
                    <Text className="text-success">{inr(c.targets?.[0])}</Text>
                    {c.reward_risk_net != null ? ` · R:R ${c.reward_risk_net.toFixed(1)}` : ''}
                </Text>
                {(g.all.length > 1 || exec) && (
                    <View className="flex-row items-center mt-1.5">
                        {g.all.length > 1 && (
                            <Text className="text-text-muted text-[11px] font-bold mr-1">
                                {g.all.map(x => x.strategy).join(' + ')}
                            </Text>
                        )}
                        {renderExecBadge(exec)}
                    </View>
                )}
            </TouchableOpacity>
            {open && <View className="mt-2">{children}</View>}
        </View>
    );
});

const ScannerScreen = () => {
    const navigation = useNavigation<any>();
    // Intraday in market hours, swing otherwise: never empty while candidates exist.
    const [style, setStyle] = useState<ScanStyle>(() => (inSession() ? 'intraday' : 'swing'));
    const [side, setSide] = useState<Side>('long');
    const [signal, setSignal] = useState<SignalFilter>('ALL');
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

    const [loadedAt, setLoadedAt] = useState<number | null>(null);
    const [syncing, setSyncing] = useState(false);

    /** Show the last result for this style instantly; the fresh fetch takes several seconds. */
    const showCached = useCallback(async (s: ScanStyle) => {
        try {
            const raw = await AsyncStorage.getItem(`${SCAN_CACHE_KEY}:${s}`);
            if (!raw) return false;
            const c = JSON.parse(raw);
            setCandidates(c.candidates || []);
            setExecutions(c.executions || []);
            setBridge(c.bridge || null);
            setLoadedAt(c.at || null);
            setLoading(false);
            return true;
        } catch {
            return false;
        }
    }, []);

    const load = useCallback(async (s: ScanStyle = style) => {
        try {
            setError(null);
            setSyncing(true);
            const [c, e] = await Promise.all([scanner.candidates(s), scanner.executions()]);
            setCandidates(c.candidates);
            setExecutions(e.items);
            setBridge(e.bridge);
            const at = Date.now();
            setLoadedAt(at);
            AsyncStorage.setItem(`${SCAN_CACHE_KEY}:${s}`,
                JSON.stringify({ at, candidates: c.candidates, executions: e.items, bridge: e.bridge })).catch(() => { });
        } catch (err) {
            setError(errorText(err));
        } finally {
            setLoading(false);
            setRefreshing(false);
            setSyncing(false);
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

    useEffect(() => { showCached(style); /* first paint only */ }, []);   // eslint-disable-line react-hooks/exhaustive-deps
    useFocusEffect(useCallback(() => { load(); }, [load]));

    const switchStyle = (s: ScanStyle) => {
        if (s === style) return;
        setStyle(s);
        setExpanded(null);
        setLoading(true);
        showCached(s).finally(() => load(s));
    };

    const pollRun = (runId: string) => {
        pollTimer.current = setTimeout(async () => {
            try {
                const run = await scanner.run(runId);
                if (run.status === 'running') return pollRun(runId);
                setScanRun(null);
                if (run.status === 'failed') {
                    toast.error('Scan failed', run.errors?.[0] || 'See backend logs');
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
            toast.error('Scan not started', errorText(err));
        }
    };

    const sendToPaper = (c: ScanCandidate) => {
        const target = c.targets?.[0];
        const go = async () => {
            try {
                setSending(c.id);
                const rec = await scanner.execute(c.id);
                if (rec.status === 'placed') {
                    toast.success('Paper order placed',
                        `${c.symbol} ${c.direction.toUpperCase()} x${rec.request.quantity} @ ${rupee(rec.request.entry)} (${rec.request.entry_type})` +
                        (rec.request.user_id !== userId ? ` · Note: placed in account "${rec.request.user_id}", not yours ("${userId}").` : ''));
                } else {
                    toast.error(`Order ${rec.status}`, rec.error || 'See the Paper tab');
                }
                load();
            } catch (err) {
                toast.error('Cannot send', errorText(err).replace(/^Cannot send: /, ''));
            } finally {
                setSending(null);
            }
        };
        confirmAction(
            'Send to paper trading?',
            `${c.direction === 'long' ? 'BUY' : 'SELL'} ${c.quantity ?? '?'} ${c.symbol}\n` +
            `Entry ≤ ${rupee(c.direction === 'long' ? c.entry_high : c.entry_low)} • SL ${rupee(c.stop)} • Target ${rupee(target)}` +
            (bridge && bridge.paper_user_id !== userId ? `\n\nAccount: "${bridge.paper_user_id}"` : ''),
            'Send', go,
        );
    };

    const execByCandidate = React.useMemo(() => {
        const m: Record<string, ScanExecution> = {};
        executions.forEach(e => { m[e.candidate_id] = e; });
        return m;
    }, [executions]);

    // --- pieces -----------------------------------------------------------------
    const [switching, setSwitching] = useState(false);
    const toggleAuto = (on: boolean) => {
        const apply = async () => {
            try {
                setSwitching(true);
                setBridge(await scanner.setAutoTrading(on));
            } catch (err) {
                toast.error('Could not change auto paper-trading', errorText(err));
            } finally {
                setSwitching(false);
            }
        };
        if (on) {
            confirmAction(
                'Turn on auto paper-trading?',
                `The scanner will place paper orders automatically ` +
                `${bridge?.trigger === 'entry_confirmed' ? 'when an entry is confirmed' : 'when a setup qualifies'}` +
                `, in account "${bridge?.paper_user_id}". At most one order per stock, within the daily cap.`,
                'Turn on', apply,
            );
        } else {
            apply();
        }
    };

    /** Auto paper-trading on/off, with why it can't be on when the server forbids it. */
    const renderBridgeBanner = () => {
        if (!bridge) return null;
        const allowed = bridge.allowed ?? bridge.master_switch;
        const on = (bridge.auto_switch ?? true) && allowed;
        const otherAccount = bridge.paper_user_id !== userId;
        const notes: string[] = [];
        if (!allowed) notes.push('Disabled on the server (SCANNER_AUTO_TRADE_ENABLED / execution.mode). Send to Paper still works.');
        if (otherAccount) notes.push(`Orders go to account "${bridge.paper_user_id}"; you are "${userId}".`);
        if (!bridge.outbound_key_set) notes.push('Backend has no PAPER_TRADING_SERVICE_API_KEY.');
        return (
            <View className={`mx-6 mb-4 px-4 py-3 rounded-2xl border ${on ? 'bg-success/10 border-success/20' : 'bg-surface border-border/40'}`}>
                <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                        <Text className="text-text-primary text-[12px] font-black">Auto paper-trading</Text>
                        <Text className="text-text-muted text-[11px] font-bold mt-0.5">
                            {on
                                ? `On · sends on ${bridge.trigger === 'entry_confirmed' ? 'entry confirmation' : 'qualification'}`
                                : 'Off · send setups by hand with Send to Paper'}
                        </Text>
                    </View>
                    {switching ? <ActivityIndicator color="#00E0A1" size="small" /> : (
                        <Switch
                            value={on}
                            disabled={!allowed}
                            onValueChange={toggleAuto}
                            trackColor={{ false: '#334155', true: '#10B98199' }}
                            thumbColor={on ? '#10B981' : '#94A3B8'}
                        />
                    )}
                </View>
                {notes.map(n => (
                    <View key={n} className="flex-row items-start mt-2">
                        <AlertTriangle size={11} color="#F59E0B" style={{ marginTop: 2 }} />
                        <Text className="text-text-muted text-[11px] ml-1 flex-1 leading-4">{n}</Text>
                    </View>
                ))}
            </View>
        );
    };

    /**
     * One strategy's detail under an expanded row. The row already shows the
     * stock, READY/WAITING, score and the best strategy's levels, so this adds
     * only what is new: strategy and state, entry band, LTP, quantity, net R:R,
     * reason, warnings, paper status, actions. Stop/target appear only when
     * this strategy's differ from the row's.
     */
    const renderCandidate = (c: ScanCandidate, best: ScanCandidate, multi: boolean) => {
        const long = c.direction === 'long';
        const exec = execByCandidate[c.id];
        // Only a placed order blocks a send; a cancelled one can go again.
        const holding = holdingOf(bridge, c.symbol, c.direction);
        const canSend = (!exec || exec.status !== 'placed') && !holding;
        const swingShort = c.style === 'swing' && !long;
        const ownLevels = c.stop !== best.stop || c.targets?.[0] !== best.targets?.[0];
        return (
            <View key={c.id} className="bg-surface/60 rounded-2xl border border-border/40 mb-2 px-4 py-3">
                <View className="flex-row items-center justify-between">
                    <Text className="text-text-primary text-[11px] font-black flex-1">
                        {c.strategy}
                        <Text className="text-text-muted font-bold"> · {c.setup_state}{multi ? ` · ${Math.round(c.score)}` : ''}</Text>
                    </Text>
                    {renderExecBadge(exec)}
                </View>

                <Text className="text-text-muted text-[11px] font-bold mt-2">
                    Entry band <Text className="text-text-primary">{inr(c.entry_low)} – {inr(c.entry_high)}</Text>
                    {'  ·  '}LTP {inr(c.reference_price)}
                    {c.change_pct != null ? ` (${c.change_pct >= 0 ? '+' : ''}${c.change_pct.toFixed(2)}%)` : ''}
                </Text>
                {ownLevels && (
                    <Text className="text-text-muted text-[11px] font-bold mt-1">
                        SL <Text className="text-error">{inr(c.stop)}</Text> · TGT <Text className="text-success">{inr(c.targets?.[0])}</Text>
                    </Text>
                )}
                <Text className="text-text-muted text-[11px] font-bold mt-1">
                    Qty {c.quantity ?? '---'}  ·  Net R:R {c.reward_risk_net?.toFixed(2) ?? '---'}
                </Text>

                {!!c.status_reason && c.status_reason !== 'All gates passed' && (
                    <Text className="text-text-muted text-[11px] italic mt-2">{c.status_reason}</Text>
                )}
                {c.flags.map(f => (
                    <View key={f.code} className="flex-row items-start mt-1.5">
                        <AlertTriangle size={11} color={f.severity === 'block' ? '#EF4444' : '#F59E0B'} style={{ marginTop: 2 }} />
                        <Text className="text-text-muted text-[11px] ml-1 flex-1">{f.message}</Text>
                    </View>
                ))}
                {exec?.error && (
                    <Text className="text-[11px] font-bold mt-2" style={{ color: execStyle(exec).color }}>Paper: {exec.error}</Text>
                )}
                <Text className="text-text-muted text-[11px] mt-2">
                    Updated {timeAgo(c.updated_at)}{c.expires_at ? ` • expires ${istClock(serverDate(c.expires_at))}` : ''}
                    {c.entry_confirmed_at ? ' • entry confirmed' : ''}
                </Text>

                <View className="flex-row mt-3 gap-3">
                    <TouchableOpacity
                        onPress={() => navigation.navigate('StockDetail', { symbol: c.symbol })}
                        className="flex-1 py-3 rounded-2xl items-center border border-border bg-background"
                    >
                        <Text className="text-text-primary font-black text-xs uppercase">Chart</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        disabled={!canSend || swingShort || sending === c.id}
                        onPress={() => sendToPaper(c)}
                        className={`flex-[2] py-3 rounded-2xl items-center flex-row justify-center ${canSend && !swingShort ? 'bg-primary' : 'bg-primary/30'}`}
                    >
                        {sending === c.id ? <ActivityIndicator color="white" size="small" /> : <Send size={14} color="white" />}
                        <Text className="text-white font-black text-xs uppercase ml-2">
                            {swingShort ? 'Swing shorts not tradable'
                                : holding ? (holding.same ? 'Already holding' : `Holding ${holding.side}`)
                                : canSend ? 'Send to Paper' : 'Already sent'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const toggleRow = useCallback((key: string) => setExpanded(prev => (prev === key ? null : key)), []);

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
                            <Text className="text-text-muted text-[11px] font-bold">
                                {e.strategy} • {e.style} • {e.trigger}{e.attempts > 1 ? ` • ${e.attempts} attempts` : ''}
                            </Text>
                        </View>
                    </View>
                    <View className="items-end">
                        <Text className="text-[11px] font-black uppercase" style={{ color: s.color }}>{s.label}</Text>
                        <Text className="text-text-muted text-[11px]">{timeAgo(e.updated_at)}</Text>
                    </View>
                </View>
                <Text className="text-text-muted text-[11px] mt-2">
                    {e.request?.entry_type?.toUpperCase()} {rupee(e.request?.entry)} • SL {rupee(e.request?.stop_loss)} • TGT {rupee(e.request?.target)}
                    {e.order_status ? ` • order ${e.order_status}` : ''}{e.fill_price ? ` @ ${rupee(e.fill_price)}` : ''}
                </Text>
                {!!e.error && <Text className="text-error text-[11px] font-bold mt-1">{e.error}</Text>}
            </View>
        );
    };

    const groups = React.useMemo(() => {
        const rank = (c: ScanCandidate) => (c.status === 'qualified' ? 1000 : 0) + c.score;
        const m: Record<string, StockGroup> = {};
        candidates.forEach(c => {
            const key = `${c.symbol}|${c.direction}`;
            const g = m[key] || (m[key] = { key, best: c, all: [] });
            g.all.push(c);
            if (rank(c) > rank(g.best)) g.best = c;
        });
        Object.values(m).forEach(g => g.all.sort((a, b) => rank(b) - rank(a)));
        return Object.values(m).sort((a, b) => rank(b.best) - rank(a.best));
    }, [candidates]);
    // A stock with a placed paper order (pending or filled) leaves Ideas and
    // shows under Paper instead, like the web watchlist.
    const ideaGroups = groups.filter(g => !g.all.some(x => execByCandidate[x.id]?.status === 'placed'));
    const sideGroups = ideaGroups.filter(g => g.best.direction === side);
    // Stable per bridge refresh, so the memoized rows don't re-render on every pass.
    const holdingByKey = React.useMemo(() => {
        const m: Record<string, Holding> = {};
        groups.forEach(g => { m[g.key] = holdingOf(bridge, g.best.symbol, g.best.direction); });
        return m;
    }, [groups, bridge]);
    const shown = sideGroups.filter(g =>
        signal === 'ALL' || (signal === 'READY') === (g.best.status === 'qualified'));
    const count = (d: Side) => ideaGroups.filter(g => g.best.direction === d).length;
    const readyCount = sideGroups.filter(g => g.best.status === 'qualified').length;

    // Virtualized list: the swing universe can yield hundreds of rows.
    const renderOpportunity = ({ item: g }: { item: StockGroup }) => {
        const open = expanded === g.key;
        return (
            <ScanRow g={g} open={open} exec={g.all.map(x => execByCandidate[x.id]).find(Boolean)}
                holding={holdingByKey[g.key]} onToggle={toggleRow}>
                {open ? g.all.map(c => renderCandidate(c, g.best, g.all.length > 1)) : null}
            </ScanRow>
        );
    };
    const renderListItem = ({ item }: { item: any }) =>
        view === 'OPPORTUNITIES' ? renderOpportunity({ item }) : renderExecution(item);
    const listKey = (item: any) => (view === 'OPPORTUNITIES' ? item.key : item.candidate_id);

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />

            <ScreenHeader
                title="Scanner"
                subtitle={`${style === 'intraday' ? 'Intraday' : 'Swing'} setups${marketOpen == null ? '' : marketOpen ? ' · Market open' : ' · Market closed'}`}
                right={<>
                    <IconButton label="Refresh results" onPress={() => { setRefreshing(true); load(); }}>
                        <RefreshCw size={18} color={colors.primary} />
                    </IconButton>
                    <IconButton label={scanRun ? 'Scan running' : 'Run a new scan'} tone="primary" disabled={!!scanRun} onPress={runScan}>
                        {scanRun ? <ActivityIndicator color={colors.background} size="small" /> : <Radar size={18} color={colors.background} />}
                    </IconButton>
                </>}
            />

            {scanRun && (
                <Text className="text-primary text-[11px] font-bold px-6 mb-3">
                    Scanning {universes[style]} ({style})… results refresh when it finishes.
                </Text>
            )}

            <View className="px-5 mb-3 flex-row gap-2">
                <View className="flex-1">
                    <Segmented options={['intraday', 'swing'] as const} value={style} onChange={switchStyle}
                        labels={{ intraday: 'Intraday', swing: 'Swing' }} />
                </View>
                <View className="flex-1">
                    <Segmented options={['OPPORTUNITIES', 'ORDERS'] as const} value={view} onChange={setView}
                        labels={{ OPPORTUNITIES: 'Ideas', ORDERS: 'Paper' }} />
                </View>
            </View>

            {renderBridgeBanner()}

            {loading ? (
                <View className="px-5 pt-1">
                    <Skeleton h={40} r={16} style={{ marginBottom: 12 }} />
                    {[0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} />)}
                </View>
            ) : (
                <FlatList
                    className="flex-1"
                    data={(view === 'OPPORTUNITIES' ? shown : executions) as any[]}
                    keyExtractor={listKey}
                    renderItem={renderListItem}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#00E0A1" />}
                    ListHeaderComponent={<>
                        {!!loadedAt && (
                            <Text className="text-text-muted text-xs font-semibold mb-2">
                                {syncing ? `Showing results from ${ago(loadedAt)} · updating…` : `Updated ${ago(loadedAt)}`}
                            </Text>
                        )}
                        {error && (
                            <View className="p-4 rounded-2xl bg-error/10 border border-error/20 mb-4">
                                <Text className="text-error text-xs font-bold">{error}</Text>
                            </View>
                        )}

                        {view === 'OPPORTUNITIES' ? (
                            <>
                                <View className="flex-row mb-3">
                                    {(['long', 'short'] as Side[]).map(d => (
                                        <TouchableOpacity key={d} onPress={() => { setSide(d); setExpanded(null); }}
                                            className={`flex-1 py-2.5 rounded-2xl items-center ${d === 'long' ? 'mr-1' : 'ml-1'} ${side === d
                                                ? (d === 'long' ? 'bg-success/20 border border-success/40' : 'bg-error/20 border border-error/40')
                                                : 'bg-surface border border-transparent'}`}>
                                            <Text className={`font-black uppercase text-xs ${side === d ? (d === 'long' ? 'text-success' : 'text-error') : 'text-text-muted'}`}>
                                                {d === 'long' ? 'Bullish' : 'Bearish'} ({count(d)})
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <View className="flex-row items-center mb-3">
                                    {(['ALL', 'READY', 'WAITING'] as SignalFilter[]).map(f => (
                                        <TouchableOpacity key={f} onPress={() => setSignal(f)}
                                            className={`px-3 py-1.5 rounded-full mr-2 ${signal === f ? 'bg-primary' : 'bg-surface border border-border/40'}`}>
                                            <Text className={`text-[11px] font-black uppercase ${signal === f ? 'text-white' : 'text-text-muted'}`}>
                                                {f === 'ALL' ? 'All' : f === 'READY' ? `Ready ${readyCount}` : `Waiting ${sideGroups.length - readyCount}`}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                {!error && shown.length === 0 && (
                                    <Text className="text-text-muted text-center mt-12 font-bold leading-5">
                                        No {signal === 'ALL' ? '' : signal.toLowerCase() + ' '}{side === 'long' ? 'bullish' : 'bearish'} {style} setups right now.{'\n'}
                                        {style === 'intraday'
                                            ? 'Intraday scans run every 15 min, 09:35–14:45 IST. Outside market hours, try Swing.'
                                            : 'Swing setups come from the daily 15:45 IST scan. Tap the radar to scan now.'}
                                    </Text>
                                )}
                            </>
                        ) : (
                            <>
                                {!error && executions.length === 0 && (
                                    <Text className="text-text-muted text-center mt-16 font-bold">No scanner orders yet.</Text>
                                )}
                            </>
                        )}
                    </>}
                    ListFooterComponent={<View className="h-24" />}
                />
            )}
        </View>
    );
};

export default ScannerScreen;
