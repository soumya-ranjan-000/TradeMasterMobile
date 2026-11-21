import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { AlertTriangle, ChevronDown, ChevronUp, Moon, RefreshCw } from '../icons';
import {
    getOvernight, getOvernightAccuracy, OvernightAccuracy, OvernightCue, OvernightDriver,
    OvernightEvent, OvernightPreopen, OvernightSnapshot,
} from '../api';
import { serverDate } from '../auth';
import { colors, signColor } from '../theme';
import { inr, istDate, istWhen, pct } from '../format';
import { Skeleton } from '../ui';

/**
 * Dashboard "Market" tab: the backend's shadow-mode overnight snapshot
 * (/overnight/latest, built at 08:35 IST on trading days). Each sector's
 * expected opening gap from overnight global moves, overnight news classified
 * into events, a pre-open check of pending swing orders, and the track record
 * (/overnight/accuracy). Nothing here changes scores or orders yet.
 */

const REFRESH_MS = 5 * 60_000;
/** Survives the card unmounting on tab switches, so it refetches at most every 5 min. */
let cache: { at: number; snap: OvernightSnapshot | null; acc: OvernightAccuracy | null } | null = null;
const SECTOR_ORDER = ['market', 'it', 'metals', 'oil_marketing', 'oil_upstream'];
const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
const SEVERITY_COLOR: Record<string, string> = { high: colors.error, medium: colors.warning, low: colors.textMuted };
const VERDICT: Record<string, { label: string; color: string }> = {
    hold: { label: 'HOLD', color: colors.error },
    warn: { label: 'WARN', color: colors.warning },
    ok: { label: 'OK', color: colors.success },
};
const SOURCE_LABEL: Record<string, string> = { ai: 'AI', cache: 'Cached AI', keywords: 'Keywords', price: 'Price', none: 'None' };

const sourceLabel = (s?: string | null) => (s ? SOURCE_LABEL[s] || s : 'None');
const fmtMove = (move: number | null | undefined, unit?: string) => {
    if (move == null || !isFinite(move)) return '—';
    if (unit === 'pp') return `${move < 0 ? '−' : move > 0 ? '+' : ''}${Math.abs(move).toFixed(2)} pp`;
    return pct(move, 1);
};
/** Hit rates may come as 0..1 or as a percentage. */
const fmtRate = (r?: number | null) => (r == null || !isFinite(r) ? null : `${Math.round(r <= 1 ? r * 100 : r)}%`);
const topDrivers = (c: OvernightCue): OvernightDriver[] =>
    [...(c.drivers || [])].sort((a, b) => Math.abs(b.contribution_pct ?? 0) - Math.abs(a.contribution_pct ?? 0));
/** "2026-11-21" -> "Sat 21 Nov" (the IST trading day). */
const dayLabel = (day?: string) => {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return day || '—';
    return istDate(Date.parse(`${day}T12:00:00+05:30`), true);
};

const Pill = ({ text, color }: { text: string; color: string }) => (
    <View className="px-2 py-0.5 rounded-full border" style={{ borderColor: `${color}55`, backgroundColor: `${color}14` }}>
        <Text className="text-[10px] font-black uppercase" style={{ color }} numberOfLines={1}>{text}</Text>
    </View>
);

const SectionTitle = ({ children, right }: { children: React.ReactNode; right?: string }) => (
    <View className="flex-row items-end justify-between mt-4 mb-2">
        <Text className="text-text-muted text-[11px] font-black uppercase tracking-widest">{children}</Text>
        {!!right && <Text className="text-text-muted text-[11px] font-bold">{right}</Text>}
    </View>
);

const Note = ({ children }: { children: React.ReactNode }) => (
    <View className="flex-row items-start mt-2">
        <AlertTriangle size={11} color={colors.warning} style={{ marginTop: 2 }} />
        <Text className="text-text-muted text-[11px] ml-1 flex-1">{children}</Text>
    </View>
);

function SectorRow({ cue, threshold, actual, expanded, onToggle }: {
    cue: OvernightCue; threshold: number; actual?: number | null; expanded: boolean; onToggle: () => void;
}) {
    const drivers = topDrivers(cue);
    const top = drivers[0];
    const gap = cue.expected_gap_pct;
    const strong = cue.z != null && isFinite(cue.z) && Math.abs(cue.z) >= threshold;
    const unavailable = cue.status === 'unavailable' || gap == null;
    const missing = cue.missing || [];
    const Chevron = expanded ? ChevronUp : ChevronDown;
    return (
        <Pressable onPress={onToggle} accessibilityRole="button"
            accessibilityLabel={`${cue.label}, expected gap ${unavailable ? 'unavailable' : pct(gap)}${strong ? ', strong' : ''}`}
            accessibilityHint={expanded ? 'Hides the drivers' : 'Shows all drivers'}
            className="py-2.5 border-b border-border active:opacity-70">
            <View className="flex-row items-center">
                <Text className="text-text-primary text-xs font-bold flex-1" numberOfLines={1}>{cue.label || cue.key}</Text>
                {strong && <View className="mr-2"><Pill text="Strong" color={signColor(gap)} /></View>}
                <Text className="text-sm font-black w-20 text-right" style={{ color: unavailable ? colors.textMuted : signColor(gap), fontVariant: ['tabular-nums'] }}>
                    {unavailable ? '—' : pct(gap)}
                </Text>
                <Chevron size={14} color={colors.textMuted} style={{ marginLeft: 6 }} />
            </View>
            <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={1}>
                {unavailable
                    ? `Unavailable${cue.detail ? `: ${cue.detail}` : ''}`
                    : top ? `${top.name || top.ticker} ${fmtMove(top.move_pct, top.unit)}` : 'No drivers'}
                {!unavailable && cue.relative_to_market_pct != null ? `  ·  vs market ${pct(cue.relative_to_market_pct)}` : ''}
                {actual != null ? `  ·  actual ${pct(actual)}` : ''}
            </Text>
            {cue.status === 'partial' && (
                <Text className="text-text-muted text-[11px] italic" numberOfLines={expanded ? undefined : 1}>
                    Partial{missing.length ? `: missing ${missing.join(', ')}` : cue.detail ? `: ${cue.detail}` : ''}
                </Text>
            )}
            {expanded && (
                <View className="mt-2 bg-background rounded-xl px-3 py-2">
                    {drivers.length ? drivers.map(d => (
                        <View key={d.ticker || d.name} className="flex-row items-center py-0.5">
                            <Text className="text-text-secondary text-[11px] font-bold flex-1" numberOfLines={1}>{d.name || d.ticker}</Text>
                            <Text className="text-[11px] font-bold w-20 text-right" style={{ color: signColor(d.move_pct) }}>{fmtMove(d.move_pct, d.unit)}</Text>
                            <Text className="text-text-muted text-[11px] w-12 text-right">{d.z != null && isFinite(d.z) ? `z ${d.z.toFixed(1)}` : ''}</Text>
                            <Text className="text-[11px] w-16 text-right" style={{ color: signColor(d.contribution_pct) }}>{pct(d.contribution_pct)}</Text>
                        </View>
                    )) : <Text className="text-text-muted text-[11px]">No drivers.</Text>}
                    <Text className="text-text-muted text-[10px] mt-1">
                        move · z-score · contribution to gap
                        {cue.z != null && isFinite(cue.z) ? `  ·  sector z ${cue.z.toFixed(1)}` : ''}
                        {cue.fit?.r2 != null ? `  ·  fit R² ${cue.fit.r2.toFixed(2)}${cue.fit.n ? ` (n=${cue.fit.n})` : ''}` : ''}
                        {cue.session ? `  ·  ${cue.session}` : ''}
                    </Text>
                    {cue.status === 'unavailable' && missing.length > 0 && (
                        <Text className="text-text-muted text-[10px] mt-0.5">Missing: {missing.join(', ')}</Text>
                    )}
                </View>
            )}
        </Pressable>
    );
}

function EventRow({ ev, labelOf }: { ev: OvernightEvent; labelOf: (k: string) => string }) {
    const sev = SEVERITY_COLOR[ev.severity] || colors.textMuted;
    return (
        <View className="py-2 border-b border-border">
            <View className="flex-row items-center flex-wrap">
                <View className="mr-1.5 mb-1"><Pill text={sourceLabel(ev.source)} color={colors.blue} /></View>
                <View className="mr-1.5 mb-1"><Pill text={ev.severity || '—'} color={sev} /></View>
                {(ev.sectors || []).map(s => (
                    <Text key={`${s.sector}${s.direction}`} className="text-[11px] font-black mr-2 mb-1"
                        style={{ color: s.direction > 0 ? colors.success : s.direction < 0 ? colors.error : colors.textMuted }}>
                        {labelOf(s.sector)} {s.direction > 0 ? '↑' : s.direction < 0 ? '↓' : ''}
                    </Text>
                ))}
            </View>
            <Text className="text-text-primary text-xs" numberOfLines={2}>{ev.label || ev.type}</Text>
        </View>
    );
}

function PreopenRow({ o }: { o: OvernightPreopen }) {
    const v = VERDICT[o.verdict] || { label: (o.verdict || '?').toUpperCase(), color: colors.textMuted };
    const reason = o.reasons?.[0];
    return (
        <View className="flex-row items-start py-2 border-b border-border">
            <View className="w-14 mr-2 items-start"><Pill text={v.label} color={v.color} /></View>
            <View className="flex-1">
                <Text className="text-text-primary text-xs font-bold" numberOfLines={1}>
                    {o.symbol}  <Text className="text-text-muted font-semibold">{o.quantity ?? '—'} @ {o.limit != null ? inr(o.limit) : 'market'}</Text>
                </Text>
                {!!reason && <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={2}>{reason}</Text>}
            </View>
        </View>
    );
}

export default function OvernightCues({ active, refreshKey = 0 }: { active: boolean; refreshKey?: number }) {
    // undefined = not loaded yet, null = no snapshot yet (404).
    const [snap, setSnap] = useState<OvernightSnapshot | null | undefined>(cache ? cache.snap : undefined);
    const [acc, setAcc] = useState<OvernightAccuracy | null>(cache?.acc ?? null);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const lastLoad = useRef(cache?.at ?? 0);
    const inFlight = useRef(false);
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);

    const load = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        try {
            const [s, a] = await Promise.all([getOvernight(), getOvernightAccuracy().catch(() => null)]);
            if (!mounted.current) return;
            setSnap(s);
            setAcc(a);
            setError(null);
            lastLoad.current = Date.now();
            cache = { at: lastLoad.current, snap: s, acc: a };
        } catch (e: any) {
            if (!mounted.current) return;
            setError(e?.message || 'Cannot reach the backend');
            setSnap(prev => (prev === undefined ? null : prev));
            lastLoad.current = Date.now();
        } finally {
            inFlight.current = false;
        }
    }, []);

    // While visible: fetch if the last load is older than 5 min, then every 5 min.
    useEffect(() => {
        if (!active) return;
        if (Date.now() - lastLoad.current >= REFRESH_MS) load();
        const id = setInterval(load, REFRESH_MS);
        return () => clearInterval(id);
    }, [active, load]);

    // Pull-to-refresh on the screen (not the value it had when this card mounted).
    const seenRefresh = useRef(refreshKey);
    useEffect(() => {
        if (refreshKey === seenRefresh.current) return;
        seenRefresh.current = refreshKey;
        load();
    }, [refreshKey, load]);

    const retry = () => { setSnap(undefined); setError(null); load(); };

    const header = (right?: React.ReactNode) => (
        <View className="flex-row items-center">
            <Moon size={14} color={colors.textSecondary} />
            <Text className="text-text-primary font-black text-base ml-1.5 mr-2">Sector outlook (overnight)</Text>
            <Pill text="Shadow mode" color={colors.warning} />
            <View className="flex-1" />
            {right}
        </View>
    );

    if (snap === undefined) {
        return (
            <View className="bg-surface rounded-3xl border border-border p-5">
                {header()}
                <Skeleton w="55%" h={10} style={{ marginTop: 10 }} />
                {[0, 1, 2, 3, 4].map(i => (
                    <View key={i} className="flex-row items-center justify-between mt-4">
                        <Skeleton w="40%" h={12} />
                        <Skeleton w={56} h={12} />
                    </View>
                ))}
            </View>
        );
    }

    if (snap === null) {
        return (
            <View className="bg-surface rounded-3xl border border-border p-5">
                {header()}
                {error ? (
                    <>
                        <Text className="text-text-primary font-bold text-xs mt-3">Couldn't load overnight cues</Text>
                        <Text className="text-text-muted text-[11px] mt-1">{error}</Text>
                        <TouchableOpacity onPress={retry}
                            className="mt-3 self-start flex-row items-center px-4 py-2 rounded-full bg-primary/10 border border-primary/30">
                            <RefreshCw size={14} color={colors.primary} />
                            <Text className="text-primary font-bold text-xs ml-2">Retry</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <Text className="text-text-muted text-xs mt-3">First snapshot at 08:35 IST on trading days.</Text>
                )}
                <Text className="text-text-muted text-[11px] mt-3">Shadow mode — for information. Nothing here changes scores or orders.</Text>
            </View>
        );
    }

    const threshold = snap.z_threshold ?? 2.0;
    const cueMap = snap.cues || {};
    const keys = [
        ...SECTOR_ORDER.filter(k => cueMap[k]),
        ...Object.keys(cueMap).filter(k => !SECTOR_ORDER.includes(k)),
    ];
    const labelOf = (k: string) => cueMap[k]?.label || k.replace(/_/g, ' ');
    const generated = serverDate(snap.generated_at);
    const news = snap.news;
    const newsSource = news?.source || 'none';
    const fallbacks = news?.fallbacks_tried || [];
    const newsReason = newsSource === 'ai' ? null
        : fallbacks.length ? `Fell back after: ${fallbacks.join(', ')}`
        : newsSource === 'none' ? (news?.headlines ? 'News was not classified' : 'No overnight headlines')
        : null;
    const events = [...(snap.events || [])]
        .sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0) || (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 5);
    const preopen = snap.preopen || [];
    const outcome = snap.outcome?.sectors || {};

    const days = acc?.days_with_outcome ?? 0;
    const rates = days > 0
        ? Object.entries(acc?.sectors || {})
            .filter(([, v]) => v && v.days > 0 && fmtRate(v.direction_hit_rate))
            .sort(([a], [b]) => (SECTOR_ORDER.indexOf(a) + 1 || 99) - (SECTOR_ORDER.indexOf(b) + 1 || 99))
            .map(([k, v]) => `${labelOf(k)} direction hit ${fmtRate(v.direction_hit_rate)}`)
        : [];
    const aiEvents = acc?.event_sources?.ai;
    if (days > 0 && aiEvents?.calls && fmtRate(aiEvents.hit_rate)) rates.push(`AI events hit ${fmtRate(aiEvents.hit_rate)}`);
    const trackRecord = days > 0
        ? [`${days} ${days === 1 ? 'day' : 'days'} tracked`, ...rates].join(' · ')
        : 'Builds up after the first trading days';

    const toggle = (k: string) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(k) ? next.delete(k) : next.add(k);
        return next;
    });

    return (
        <View className="bg-surface rounded-3xl border border-border p-5">
            {header(
                <View className="flex-row items-center">
                    <Text className="text-text-muted text-[10px] font-bold mr-1">News</Text>
                    <Pill text={sourceLabel(newsSource)} color={newsSource === 'ai' ? colors.success : newsSource === 'none' ? colors.textMuted : colors.warning} />
                </View>,
            )}
            <Text className="text-text-muted text-[11px] font-bold mt-1.5">
                For {dayLabel(snap.day)}  ·  Generated {generated ? `${istWhen(generated)} IST` : '—'}
                {news?.headlines != null ? `  ·  ${news.headlines} headlines` : ''}
            </Text>
            {!!newsReason && <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={1}>{newsReason}</Text>}
            {snap.data && !snap.data.ok && <Note>Market data incomplete{snap.data.detail ? `: ${snap.data.detail}` : ''}</Note>}
            {!!error && <Note>Refresh failed ({error}); showing the last snapshot.</Note>}

            {/* Expected opening gaps */}
            <SectionTitle right={`strong = |z| ≥ ${threshold}`}>Expected opening gap</SectionTitle>
            {keys.length ? keys.map(k => (
                <SectorRow key={k} cue={{ ...cueMap[k], key: cueMap[k].key || k }} threshold={threshold}
                    actual={outcome[k]?.actual?.gap_pct ?? null}
                    expanded={expanded.has(k)} onToggle={() => toggle(k)} />
            )) : <Text className="text-text-muted text-xs">No sector predictions in this snapshot.</Text>}
            {keys.length > 0 && <Text className="text-text-muted text-[10px] mt-1">Tap a sector for all its drivers.</Text>}

            {/* News events */}
            <SectionTitle right={(snap.events?.length || 0) > 5 ? `top 5 of ${snap.events!.length}` : undefined}>Overnight events</SectionTitle>
            {events.length
                ? events.map((ev, i) => <EventRow key={`${ev.type}-${i}`} ev={ev} labelOf={labelOf} />)
                : <Text className="text-text-muted text-xs">No market-moving events found.</Text>}

            {/* Pre-open check */}
            <SectionTitle right="Shadow mode: not acted on">Pre-open check</SectionTitle>
            {snap.preopen_status && !snap.preopen_status.ok && (
                <Note>Check incomplete{snap.preopen_status.detail ? `: ${snap.preopen_status.detail}` : ''}</Note>
            )}
            {preopen.length
                ? preopen.map(o => <PreopenRow key={o.order_id || o.symbol} o={o} />)
                : <Text className="text-text-muted text-xs">No pending swing orders</Text>}

            {/* Track record */}
            <SectionTitle>Track record</SectionTitle>
            <Text className="text-text-secondary text-[11px] font-bold">{trackRecord}</Text>

            <Text className="text-text-muted text-[11px] mt-4 text-center">Shadow mode — for information. Nothing here changes scores or orders.</Text>
        </View>
    );
}
