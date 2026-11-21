import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Info } from '../icons';
import { colors } from '../theme';
import { haptic } from '../haptics';

/**
 * Small pieces shared by the Performance screen's evidence sections
 * (Strategy scorecard, Risk guard, Journal, Readiness).
 */

export const fmtR = (v?: number | null) =>
    v == null || !isFinite(v) ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`;
/** 0..1 -> "48%". */
export const fmtRate = (r?: number | null) => (r == null || !isFinite(r) ? '—' : `${Math.round(r * 100)}%`);

export const Pill = ({ text, color }: { text: string; color: string }) => (
    <View className="px-2 py-0.5 rounded-full border" style={{ borderColor: `${color}55`, backgroundColor: `${color}14` }}>
        <Text className="text-[10px] font-black uppercase" style={{ color }} numberOfLines={1}>{text}</Text>
    </View>
);

export const SubTitle = ({ children, right }: { children: React.ReactNode; right?: string }) => (
    <View className="flex-row items-end justify-between mb-3">
        <Text className="text-text-muted text-[11px] font-black uppercase tracking-widest">{children}</Text>
        {!!right && <Text className="text-text-muted text-[11px] font-bold">{right}</Text>}
    </View>
);

export const Container = ({ children }: { children: React.ReactNode }) => (
    <View className="bg-surface rounded-[32px] border border-border p-5 mb-6">{children}</View>
);

/** Section title with the shadow-mode pill and an "Updating…" hint. */
export const SectionHeader = ({ title, shadow = true, updating = false }: { title: string; shadow?: boolean; updating?: boolean }) => (
    <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2">
            <Text accessibilityRole="header" className="text-text-primary font-black text-lg" numberOfLines={1}>{title}</Text>
            {shadow && <View className="ml-2"><Pill text="Shadow mode" color={colors.warning} /></View>}
        </View>
        {updating && <Text className="text-text-muted text-[11px] font-bold">Updating…</Text>}
    </View>
);

/** Row of filter chips (period, style …). */
export function Chips<T extends string>({ options, value, onChange, a11y }: {
    options: readonly { key: T; label: string }[]; value: T; onChange: (v: T) => void; a11y?: (o: { key: T; label: string }) => string;
}) {
    return (
        <View className="flex-row flex-wrap" accessibilityRole="tablist">
            {options.map(o => {
                const on = o.key === value;
                return (
                    <Pressable key={o.key} accessibilityRole="tab" accessibilityState={{ selected: on }}
                        accessibilityLabel={a11y ? a11y(o) : o.label}
                        onPress={() => { if (!on) { haptic.select(); onChange(o.key); } }}
                        hitSlop={4}
                        className={`px-4 py-1.5 rounded-full border mr-2 ${on ? 'bg-primary/10 border-primary/40' : 'bg-surface border-border'}`}>
                        <Text className={`text-xs font-bold ${on ? 'text-primary' : 'text-text-muted'}`}>{o.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/** The tinted info box at the end of a section. The last line is emphasised. */
export const Footnote = ({ lines, strong }: { lines: (string | null | undefined | false)[]; strong?: string }) => (
    <View className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex-row items-start mb-6">
        <Info size={16} color={colors.primary} style={{ marginTop: 1 }} />
        <View className="flex-1 ml-3">
            {lines.filter((l): l is string => !!l).map((l, i) => (
                <Text key={i} className={`text-text-muted text-[11px] font-bold leading-4 ${i ? 'mt-1.5' : ''}`}>{l}</Text>
            ))}
            {!!strong && <Text className="text-text-secondary text-[11px] font-black leading-4 mt-1.5">{strong}</Text>}
        </View>
    </View>
);

/** Inline "Refresh failed … Tap to retry." shown above stale data. */
export const RefreshFailed = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
    <Pressable onPress={onRetry} accessibilityRole="button" className="mb-3">
        <Text className="text-error text-xs font-bold">Refresh failed ({error}). Tap to retry.</Text>
    </Pressable>
);

/** Thin horizontal bar, 0..1 filled. */
export const Bar = ({ frac, color, h = 6 }: { frac: number; color: string; h?: number }) => (
    <View className="w-full bg-background rounded-full overflow-hidden" style={{ height: h }}>
        <View style={{ height: h, width: `${Math.max(0, Math.min(1, isFinite(frac) ? frac : 0)) * 100}%`, backgroundColor: color, borderRadius: h / 2 }} />
    </View>
);

/** "under_score" / "kebab-case" -> "under score". */
export const humanize = (s?: string | null) => (s ? String(s).replace(/[_-]+/g, ' ').trim() : '');
