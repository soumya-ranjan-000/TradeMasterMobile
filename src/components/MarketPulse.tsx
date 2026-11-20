import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import { getMarketPulse, MarketPulse as Pulse, PulseFactor } from '../api';

/**
 * Dashboard "Market" tab: India market mood from the global sentiment service
 * (via the backend's /market/pulse): bias with a score gauge, NIFTY, overnight
 * cues (GIFT Nifty first), key factors coloured by what they mean for Indian
 * stocks, and today's sector moves as a heatmap.
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

const SectionTitle = ({ children, right }: { children: React.ReactNode; right?: string }) => (
    <View className="flex-row items-end justify-between mt-6 mb-3">
        <Text className="text-text-muted text-[10px] font-black uppercase tracking-widest">{children}</Text>
        {!!right && <Text className="text-text-muted text-[9px] font-bold">{right}</Text>}
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

    const score = Math.max(-1, Math.min(1, pulse.bias?.score ?? 0));
    const bc = biasColor(pulse.bias?.label);
    const rows = pulse.sectors?.rows || [];

    return (
        <View>
            {/* Bias */}
            <View className="bg-surface rounded-3xl border border-border p-5">
                <View className="flex-row justify-between items-start">
                    <View>
                        <Text className="text-text-muted text-[10px] font-black uppercase tracking-widest">India market bias</Text>
                        <Text className="font-black text-3xl mt-1" style={{ color: bc }}>{pulse.bias?.label || '—'}</Text>
                    </View>
                    <View className="items-end">
                        <Text className="text-text-muted text-[9px] font-bold uppercase">Score</Text>
                        <Text className="font-black text-lg" style={{ color: bc }}>{signed(score)}</Text>
                    </View>
                </View>
                {/* Gauge: -1 (left) .. +1 (right), filled from the centre */}
                <View className="h-2 rounded-full bg-background mt-4 overflow-hidden flex-row">
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        {score < 0 && <View style={{ width: `${-score * 100}%`, height: '100%', backgroundColor: RED, borderRadius: 4 }} />}
                    </View>
                    <View style={{ width: 2, backgroundColor: MUTED }} />
                    <View style={{ flex: 1 }}>
                        {score > 0 && <View style={{ width: `${score * 100}%`, height: '100%', backgroundColor: GREEN, borderRadius: 4 }} />}
                    </View>
                </View>
                <View className="flex-row justify-between mt-1">
                    <Text className="text-text-muted text-[8px] font-bold">BEARISH</Text>
                    <Text className="text-text-muted text-[8px] font-bold">BULLISH</Text>
                </View>
                <Text className="text-text-muted text-[11px] font-bold mt-3">
                    {pulse.index?.name} {fmtNum(pulse.index?.price)}{' '}
                    <Text style={{ color: toneOf(pulse.index?.change) }}>{signed(pulse.index?.change)}%</Text>
                    {pulse.session?.status ? `  ·  Session ${pulse.session.status}` : ''}
                </Text>
                {!!pulse.updated_at && <Text className="text-text-muted text-[9px] mt-1">Updated {ago(pulse.updated_at)}</Text>}
            </View>

            {/* Overnight cues */}
            {!!pulse.cues?.length && (
                <>
                    <SectionTitle>Overnight cues</SectionTitle>
                    <View className="flex-row flex-wrap">
                        {pulse.cues.map(c => (
                            <View key={c.label} className="bg-surface rounded-2xl border border-border px-3 py-2 mr-2 mb-2">
                                <Text className="text-text-muted text-[9px] font-bold uppercase">{c.label}{c.stale ? ' · old' : ''}</Text>
                                <Text className="font-black text-sm" style={{ color: toneOf(c.change) }}>{signed(c.change)}%</Text>
                            </View>
                        ))}
                    </View>
                    {!!pulse.cues[0]?.detail && <Text className="text-text-muted text-[9px]">{pulse.cues[0].label}: {pulse.cues[0].detail}</Text>}
                </>
            )}

            {/* Key factors */}
            {!!pulse.factors?.length && (
                <>
                    <SectionTitle right="colour = effect on Indian stocks">Key factors</SectionTitle>
                    <View className="flex-row flex-wrap justify-between">
                        {pulse.factors.map(f => (
                            <View key={f.key} className="bg-surface rounded-2xl border border-border p-3 mb-2" style={{ width: '48.5%' }}>
                                <Text className="text-text-muted text-[9px] font-bold uppercase" numberOfLines={1}>{f.label}</Text>
                                <View className="flex-row items-baseline justify-between mt-1">
                                    <Text className="text-text-primary font-black text-base">{fmtNum(f.value)}</Text>
                                    <Text className="text-[10px] font-black" style={{ color: impactColor(f.impact) }}>{fmtChange(f)}</Text>
                                </View>
                                {!!f.reading && <Text className="text-[10px] font-bold mt-0.5" style={{ color: impactColor(f.impact) }}>{f.reading}</Text>}
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
                                    <Text className="text-text-primary text-[10px] font-bold" numberOfLines={1}>{r.label}</Text>
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
                    <Text className="text-text-muted text-[10px] ml-1 flex-1">{n}</Text>
                </View>
            ))}
            <Text className="text-text-muted text-[9px] mt-4 mb-2 text-center">Bias is a weighted read of overnight cues. Not investment advice.</Text>
        </View>
    );
}
