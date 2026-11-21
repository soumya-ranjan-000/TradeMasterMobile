import React, { useCallback, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ShieldCheck, ShieldQuestion } from '../icons';
import { getRiskGuard, LimitState, RiskGuardStatus, RiskLimit, RiskLimitKey } from '../api';
import { serverDate } from '../auth';
import { colors, signColor } from '../theme';
import { inr, istWhen, pct } from '../format';
import { ErrorState, EmptyState, Skeleton } from '../ui';
import { Bar, Container, Footnote, humanize, Pill, RefreshFailed, SectionHeader, SubTitle } from './evidenceUi';

/**
 * Performance screen "Risk" tab: the portfolio risk guard. It checks every
 * order against daily-loss, open-risk, position and sector limits. In shadow
 * mode it only records what it WOULD have blocked; nothing is stopped.
 */

const STATE: Record<LimitState, { label: string; color: string }> = {
    ok: { label: 'OK', color: colors.success },
    near: { label: 'Near', color: colors.warning },
    breached: { label: 'Breached', color: colors.error },
};

const num2 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const pctPlain = (v?: number | null) => (v == null || !isFinite(v) ? '—' : `${num2(v)}%`);
const count = (v?: number | null) => (v == null || !isFinite(v) ? '—' : String(Math.round(v)));

const LIMITS: { key: RiskLimitKey; label: string; fmt: (v?: number | null) => string; value?: (l: RiskLimit) => string }[] = [
    {
        key: 'daily_loss', label: "Today's loss", fmt: pctPlain,
        // value = today's loss in %; zero or negative means flat or up on the day.
        value: l => (l.value == null || !isFinite(l.value) ? '—' : l.value <= 0 ? 'No loss' : `${num2(l.value)}%`),
    },
    { key: 'open_risk', label: 'Open risk', fmt: pctPlain },
    { key: 'positions', label: 'Positions + orders', fmt: count },
    { key: 'max_sector_count', label: 'Most in one sector', fmt: count },
    { key: 'max_sector_exposure', label: 'Largest sector', fmt: pctPlain },
];

function LimitRow({ label, lim, fmt, value }: { label: string; lim?: RiskLimit; fmt: (v?: number | null) => string; value?: (l: RiskLimit) => string }) {
    const st = STATE[lim?.state as LimitState] ?? null;
    const color = st?.color ?? colors.textMuted;
    const v = lim ? (value ? value(lim) : fmt(lim.value)) : '—';
    const frac = lim?.value != null && lim.limit ? Math.max(0, lim.value) / lim.limit : 0;
    return (
        <View className="py-2.5" accessibilityLabel={`${label}: ${v} of ${fmt(lim?.limit)} limit, ${st?.label ?? 'unknown'}`}>
            <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-text-primary text-[13px] font-bold flex-1 mr-2" numberOfLines={1}>{label}</Text>
                <Text className="text-text-secondary text-xs font-semibold mr-2">
                    <Text style={{ color }} className="font-bold">{v}</Text> / {fmt(lim?.limit)}
                </Text>
                <Pill text={st?.label ?? 'n/a'} color={color} />
            </View>
            <Bar frac={frac} color={color} />
        </View>
    );
}

function LoadingSkeleton() {
    return (
        <Container>
            <Skeleton w="45%" h={12} />
            {[0, 1, 2, 3, 4].map(i => (
                <View key={i} className="mt-4">
                    <Skeleton w="60%" h={12} />
                    <Skeleton h={6} style={{ marginTop: 8 }} />
                </View>
            ))}
        </Container>
    );
}

export default function RiskGuard({ refreshKey = 0 }: { refreshKey?: number }) {
    const [data, setData] = useState<RiskGuardStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const reqId = useRef(0);

    const load = useCallback(async () => {
        const id = ++reqId.current;
        setLoading(true);
        setError(null);
        try {
            const d = await getRiskGuard();
            if (id === reqId.current) setData(d);
        } catch (e: any) {
            if (id === reqId.current) setError(e?.message || 'Request failed');
        } finally {
            if (id === reqId.current) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const shadow = data?.shadow_mode ?? data?.config?.shadow_mode ?? true;
    const header = <View className="mb-3"><SectionHeader title="Risk guard" shadow={shadow} updating={loading && !!data} /></View>;

    if (!data) {
        return (
            <View>
                {header}
                {error && !loading
                    ? <Container><ErrorState title="Couldn't load the risk guard" body={error} onRetry={load} /></Container>
                    : <LoadingSkeleton />}
            </View>
        );
    }

    const snap = data.snapshot;
    const limits = snap?.limits || {};
    const sectors = Object.entries(snap?.sectors || {})
        .filter(([, s]) => s && typeof s === 'object')
        .sort((a, b) => (b[1].value ?? 0) - (a[1].value ?? 0))
        .slice(0, 5);
    const results = snap?.results_risk || [];
    const events = (data.events || []).slice(0, 10);
    const unprotected = snap?.unprotected || [];
    const atDate = serverDate(snap?.at);

    return (
        <View>
            {header}
            {error && !loading && <RefreshFailed error={error} onRetry={load} />}

            <Text className="text-text-muted text-xs font-semibold mb-3 leading-4">
                {shadow
                    ? 'Shadow mode: the guard only records orders it would have blocked. Nothing is stopped.'
                    : 'The guard blocks orders that would break a limit.'}
            </Text>

            {snap && snap.ok === false ? (
                <Container>
                    <EmptyState icon={<ShieldQuestion size={24} color={colors.textMuted} />}
                        title="Portfolio unknown"
                        body={`${snap.detail ? `${snap.detail}. ` : ''}The guard never blocks on a guess.`} />
                </Container>
            ) : !snap ? (
                <Container>
                    <EmptyState icon={<ShieldQuestion size={24} color={colors.textMuted} />} title="No portfolio snapshot"
                        body="The guard never blocks on a guess." />
                </Container>
            ) : (
                <Container>
                    <SubTitle right={atDate ? istWhen(atDate) : undefined}>Limits now</SubTitle>
                    <Text className="text-text-secondary text-xs font-semibold mb-1" numberOfLines={2}>
                        {inr(snap.capital, { compact: true })} capital · {snap.positions ?? 0} position{snap.positions === 1 ? '' : 's'} · {snap.pending_orders ?? 0} pending
                    </Text>
                    <Text className="text-xs font-semibold mb-2" numberOfLines={2}>
                        <Text className="text-text-muted">Today </Text>
                        <Text style={{ color: signColor(snap.day_pnl) }}>{inr(snap.day_pnl, { sign: true, decimals: 0 })} ({pct(snap.day_pnl_pct)})</Text>
                        <Text className="text-text-muted"> · open risk </Text>
                        <Text className="text-text-secondary">{inr(snap.open_risk, { decimals: 0 })} ({pctPlain(snap.open_risk_pct)})</Text>
                    </Text>
                    {LIMITS.map(l => <LimitRow key={l.key} label={l.label} lim={limits[l.key]} fmt={l.fmt} value={l.value} />)}
                    {unprotected.length > 0 && (
                        <Text className="text-warning text-xs font-bold mt-2 leading-4">
                            No stop-loss: {unprotected.join(', ')}
                        </Text>
                    )}
                </Container>
            )}

            {snap?.ok !== false && sectors.length > 0 && (
                <Container>
                    <SubTitle right={data.sector_cap_pct != null ? `Cap ${pctPlain(data.sector_cap_pct)}` : undefined}>Top sectors</SubTitle>
                    {sectors.map(([name, s], i) => {
                        const cap = data.sector_cap_pct || 0;
                        const color = cap && name !== 'Unknown'
                            ? (s.pct > cap ? colors.error : s.pct >= 0.8 * cap ? colors.warning : colors.blue)
                            : colors.textMuted;
                        return (
                            <View key={name} className={`py-2 ${i ? 'border-t border-border' : ''}`}>
                                <View className="flex-row items-center justify-between mb-1.5">
                                    <Text className="text-text-primary text-[13px] font-bold flex-1 mr-2" numberOfLines={1}>{name}</Text>
                                    <Text className="text-text-secondary text-xs font-semibold">
                                        {s.count ?? 0} · {inr(s.value, { compact: true, decimals: 0 })} · <Text style={{ color }} className="font-bold">{pctPlain(s.pct)}</Text>
                                    </Text>
                                </View>
                                <Bar frac={cap ? (s.pct ?? 0) / cap : (s.pct ?? 0) / 100} color={color} h={4} />
                            </View>
                        );
                    })}
                </Container>
            )}

            {results.length > 0 && (
                <Container>
                    <SubTitle>Results due while holding</SubTitle>
                    {results.map((r, i) => (
                        <View key={`${r.symbol}-${i}`} className={`py-2 ${i ? 'border-t border-border' : ''}`}>
                            <View className="flex-row items-center justify-between">
                                <Text className="text-text-primary text-[13px] font-bold flex-1 mr-2" numberOfLines={1}>
                                    {r.symbol}{r.date ? <Text className="text-text-muted font-semibold">  {r.date}</Text> : null}
                                </Text>
                                <Pill text={r.kind === 'pending' ? 'Pending order' : 'Position'} color={colors.warning} />
                            </View>
                            {!!r.event && <Text className="text-text-secondary text-xs mt-1" numberOfLines={2}>{r.event}</Text>}
                            {!!r.advice && <Text className="text-text-muted text-xs mt-0.5 leading-4">{r.advice}</Text>}
                        </View>
                    ))}
                </Container>
            )}

            <Container>
                <SubTitle right={events.length ? `Latest ${events.length}` : undefined}>{shadow ? 'Would have blocked' : 'Blocked orders'}</SubTitle>
                {events.length === 0 ? (
                    <EmptyState icon={<ShieldCheck size={24} color={colors.textMuted} />} title="Nothing to report"
                        body="No order has hit a limit yet." />
                ) : events.map((e, i) => {
                    const first = e.breaches?.[0];
                    const when = serverDate(e.at);
                    const blocked = (e.action || '').toLowerCase() === 'blocked';
                    return (
                        <View key={`${e.at}-${e.symbol}-${i}`} className={`py-2.5 ${i ? 'border-t border-border' : ''}`}>
                            <View className="flex-row items-center justify-between">
                                <Text className="text-text-primary text-[13px] font-bold flex-1 mr-2" numberOfLines={1}>
                                    {e.symbol}
                                    <Text className="text-text-muted text-[11px] font-semibold">  {when ? istWhen(when) : '—'}</Text>
                                </Text>
                                {!!e.action && <Pill text={e.action} color={blocked ? colors.error : colors.warning} />}
                            </View>
                            <Text className="text-text-secondary text-xs mt-1 leading-4" numberOfLines={3}>
                                {first?.message || humanize(first?.limit) || 'Limit breached'}
                                {(e.breaches?.length ?? 0) > 1 ? <Text className="text-text-muted"> (+{(e.breaches?.length ?? 1) - 1} more)</Text> : null}
                            </Text>
                            {(!!e.strategy || !!e.style) && (
                                <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={1}>
                                    {[e.strategy, e.style, e.order_value != null ? inr(e.order_value, { compact: true, decimals: 0 }) : null].filter(Boolean).join(' · ')}
                                </Text>
                            )}
                        </View>
                    );
                })}
            </Container>

            <Footnote
                lines={[
                    "Limits are checked against the scanner's paper account: positions plus pending orders.",
                    'Near = 80% of a limit. If the portfolio cannot be read, the guard lets orders through rather than block on a guess.',
                ]}
                strong={shadow ? 'Shadow mode — evidence only, no order is blocked.' : undefined} />
        </View>
    );
}
