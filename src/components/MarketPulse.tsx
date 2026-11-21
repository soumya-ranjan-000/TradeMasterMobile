import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AlertTriangle, RefreshCw } from '../icons';
import { getMarketPulse, MarketPulse as Pulse, PulseFactor } from '../api';

/**
 * Dashboard "Market" tab, from the global sentiment service (via the
 * backend's /market/pulse): India's opening bias with a gauge, the global
 * picture (average bias, how many markets lean each way, CBOE VIX, each
 * market's bias and index), overnight cues, key factors coloured by what they
 * mean for Indian stocks, and today's sector heatmap.
 *
 * Bias scores are weighted overnight moves in PERCENT (not a -1..1 index):
 * |s| < 0.2 Neutral/Flat, 0.2-0.5 Bullish/Bearish, > 0.5 Strong (the service's
 * classify_bias). The gauge spans -1..+1 % with ticks at those thresholds.
 */

const REFRESH_MS = 60_000;
const GREEN = '#00E0A1', RED = '#FF4D4D', MUTED = '#8B93A1';

const signed = (v?: number | null, digits = 2) =>
    v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
const toneOf = (v?: number | null) => (v == null || Math.abs(v) < 0.05 ? MUTED : v > 0 ? GREEN : RED);
const biasColor = (label?: string) =>
    !label ? MUTED : label.includes('Bullish') ? GREEN : label.includes('Bearish') ? RED : MUTED;
const impactColor = (i?: string) => (i === 'positive' ? GREEN : i === 'negative' ? RED : MUTED);
const ago = (iso?: string) => {
    if (!iso) return '';
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
const fmtChange = (f: PulseFactor) =>
    f.change == null ? '' : f.unit === 'bps' ? `${signed(f.change, 1)} bps` : `${signed(f.change)}%`;
const fmtNum = (v?: number | null) =>
    v == null ? '—' : v >= 1000 ? v.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : v.toFixed(2);

const GAUGE_MAX = 1.0;          // % at each end of the bias gauge
const TICKS = [-0.5, -0.2, 0.2, 0.5];

/** Bias gauge: centre = 0, fill toward the score, ticks at the label thresholds. */
const BiasGauge = ({ score }: { score: number }) => {
    const pos = (v: number) => `${50 + (Math.max(-GAUGE_MAX, Math.min(GAUGE_MAX, v)) / GAUGE_MAX) * 50}%`;
    const clamped = Math.max(-GAUGE_MAX, Math.min(GAUGE_MAX, score));
    const left = clamped < 0 ? pos(clamped) : '50%';
    const width = `${(Math.abs(clamped) / GAUGE_MAX) * 50}%`;
    return (
        <View className="mt-4">
            <View className="h-2.5 rounded-full bg-background overflow-hidden" style={{ position: 'relative' }}>
                <View style={{ position: 'absolute', left: left as any, width: width as any, top: 0, bottom: 0,
                               backgroundColor: score < 0 ? RED : GREEN }} />
                {TICKS.map(t => (
                    <View key={t} style={{ position: 'absolute', left: pos(t) as any, width: 1, top: 0, bottom: 0, backgroundColor: '#3A3F4B' }} />
                ))}
                <View style={{ position: 'absolute', left: '50%', width: 2, marginLeft: -1, top: 0, bottom: 0, backgroundColor: MUTED }} />
            </View>
            <View className="flex-row justify-between mt-1">
                <Text className="text-text-muted text-[11px] font-bold">≤ −1%  BEARISH</Text>
                <Text className="text-text-muted text-[11px] font-bold">FLAT</Text>
                <Text className="text-text-muted text-[11px] font-bold">BULLISH  ≥ +1%</Text>
            </View>
        </View>
    );
};

const SectionTitle = ({ children, right }: { children: React.ReactNode; right?: string }) => (
    <View className="flex-row items-end justify-between mt-6 mb-3">
        <Text className="text-text-muted text-[11px] font-black uppercase tracking-widest">{children}</Text>
        {!!right && <Text className="text-text-muted text-[11px] font-bold">{right}</Text>}
    </View>
);

export default function MarketPulse({ active }: { active: boolean }) {
    const [pulse, setPulse] = useState<Pulse | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            setPulse(await getMarketPulse());
        } catch (e: any) {
            setPulse({ available: false, error: e?.message || 'Cannot reach the backend' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!active) return;
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => clearInterval(id);
    }, [active, load]);

    if (loading && !pulse) {
        return <View className="py-20 items-center"><ActivityIndicator color={GREEN} /></View>;
    }
    if (!pulse?.available) {
        return (
            <View className="bg-surface rounded-3xl border border-border p-6 items-center">
                <Text className="text-text-primary font-black">Market data unavailable</Text>
                <Text className="text-text-muted text-xs mt-2 text-center">{pulse?.error || 'The sentiment service did not answer.'}</Text>
                <TouchableOpacity onPress={() => { setLoading(true); load(); }}
                    className="mt-4 flex-row items-center px-4 py-2 rounded-full bg-primary/10 border border-primary/30">
                    <RefreshCw size={14} color={GREEN} />
                    <Text className="text-primary font-bold text-xs ml-2">Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const score = pulse.bias?.score ?? 0;
    const g = pulse.global;
    const bc = biasColor(pulse.bias?.label);
    const rows = pulse.sectors?.rows || [];

    return (
        <View>
            {/* Bias */}
            <View className="bg-surface rounded-3xl border border-border p-5">
                <View className="flex-row justify-between items-start">
                    <View>
                        <Text className="text-text-muted text-[11px] font-black uppercase tracking-widest">India market bias</Text>
                        <Text className="font-black text-3xl mt-1" style={{ color: bc }}>{pulse.bias?.label || '—'}</Text>
                    </View>
                    <View className="items-end">
                        <Text className="text-text-muted text-[11px] font-bold uppercase">Weighted move</Text>
                        <Text className="font-black text-lg" style={{ color: bc }}>{signed(score)}%</Text>
                    </View>
                </View>
                <BiasGauge score={score} />
                <Text className="text-text-muted text-[11px] font-bold mt-3">
                    {pulse.index?.name} {fmtNum(pulse.index?.price)}{' '}
                    <Text style={{ color: toneOf(pulse.index?.change) }}>{signed(pulse.index?.change)}%</Text>
                    {pulse.session?.status ? `  ·  Session ${pulse.session.status}` : ''}
                </Text>
                {!!pulse.updated_at && <Text className="text-text-muted text-[11px] mt-1">Updated {ago(pulse.updated_at)}</Text>}
            </View>

            {/* Global picture */}
            {!!g && (
                <>
                    <SectionTitle right={g.vix ? `CBOE VIX ${fmtNum(g.vix.value)} · ${g.vix.reading || ''}` : undefined}>Global markets</SectionTitle>
                    <View className="bg-surface rounded-3xl border border-border p-4">
                        <View className="flex-row items-center justify-between">
                            <View>
                                <Text className="text-text-muted text-[11px] font-bold uppercase">Global average</Text>
                                <Text className="font-black text-xl" style={{ color: biasColor(g.average_bias || undefined) }}>{g.average_bias || '—'}</Text>
                            </View>
                            <View className="items-end">
                                <Text className="font-black text-base" style={{ color: biasColor(g.average_bias || undefined) }}>{signed(g.average_score)}%</Text>
                                <Text className="text-text-muted text-[11px] font-bold">
                                    <Text style={{ color: GREEN }}>{g.counts.bullish ?? 0}▲</Text>  {g.counts.neutral ?? 0}●  <Text style={{ color: RED }}>{g.counts.bearish ?? 0}▼</Text>
                                </Text>
                            </View>
                        </View>
                        <View className="h-px bg-border my-3" />
                        {g.markets.map(m => (
                            <View key={m.slug} className="flex-row items-center py-1.5">
                                <View className="w-1.5 h-1.5 rounded-full mr-2" style={{ backgroundColor: m.status === 'open' ? GREEN : '#3A3F4B' }} />
                                <Text className="text-text-primary text-xs font-bold flex-1" numberOfLines={1}>{m.name}</Text>
                                <Text className="text-[11px] font-black w-24 text-right" style={{ color: biasColor(m.bias?.label) }} numberOfLines={1}>{m.bias?.label}</Text>
                                <Text className="text-[11px] font-bold w-16 text-right" style={{ color: toneOf(m.index?.change) }}>{signed(m.index?.change)}%</Text>
                            </View>
                        ))}
                        <Text className="text-text-muted text-[11px] mt-2">● open now · bias = each market's opening read · % = its index today</Text>
                    </View>
                </>
            )}

            {/* Overnight cues */}
            {!!pulse.cues?.length && (
                <>
                    <SectionTitle>Overnight cues</SectionTitle>
                    <View className="flex-row flex-wrap">
                        {pulse.cues.map(c => (
                            <View key={c.label} className="bg-surface rounded-2xl border border-border px-3 py-2 mr-2 mb-2">
                                <Text className="text-text-muted text-[11px] font-bold uppercase">{c.label}{c.stale ? ' · old' : ''}</Text>
                                <Text className="font-black text-sm" style={{ color: toneOf(c.change) }}>{signed(c.change)}%</Text>
                            </View>
                        ))}
                    </View>
                    {!!pulse.cues[0]?.detail && <Text className="text-text-muted text-[11px]">{pulse.cues[0].label}: {pulse.cues[0].detail}</Text>}
                </>
            )}

            {/* Key factors */}
            {!!pulse.factors?.length && (
                <>
                    <SectionTitle right="colour = effect on Indian stocks">Key factors</SectionTitle>
                    <View className="flex-row flex-wrap justify-between">
                        {pulse.factors.map(f => (
                            <View key={f.key} className="bg-surface rounded-2xl border border-border p-3 mb-2" style={{ width: '48.5%' }}>
                                <Text className="text-text-muted text-[11px] font-bold uppercase" numberOfLines={1}>{f.label}</Text>
                                <View className="flex-row items-baseline justify-between mt-1">
                                    <Text className="text-text-primary font-black text-base">{fmtNum(f.value)}</Text>
                                    <Text className="text-[11px] font-black" style={{ color: impactColor(f.impact) }}>{fmtChange(f)}</Text>
                                </View>
                                {!!f.reading && <Text className="text-[11px] font-bold mt-0.5" style={{ color: impactColor(f.impact) }}>{f.reading}</Text>}
                            </View>
                        ))}
                    </View>
                </>
            )}

            {/* Sector heatmap */}
            {!!rows.length && (
                <>
                    <SectionTitle right={pulse.sectors?.stale ? 'stale' : pulse.sectors?.source}>Sectors today</SectionTitle>
                    <View className="flex-row flex-wrap justify-between">
                        {rows.map(r => {
                            const a = Math.min(0.55, 0.12 + Math.abs(r.change) / 4);
                            const bg = r.change >= 0 ? `rgba(0,224,161,${a})` : `rgba(255,77,77,${a})`;
                            return (
                                <View key={r.label} className="rounded-xl px-2 py-2 mb-1.5" style={{ width: '32.5%', backgroundColor: bg }}>
                                    <Text className="text-text-primary text-[11px] font-bold" numberOfLines={1}>{r.label}</Text>
                                    <Text className="text-text-primary text-xs font-black">{signed(r.change)}%</Text>
                                </View>
                            );
                        })}
                    </View>
                </>
            )}

            {(pulse.notes || []).map(n => (
                <View key={n} className="flex-row items-start mt-3">
                    <AlertTriangle size={11} color="#FBBF24" style={{ marginTop: 2 }} />
                    <Text className="text-text-muted text-[11px] ml-1 flex-1">{n}</Text>
                </View>
            ))}
            <Text className="text-text-muted text-[11px] mt-4 mb-2 text-center">Bias is a weighted read of overnight cues. Not investment advice.</Text>
        </View>
    );
}
