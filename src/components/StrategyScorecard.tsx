import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronDown, ChevronUp, History, Info } from '../icons';
import {
    getScorecard, PaperCell, RecentForm, Scorecard, ScoreAction, ScoreRecommendation, ScoreVerdict, SimCell,
} from '../api';
import { colors, signColor } from '../theme';
import { inr, pct } from '../format';
import { ErrorState, EmptyState, Skeleton } from '../ui';
import { haptic } from '../haptics';

/**
 * Performance screen "Strategy scorecard": which scanner strategies make money,
 * from every setup replayed on later bars (simulated, in R) and from what the
 * paper account actually earned (₹). Recommendations are shadow-mode only.
 */

type Period = '30' | '90' | 'all';
const PERIODS: { key: Period; label: string; days?: number }[] = [
    { key: '30', label: '30d', days: 30 },
    { key: '90', label: '90d', days: 90 },
    { key: 'all', label: 'All' },
];

const VERDICT: Record<ScoreVerdict, { label: string; color: string }> = {
    making_money: { label: 'Making money', color: colors.success },
    losing_money: { label: 'Losing money', color: colors.error },
    unclear: { label: 'Unclear', color: colors.blue },
    not_enough: { label: 'Too few trades', color: colors.textMuted },
};
const ACTION: Record<ScoreAction, { label: string; color: string }> = {
    would_disable_auto: { label: 'Would disable for auto', color: colors.error },
    watch: { label: 'Watch', color: colors.warning },
    keep: { label: 'Keep', color: colors.success },
    keep_collecting: { label: 'Keep collecting', color: colors.textMuted },
};
const TREND_ARROW: Record<string, string> = { improving: '↑', worsening: '↓', steady: '→' };
/** Best scores first; "?" = setups without a score. */
const BUCKET_ORDER = ['85+', '75-85', '65-75', '<65', '?'];

const fmtR = (v?: number | null) =>
    v == null || !isFinite(v) ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`;
const fmtRate = (r?: number | null) => (r == null || !isFinite(r) ? '—' : `${Math.round(r * 100)}%`);
const verdictOf = (v?: string | null) => VERDICT[v as ScoreVerdict] ?? VERDICT.not_enough;
const actionOf = (a?: string | null) => ACTION[a as ScoreAction] ?? ACTION.keep_collecting;

const Pill = ({ text, color }: { text: string; color: string }) => (
    <View className="px-2 py-0.5 rounded-full border" style={{ borderColor: `${color}55`, backgroundColor: `${color}14` }}>
        <Text className="text-[10px] font-black uppercase" style={{ color }} numberOfLines={1}>{text}</Text>
    </View>
);

const SubTitle = ({ children, right }: { children: React.ReactNode; right?: string }) => (
    <View className="flex-row items-end justify-between mb-3">
        <Text className="text-text-muted text-[11px] font-black uppercase tracking-widest">{children}</Text>
        {!!right && <Text className="text-text-muted text-[11px] font-bold">{right}</Text>}
    </View>
);

const Container = ({ children }: { children: React.ReactNode }) => (
    <View className="bg-surface rounded-[32px] border border-border p-5 mb-6">{children}</View>
);

function simLine(sim?: SimCell): string {
    if (!sim || !sim.trades) return 'No simulated trades';
    return `${sim.trades} trades · win ${fmtRate(sim.win_rate)} · ${fmtR(sim.expectancy_r)}/trade`;
}

function paperLine(pap: PaperCell | undefined, paperOk: boolean): string {
    if (!paperOk) return 'Paper results unavailable';
    if (!pap || !pap.trades) return 'No paper trades';
    return `${inr(pap.total_net, { sign: true, decimals: 0 })} over ${pap.trades} trade${pap.trades === 1 ? '' : 's'}`;
}

function StrategyCard({ name, rec, sim, form, pap, paperOk, expanded, onToggle }: {
    name: string; rec?: ScoreRecommendation; sim?: SimCell; form?: RecentForm; pap?: PaperCell; paperOk: boolean;
    expanded: boolean; onToggle: () => void;
}) {
    const v = verdictOf(sim?.verdict);
    const extraReasons = (rec?.reasons || []).slice(1);
    const Chevron = expanded ? ChevronUp : ChevronDown;
    return (
        <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }}
            accessibilityLabel={`${name}, ${v.label}. ${expanded ? 'Hide' : 'Show'} details`}
            className="bg-background rounded-3xl border border-border p-4 mb-3 active:opacity-80">
            <View className="flex-row items-center justify-between">
                <Text className="text-text-primary font-black text-[15px] flex-1 mr-2" numberOfLines={1}>{name}</Text>
                <Pill text={v.label} color={v.color} />
                <Chevron size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
            </View>

            <View className="mt-2">
                <Text className="text-text-secondary text-xs font-semibold" numberOfLines={1}>
                    <Text className="text-text-muted">Simulated </Text>{simLine(sim)}
                </Text>
                {form && form.recent_n > 0 && (
                    <Text className="text-xs font-semibold mt-1" numberOfLines={1}>
                        <Text className="text-text-muted">Recent form </Text>
                        <Text style={{ color: signColor(form.recent_expectancy_r) }}>
                            last {form.recent_n}: {fmtR(form.recent_expectancy_r)}
                            {form.trend ? ` ${TREND_ARROW[form.trend] ?? ''}` : ''}
                        </Text>
                    </Text>
                )}
                <Text className="text-xs font-semibold mt-1" numberOfLines={1}>
                    <Text className="text-text-muted">Paper </Text>
                    <Text style={{ color: pap?.trades ? signColor(pap.total_net) : colors.textMuted }}>{paperLine(pap, paperOk)}</Text>
                </Text>
            </View>

            {expanded && (
                <View className="mt-3 pt-3 border-t border-border">
                    {sim?.ci_r ? (
                        <Text className="text-text-secondary text-xs">
                            90% range: {fmtR(sim.ci_r[0])} to {fmtR(sim.ci_r[1])} per trade
                        </Text>
                    ) : (
                        <Text className="text-text-muted text-xs">{sim?.note || 'No 90% range yet - too few trades.'}</Text>
                    )}
                    {!!pap?.trades && (
                        <Text className="text-text-secondary text-xs mt-1">
                            Paper: win {fmtRate(pap.win_rate)} · avg {pct(pap.avg_return_pct, 2)} per trade · {verdictOf(pap.verdict).label.toLowerCase()}
                        </Text>
                    )}
                    {extraReasons.map((r, i) => (
                        <Text key={i} className="text-text-muted text-xs mt-1">• {r}</Text>
                    ))}
                </View>
            )}
        </Pressable>
    );
}

function LoadingSkeleton() {
    return (
        <Container>
            <Skeleton w="40%" h={12} />
            {[0, 1, 2].map(i => (
                <View key={i} className="flex-row items-center mt-4">
                    <Skeleton w={96} h={18} r={9} />
                    <Skeleton w="50%" h={12} style={{ marginLeft: 10 }} />
                </View>
            ))}
            <Skeleton h={88} r={24} style={{ marginTop: 20 }} />
            <Skeleton h={88} r={24} style={{ marginTop: 12 }} />
        </Container>
    );
}

export default function StrategyScorecard({ refreshKey = 0 }: { refreshKey?: number }) {
    const [period, setPeriod] = useState<Period>('30');
    const [result, setResult] = useState<{ period: Period; data: Scorecard } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const reqId = useRef(0);

    const load = useCallback(async () => {
        const id = ++reqId.current;
        setLoading(true);
        setError(null);
        try {
            const data = await getScorecard(PERIODS.find(p => p.key === period)?.days);
            if (id === reqId.current) setResult({ period, data });
        } catch (e: any) {
            if (id === reqId.current) setError(e?.message || 'Request failed');
        } finally {
            if (id === reqId.current) setLoading(false);
        }
        // refreshKey: the screen's refresh button reloads this section too.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period, refreshKey]);

    // Refetches on focus, on a period change and when the screen asks for a refresh.
    useFocusEffect(useCallback(() => { load(); }, [load]));

    // Data for another period would be misleading under the new chip.
    const data = result && result.period === period ? result.data : null;

    const header = (
        <View className="mb-3">
            <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 mr-2">
                    <Text accessibilityRole="header" className="text-text-primary font-black text-lg" numberOfLines={1}>Strategy scorecard</Text>
                    {(data?.shadow_mode ?? true) && <View className="ml-2"><Pill text="Shadow mode" color={colors.warning} /></View>}
                </View>
                {loading && data && <Text className="text-text-muted text-[11px] font-bold">Updating…</Text>}
            </View>
            <View className="flex-row mt-3" accessibilityRole="tablist">
                {PERIODS.map(p => {
                    const on = p.key === period;
                    return (
                        <Pressable key={p.key} accessibilityRole="tab" accessibilityState={{ selected: on }}
                            accessibilityLabel={p.days ? `Last ${p.days} days` : 'All history'}
                            onPress={() => { if (!on) { haptic.select(); setPeriod(p.key); } }}
                            hitSlop={4}
                            className={`px-4 py-1.5 rounded-full border mr-2 ${on ? 'bg-primary/10 border-primary/40' : 'bg-surface border-border'}`}>
                            <Text className={`text-xs font-bold ${on ? 'text-primary' : 'text-text-muted'}`}>{p.label}</Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );

    if (!data) {
        return (
            <View>
                {header}
                {error && !loading ? (
                    <Container><ErrorState title="Couldn't load the scorecard" body={error} onRetry={load} /></Container>
                ) : (
                    <LoadingSkeleton />
                )}
            </View>
        );
    }

    const simBy = data.simulated?.by?.strategy || {};
    const paperBy = data.paper?.by?.strategy || {};
    const form = data.recent_form || {};
    const recs = data.recommendations || [];
    const paperOk = data.paper?.status?.ok !== false;
    const recByName = Object.fromEntries(recs.map(r => [r.strategy, r]));
    // Recommendation order first (worst first), then anything else the backend scored.
    const names = [...new Set([...recs.map(r => r.strategy), ...Object.keys(simBy), ...Object.keys(form), ...Object.keys(paperBy)])];
    const minTrades = data.thresholds?.min_trades ?? 20;

    if (names.length === 0 && !data.simulated?.overall?.trades) {
        return (
            <View>
                {header}
                <Container>
                    <EmptyState icon={<History size={24} color={colors.textMuted} />}
                        title="No replayed setups yet"
                        body={`The replay runs daily at 16:20 IST.${period !== 'all' ? ' Try "All" for older setups.' : ''}`} />
                </Container>
            </View>
        );
    }

    const buckets = data.simulated?.by?.score_bucket || {};
    const bucketKeys = Object.keys(buckets).sort((a, b) => {
        const ia = BUCKET_ORDER.indexOf(a), ib = BUCKET_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const gap = data.execution_gap;

    return (
        <View>
            {header}
            {error && !loading && (
                <Pressable onPress={load} accessibilityRole="button" className="mb-3">
                    <Text className="text-error text-xs font-bold">Refresh failed ({error}). Tap to retry.</Text>
                </Pressable>
            )}

            {recs.length > 0 && (
                <Container>
                    <SubTitle>Recommendations</SubTitle>
                    {recs.map((r, i) => {
                        const a = actionOf(r.action);
                        return (
                            <View key={r.strategy} className={`${i ? 'mt-3 pt-3 border-t border-border' : ''}`}>
                                <View className="flex-row items-center justify-between">
                                    <Text className="text-text-primary font-bold text-[13px] flex-1 mr-2" numberOfLines={1}>{r.strategy}</Text>
                                    <Pill text={a.label} color={a.color} />
                                </View>
                                {!!r.reasons?.[0] && (
                                    <Text className="text-text-muted text-xs mt-1 leading-4" numberOfLines={2}>{r.reasons[0]}</Text>
                                )}
                            </View>
                        );
                    })}
                </Container>
            )}

            {names.length > 0 && (
                <Container>
                    <SubTitle right="Tap for details">By strategy</SubTitle>
                    {names.map(n => (
                        <StrategyCard key={n} name={n} rec={recByName[n]} sim={simBy[n]} form={form[n]} pap={paperBy[n]}
                            paperOk={paperOk} expanded={!!expanded[n]}
                            onToggle={() => setExpanded(e => ({ ...e, [n]: !e[n] }))} />
                    ))}
                    {!paperOk && !!data.paper?.status?.detail && (
                        <Text className="text-text-muted text-[11px] mt-1">{data.paper.status.detail}</Text>
                    )}
                </Container>
            )}

            {bucketKeys.length > 0 && (
                <Container>
                    <SubTitle>Is the score predictive?</SubTitle>
                    <Text className="text-text-muted text-xs mb-3">If it is, higher scores should earn more per trade.</Text>
                    <View className="flex-row pb-2 border-b border-border">
                        <Text className="text-text-muted text-[11px] font-bold uppercase w-16">Score</Text>
                        <Text className="text-text-muted text-[11px] font-bold uppercase w-14 text-right">Trades</Text>
                        <Text className="text-text-muted text-[11px] font-bold uppercase w-20 text-right">Avg R</Text>
                        <Text className="text-text-muted text-[11px] font-bold uppercase flex-1 text-right">Verdict</Text>
                    </View>
                    {bucketKeys.map(k => {
                        const c = buckets[k];
                        const v = verdictOf(c?.verdict);
                        return (
                            <View key={k} className="flex-row items-center py-2 border-b border-border">
                                <Text className="text-text-primary text-[13px] font-bold w-16">{k === '?' ? 'No score' : k}</Text>
                                <Text className="text-text-secondary text-[13px] font-semibold w-14 text-right">{c?.trades ?? 0}</Text>
                                <Text className="text-[13px] font-bold w-20 text-right" style={{ color: signColor(c?.expectancy_r) }}>{fmtR(c?.expectancy_r)}</Text>
                                <Text className="text-[11px] font-bold flex-1 text-right" style={{ color: v.color }} numberOfLines={1}>{v.label}</Text>
                            </View>
                        );
                    })}
                </Container>
            )}

            <View className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex-row items-start mb-6">
                <Info size={16} color={colors.primary} style={{ marginTop: 1 }} />
                <View className="flex-1 ml-3">
                    <Text className="text-text-muted text-[11px] font-bold leading-4">
                        Simulated = every scanner setup replayed on the bars after its signal, costs included, in R (multiples of the planned risk).
                        Paper = what the paper account actually earned, in ₹ after charges.
                    </Text>
                    <Text className="text-text-muted text-[11px] font-bold leading-4 mt-1.5">
                        A verdict needs {minTrades}+ trades; the 90% range shows how sure it is.
                    </Text>
                    {gap?.pairs > 0 && gap.avg_gap_pct != null && (
                        <Text className="text-text-muted text-[11px] font-bold leading-4 mt-1.5">
                            Paper vs simulated: {pct(gap.avg_gap_pct, 2)} per trade over {gap.pairs} matched trade{gap.pairs === 1 ? '' : 's'}.
                        </Text>
                    )}
                    <Text className="text-text-secondary text-[11px] font-black leading-4 mt-1.5">
                        Recommendations only — nothing is switched off.
                    </Text>
                </View>
            </View>
        </View>
    );
}
