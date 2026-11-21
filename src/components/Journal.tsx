import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BookOpen, Sparkles } from '../icons';
import { getJournal, Journal as JournalData, JournalTagStat, summariseJournal } from '../api';
import { serverDate } from '../auth';
import { colors, signColor } from '../theme';
import { inr, istWhen } from '../format';
import { ErrorState, EmptyState, Skeleton } from '../ui';
import { haptic } from '../haptics';
import { toast } from './Toast';
import { Chips, Container, Footnote, fmtRate, humanize, Pill, RefreshFailed, SectionHeader, SubTitle } from './evidenceUi';

/**
 * Performance screen "Journal" tab: closed paper trades tagged by why they won
 * or lost, the tags that stand out, and a weekly AI (or rules) summary.
 */

type Days = '7' | '30' | '90';
const DAYS: { key: Days; label: string }[] = [
    { key: '7', label: '7d' },
    { key: '30', label: '30d' },
    { key: '90', label: '90d' },
];
const TRADE_PAGE = 20;

const fmtPP = (v?: number | null) =>
    v == null || !isFinite(v) ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(0)} pp`;
const tagText = (v: unknown) => (v == null ? '—' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : humanize(String(v)));

function HighlightRow({ h, first }: { h: JournalTagStat; first: boolean }) {
    return (
        <View className={`flex-row items-center py-2 ${first ? '' : 'border-t border-border'}`}>
            <View className="flex-1 mr-2">
                <Text className="text-text-primary text-[13px] font-bold" numberOfLines={1}>
                    {humanize(h.tag)} = {tagText(h.value)}
                </Text>
                <Text className="text-text-muted text-[11px] font-semibold mt-0.5" numberOfLines={1}>
                    {h.trades ?? 0} trade{h.trades === 1 ? '' : 's'} · win {fmtRate(h.win_rate)}
                    {h.total_net != null ? ` · ${inr(h.total_net, { sign: true, decimals: 0 })}` : ''}
                </Text>
            </View>
            <Text className="text-[13px] font-black" style={{ color: signColor(h.vs_overall_pp) }}>{fmtPP(h.vs_overall_pp)}</Text>
        </View>
    );
}

function LoadingSkeleton() {
    return (
        <>
            <Container>
                <Skeleton w="35%" h={12} />
                <Skeleton h={12} style={{ marginTop: 14 }} />
                <Skeleton w="80%" h={12} style={{ marginTop: 8 }} />
                <Skeleton w="60%" h={12} style={{ marginTop: 8 }} />
            </Container>
            <Container>
                {[0, 1, 2, 3].map(i => (
                    <View key={i} className={i ? 'mt-4' : ''}>
                        <Skeleton w="50%" h={14} />
                        <Skeleton w="70%" h={10} style={{ marginTop: 8 }} />
                    </View>
                ))}
            </Container>
        </>
    );
}

export default function Journal({ refreshKey = 0 }: { refreshKey?: number }) {
    const [days, setDays] = useState<Days>('30');
    const [result, setResult] = useState<{ days: Days; data: JournalData } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [summarising, setSummarising] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const reqId = useRef(0);

    const load = useCallback(async () => {
        const id = ++reqId.current;
        setLoading(true);
        setError(null);
        try {
            const data = await getJournal(Number(days));
            if (id === reqId.current) setResult({ days, data });
        } catch (e: any) {
            if (id === reqId.current) setError(e?.message || 'Request failed');
        } finally {
            if (id === reqId.current) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days, refreshKey]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const summarise = async () => {
        if (summarising) return;
        haptic.light();
        setSummarising(true);
        try {
            const summary = await summariseJournal();
            setResult(r => (r ? { ...r, data: { ...r.data, summary: summary ?? r.data.summary } } : r));
            haptic.success();
            toast.success('Summary updated', summary?.source === 'ai' ? 'Written by AI from the last 7 days.' : 'Built from the rules.');
        } catch (e: any) {
            haptic.error();
            toast.error("Couldn't summarise", e?.message || 'Request failed');
        } finally {
            setSummarising(false);
        }
    };

    const data = result && result.days === days ? result.data : null;
    const header = (
        <View className="mb-3">
            <SectionHeader title="Trade journal" shadow={false} updating={loading && !!data} />
            <View className="mt-3">
                <Chips options={DAYS} value={days} onChange={d => { setDays(d); setShowAll(false); }} a11y={o => `Last ${o.key} days`} />
            </View>
        </View>
    );

    if (!data) {
        return (
            <View>
                {header}
                {error && !loading
                    ? <Container><ErrorState title="Couldn't load the journal" body={error} onRetry={load} /></Container>
                    : <LoadingSkeleton />}
            </View>
        );
    }

    const trades = Array.isArray(data.trades) ? data.trades : [];
    const p = data.patterns;
    const highlights = (p?.highlights || []).filter(h => h && typeof h === 'object');
    const summary = data.summary;
    const summaryAt = serverDate(summary?.at);
    const isAi = summary?.source === 'ai';
    const shown = showAll ? trades : trades.slice(0, TRADE_PAGE);

    return (
        <View>
            {header}
            {error && !loading && <RefreshFailed error={error} onRetry={load} />}

            <Container>
                <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-text-muted text-[11px] font-black uppercase tracking-widest">Weekly summary</Text>
                    {summary && <Pill text={isAi ? 'AI' : 'Rules'} color={isAi ? colors.primary : colors.blue} />}
                </View>
                {summary ? (
                    <>
                        <Text className="text-text-muted text-[11px] font-semibold mb-2">
                            Last {summary.days ?? 7} days · {summary.trades ?? 0} trade{summary.trades === 1 ? '' : 's'}
                            {summaryAt ? ` · ${istWhen(summaryAt)}` : ''}
                        </Text>
                        {(summary.lines || []).map((l, i) => (
                            <Text key={i} className="text-text-secondary text-[13px] leading-5 mt-1">• {l}</Text>
                        ))}
                        {(summary.lines || []).length === 0 && <Text className="text-text-muted text-xs">Nothing to summarise.</Text>}
                        {!isAi && !!summary.fallback_reason && (
                            <Text className="text-text-muted text-[11px] mt-2">AI unavailable ({summary.fallback_reason}); rules used instead.</Text>
                        )}
                    </>
                ) : (
                    <Text className="text-text-muted text-xs leading-4">No summary yet. One is written every week, or make one now.</Text>
                )}
                <Pressable onPress={summarise} disabled={summarising} accessibilityRole="button"
                    accessibilityLabel="Summarise last 7 days" accessibilityState={{ busy: summarising, disabled: summarising }}
                    className="mt-4 flex-row items-center justify-center py-2.5 rounded-full bg-primary/10 border border-primary/30 active:opacity-70"
                    style={{ opacity: summarising ? 0.6 : 1 }}>
                    {summarising
                        ? <ActivityIndicator size="small" color={colors.primary} />
                        : <Sparkles size={14} color={colors.primary} />}
                    <Text className="text-primary font-bold text-[13px] ml-2">{summarising ? 'Summarising…' : 'Summarise last 7 days'}</Text>
                </Pressable>
            </Container>

            {trades.length === 0 ? (
                <Container>
                    <EmptyState icon={<BookOpen size={24} color={colors.textMuted} />} title="No closed trades"
                        body={`No paper trades closed in the last ${days} days.${days !== '90' ? ' Try 90d.' : ''}`} />
                </Container>
            ) : (
                <>
                    <Container>
                        <SubTitle right={p?.trades ? `${p.trades} trades · win ${fmtRate(p.win_rate)}` : undefined}>What stands out</SubTitle>
                        {p?.total_net != null && (
                            <Text className="text-xs font-semibold mb-2">
                                <Text className="text-text-muted">Net </Text>
                                <Text style={{ color: signColor(p.total_net) }}>{inr(p.total_net, { sign: true, decimals: 0 })}</Text>
                            </Text>
                        )}
                        {highlights.length > 0
                            ? highlights.map((h, i) => <HighlightRow key={`${h.tag}-${h.value}-${i}`} h={h} first={i === 0} />)
                            : <Text className="text-text-muted text-xs leading-4">No tag differs much from the overall win rate yet.</Text>}
                        <Text className="text-text-muted text-[11px] mt-3 leading-4">pp = percentage points of win rate vs all trades in this period.</Text>
                    </Container>

                    <Container>
                        <SubTitle right={`${trades.length}`}>Closed trades</SubTitle>
                        {shown.map((t, i) => {
                            const when = serverDate(t.closed_at);
                            const tags = Object.entries(t.tags || {}).filter(([k, v]) => k !== 'result' && v != null && v !== '');
                            return (
                                <View key={`${t.symbol}-${t.closed_at}-${i}`} className={`py-2.5 ${i ? 'border-t border-border' : ''}`}>
                                    <View className="flex-row items-center justify-between">
                                        <Text className="text-text-primary text-[13px] font-bold flex-1 mr-2" numberOfLines={1}>
                                            {t.symbol}
                                            <Text className="text-text-muted text-[11px] font-semibold">  {when ? istWhen(when) : '—'}</Text>
                                        </Text>
                                        <Text className="text-[13px] font-bold" style={{ color: signColor(t.net) }}>{inr(t.net, { sign: true, decimals: 0 })}</Text>
                                    </View>
                                    {(!!t.strategy || !!t.exit_reason) && (
                                        <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={1}>
                                            {[t.strategy, t.exit_reason ? `exit: ${humanize(t.exit_reason)}` : null].filter(Boolean).join(' · ')}
                                        </Text>
                                    )}
                                    {tags.length > 0 && (
                                        <View className="flex-row flex-wrap mt-1.5">
                                            {tags.map(([k, v]) => (
                                                <View key={k} className="px-2 py-0.5 rounded-md bg-background border border-border mr-1.5 mb-1.5">
                                                    <Text className="text-text-secondary text-[10px] font-semibold">
                                                        <Text className="text-text-muted">{humanize(k)} </Text>{tagText(v)}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                        {trades.length > TRADE_PAGE && (
                            <Pressable onPress={() => setShowAll(s => !s)} accessibilityRole="button" className="mt-2 py-2 items-center active:opacity-70">
                                <Text className="text-primary text-xs font-bold">
                                    {showAll ? 'Show fewer' : `Show ${trades.length - TRADE_PAGE} more`}
                                </Text>
                            </Pressable>
                        )}
                    </Container>
                </>
            )}

            <Footnote lines={[
                'Tags explain each closed paper trade (net of charges): setup, market, timing and how it exited.',
                'Highlights are tags whose win rate differs clearly from the overall rate.',
            ]} strong="Evidence only — the journal changes nothing." />
        </View>
    );
}
