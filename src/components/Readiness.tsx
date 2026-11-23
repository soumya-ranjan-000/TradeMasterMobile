import React, { useCallback, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CalendarClock, CircleCheck, CircleDashed, CircleX, ListPlus } from '../icons';
import { getReadiness, Readiness as ReadinessData, ReadinessCheck } from '../api';
import { colors } from '../theme';
import { ErrorState, EmptyState, Skeleton } from '../ui';
import { Bar, Container, Footnote, RefreshFailed, SectionHeader } from './evidenceUi';

/**
 * Performance screen "Readiness" tab: the paper -> real money checklist. Each
 * check passes, fails or is unknown (not enough data). Informational only:
 * nothing switches to real money from here.
 */

const STATUS: Record<ReadinessCheck['status'], { label: string; color: string; Icon: typeof CircleCheck }> = {
    pass: { label: 'Pass', color: colors.success, Icon: CircleCheck },
    fail: { label: 'Fail', color: colors.error, Icon: CircleX },
    unknown: { label: 'Not enough data', color: colors.textMuted, Icon: CircleDashed },
};

/** Any backend value as short text: arrays -> "a, b", null -> "—". */
export function renderValue(v: unknown): string {
    if (v == null || v === '') return '—';
    if (typeof v === 'number') return !isFinite(v) ? '—' : Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.length ? v.map(renderValue).join(', ') : 'none';
    if (typeof v === 'object') {
        const parts = Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k.replace(/_/g, ' ')}: ${renderValue(x)}`);
        return parts.length ? parts.join(', ') : '—';
    }
    return String(v);
}

function fmtDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d.getTime())) return iso;
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    return `${d.getDate()} ${m} ${d.getFullYear()}`;
}

function daysUntil(iso: string): number {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((new Date(`${iso}T00:00:00`).getTime() - t.getTime()) / 86_400_000));
}

const num = (x: number) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100));

/** "37 of 100 trades" + bar. Drawdown is a limit, so its bar is the share of the limit used. */
function ProgressLine({ c }: { c: ReadinessCheck }) {
    const p = c.progress!;
    const limit = c.key === 'drawdown';
    const pct = Math.max(0, Math.min(100, p.pct ?? 0));
    const text = limit ? `${num(p.current)}% of the ${num(p.target)}% limit used`
        : c.key === 'profit_factor' ? `${num(p.current)} of ${num(p.target)} needed`
        : `${num(p.current)} of ${num(p.target)} ${p.unit}`;
    const color = c.status === 'pass' ? colors.success
        : limit ? (pct >= 100 ? colors.error : pct >= 75 ? colors.warning : colors.success)
        : c.status === 'fail' ? colors.warning : colors.primary;
    return (
        <View className="mt-1.5">
            <View className="flex-row justify-between mb-1">
                <Text className="text-text-secondary text-[11px] font-semibold flex-1 mr-2">{text}</Text>
                {!limit && p.pct != null && <Text className="text-text-muted text-[11px]">{Math.round(pct)}%</Text>}
            </View>
            <Bar frac={pct / 100} color={color} h={5} />
        </View>
    );
}

function EtaLine({ c }: { c: ReadinessCheck }) {
    const e = c.eta!;
    if (e.basis === 'done') return null;
    const head = e.basis === 'pace'
        ? (e.date ? `Est. pass ${fmtDate(e.date)} (~${daysUntil(e.date)} days)` : 'No estimate yet')
        : e.basis === 'results' ? 'Depends on results — no date' : 'Your decision';
    return (
        <View className="flex-row items-start mt-1.5">
            <CalendarClock size={12} color={colors.textMuted} style={{ marginTop: 2 }} />
            <Text className="text-text-muted text-[11px] ml-1.5 flex-1 leading-4">
                <Text className={e.basis === 'pace' && e.date ? 'text-text-primary font-bold' : 'font-semibold'}>{head}</Text>
                {!!e.note && `  ·  ${e.note}`}
            </Text>
        </View>
    );
}

function CheckRow({ c, first }: { c: ReadinessCheck; first: boolean }) {
    const s = STATUS[c.status] ?? STATUS.unknown;
    const value = renderValue(c.value);
    return (
        <View className={`flex-row items-start py-3 ${first ? '' : 'border-t border-border'}`}
            accessibilityLabel={`${c.label}: ${s.label}. Value ${value}${c.target ? `, target ${c.target}` : ''}`}>
            <s.Icon size={18} color={s.color} style={{ marginTop: 1 }} />
            <View className="flex-1 ml-3">
                <View className="flex-row items-center justify-between">
                    <Text className="text-text-primary text-[13px] font-bold flex-1 mr-2">{c.label || c.key}</Text>
                    <Text className="text-[11px] font-black uppercase" style={{ color: s.color }}>{s.label}</Text>
                </View>
                <Text className="text-xs font-semibold mt-1">
                    <Text style={{ color: c.status === 'unknown' ? colors.textMuted : s.color }}>{value}</Text>
                    {!!c.target && <Text className="text-text-muted">  ·  target {c.target}</Text>}
                </Text>
                {!!c.progress && <ProgressLine c={c} />}
                {!!c.eta && <EtaLine c={c} />}
                {!!c.why && <Text className="text-text-muted text-[11px] mt-1 leading-4">{c.why}</Text>}
            </View>
        </View>
    );
}

function LoadingSkeleton() {
    return (
        <Container>
            <Skeleton w="70%" h={16} />
            <Skeleton h={8} style={{ marginTop: 12 }} />
            {[0, 1, 2, 3, 4].map(i => (
                <View key={i} className="flex-row items-center mt-5">
                    <Skeleton w={18} h={18} r={9} />
                    <View className="flex-1 ml-3">
                        <Skeleton w="55%" h={12} />
                        <Skeleton w="35%" h={10} style={{ marginTop: 6 }} />
                    </View>
                </View>
            ))}
        </Container>
    );
}

export default function Readiness({ refreshKey = 0 }: { refreshKey?: number }) {
    const [data, setData] = useState<ReadinessData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const reqId = useRef(0);

    const load = useCallback(async () => {
        const id = ++reqId.current;
        setLoading(true);
        setError(null);
        try {
            const d = await getReadiness();
            if (id === reqId.current) setData(d);
        } catch (e: any) {
            if (id === reqId.current) setError(e?.message || 'Request failed');
        } finally {
            if (id === reqId.current) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const header = <View className="mb-3"><SectionHeader title="Real-money readiness" shadow={false} updating={loading && !!data} /></View>;

    if (!data) {
        return (
            <View>
                {header}
                {error && !loading
                    ? <Container><ErrorState title="Couldn't load readiness" body={error} onRetry={load} /></Container>
                    : <LoadingSkeleton />}
            </View>
        );
    }

    const checks = (Array.isArray(data.checks) ? data.checks : []).filter(c => c && typeof c === 'object');
    const total = data.total ?? checks.length;
    const passed = data.passed ?? checks.filter(c => c.status === 'pass').length;
    const ready = !!data.ready;
    const headColor = ready ? colors.success : colors.warning;

    return (
        <View>
            {header}
            {error && !loading && <RefreshFailed error={error} onRetry={load} />}

            <Container>
                {!!data.book && (
                    <Text className="text-text-muted text-xs font-semibold mb-1">Judging the {data.book.label} book · {data.book.paper_user_id}</Text>
                )}
                <Text className="text-text-primary text-[15px] font-black leading-5" accessibilityRole="summary">
                    Ready for real money: <Text style={{ color: headColor }}>{ready ? 'yes' : 'not yet'}</Text>
                    <Text className="text-text-secondary font-bold"> — {passed} of {total} check{total === 1 ? '' : 's'} pass</Text>
                </Text>
                <View className="mt-3">
                    <Bar frac={total ? passed / total : 0} color={headColor} h={8} />
                </View>
                {!ready && !!data.earliest && (
                    <View className="flex-row items-start mt-3 p-2.5 rounded-lg border border-border">
                        <CalendarClock size={14} color={colors.primary} style={{ marginTop: 1 }} />
                        <View className="flex-1 ml-2">
                            <Text className="text-text-primary text-xs font-bold">
                                Earliest possible: {data.earliest.date
                                    ? `${fmtDate(data.earliest.date)} (~${daysUntil(data.earliest.date)} days)` : 'no estimate yet'}
                            </Text>
                            <Text className="text-text-muted text-[11px] mt-0.5 leading-4">
                                {data.earliest.date ? `Based on ${data.earliest.basis}.`
                                    : data.earliest.no_pace?.length ? `No recent activity for: ${data.earliest.no_pace.join(', ')}.` : ''}
                                {data.earliest.also_needs?.length
                                    ? ` Also needs: ${data.earliest.also_needs.join(', ')} (no date — depends on results or your settings).` : ''}
                            </Text>
                        </View>
                    </View>
                )}
                {!!data.note && <Text className="text-text-muted text-xs mt-3 leading-4">{data.note}</Text>}
            </Container>

            <Container>
                {checks.length === 0 ? (
                    <EmptyState icon={<ListPlus size={24} color={colors.textMuted} />} title="No checks yet"
                        body="The backend returned no readiness checks." />
                ) : checks.map((c, i) => <CheckRow key={c.key || String(i)} c={c} first={i === 0} />)}
            </Container>

            <Footnote lines={[
                'Unknown = not enough paper trades or replays to judge that check yet.',
                'Dates assume the last 4 weeks\' pace continues (weekdays; exchange holidays not counted).',
            ]} strong="A checklist only — nothing switches to real money from here." />
        </View>
    );
}
