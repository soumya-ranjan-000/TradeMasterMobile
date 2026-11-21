/**
 * Daily briefings from the backend: pre-market (08:45 IST) and post-market
 * (16:35 IST) on trading days. Read-only digests; "Build now" makes a fresh
 * one without sending it to Telegram.
 */
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StatusBar, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Newspaper, RefreshCw, Sunrise, Sunset } from '../icons';
import { Briefing, BriefingKind, getBriefing, runBriefing } from '../api';
import { serverDate } from '../auth';
import { ScreenHeader, IconButton, Segmented, Skeleton, ErrorState, EmptyState, FadeIn } from '../ui';
import { colors } from '../theme';
import { istDate, istWhen } from '../format';
import { haptic } from '../haptics';
import { toast } from '../components/Toast';

const KINDS: readonly BriefingKind[] = ['premarket', 'postmarket'];
const LABELS: Record<BriefingKind, string> = { premarket: 'Pre-market', postmarket: 'Post-market' };
const SCHEDULE: Record<BriefingKind, string> = { premarket: '08:45', postmarket: '16:35' };

/** Pre-market before 12:00 IST, post-market after. */
const defaultKind = (): BriefingKind => (new Date(Date.now() + 330 * 60_000).getUTCHours() < 12 ? 'premarket' : 'postmarket');

/** "2026-11-21" -> "Sat 21 Nov" (IST day, no time-zone shift). */
const dayLabel = (day?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
    return m ? istDate(Date.UTC(+m[1], +m[2] - 1, +m[3], 6), true) : day || '';
};

type Slot = { data: Briefing | null; error: string | null; loading: boolean };
const EMPTY: Slot = { data: null, error: null, loading: true };

function LoadingSkeleton() {
    return (
        <View>
            <Skeleton w="70%" h={20} />
            <Skeleton w="40%" h={12} style={{ marginTop: 8 }} />
            {[0, 1, 2].map(i => (
                <View key={i} className="bg-surface rounded-3xl border border-border p-5 mt-5">
                    <Skeleton w="45%" h={14} />
                    <Skeleton h={12} style={{ marginTop: 14 }} />
                    <Skeleton w="85%" h={12} style={{ marginTop: 8 }} />
                    <Skeleton w="65%" h={12} style={{ marginTop: 8 }} />
                </View>
            ))}
        </View>
    );
}

export default function BriefingScreen() {
    const navigation = useNavigation();
    const [kind, setKind] = useState<BriefingKind>(defaultKind);
    // Each kind keeps its last result, so switching back shows it instantly.
    const [slots, setSlots] = useState<Record<BriefingKind, Slot>>({ premarket: EMPTY, postmarket: EMPTY });
    const [refreshing, setRefreshing] = useState(false);
    const [building, setBuilding] = useState<BriefingKind | null>(null);
    const reqIds = useRef<Record<BriefingKind, number>>({ premarket: 0, postmarket: 0 });

    const patch = (k: BriefingKind, p: Partial<Slot>) => setSlots(s => ({ ...s, [k]: { ...s[k], ...p } }));

    const load = useCallback(async (k: BriefingKind) => {
        const id = ++reqIds.current[k];
        patch(k, { loading: true, error: null });
        try {
            const data = await getBriefing(k);
            if (id === reqIds.current[k]) patch(k, { data, loading: false });
        } catch (e: any) {
            if (id === reqIds.current[k]) patch(k, { error: e?.message || 'Request failed', loading: false });
        }
    }, []);

    // Refetch on focus and when the toggle changes.
    useFocusEffect(useCallback(() => { load(kind); }, [load, kind]));

    const onRefresh = async () => {
        setRefreshing(true);
        await load(kind);
        setRefreshing(false);
    };

    const build = async () => {
        if (building) return;
        const k = kind;
        haptic.light();
        setBuilding(k);
        try {
            const b = await runBriefing(k);
            if (b && Array.isArray(b.sections)) {
                ++reqIds.current[k];   // a slower in-flight fetch must not overwrite the fresh one
                patch(k, { data: b, error: null, loading: false });
            } else {
                await load(k);
            }
            haptic.success();
            toast.success(`${LABELS[k]} briefing built`, 'Not sent to Telegram.');
        } catch (e: any) {
            haptic.error();
            toast.error("Couldn't build the briefing", e?.message || 'Request failed');
        } finally {
            setBuilding(null);
        }
    };

    const slot = slots[kind];
    const data = slot.data && slot.data.kind && slot.data.kind !== kind ? null : slot.data;
    const generated = serverDate(data?.generated_at);
    const sections = (Array.isArray(data?.sections) ? data!.sections : []).filter(s => s && typeof s === 'object');
    const isBuilding = building === kind;
    const KindIcon = kind === 'premarket' ? Sunrise : Sunset;

    const buildButton = (
        <Pressable onPress={build} disabled={!!building} accessibilityRole="button"
            accessibilityLabel={`Build the ${LABELS[kind].toLowerCase()} briefing now`} accessibilityState={{ busy: isBuilding, disabled: !!building }}
            className="flex-row items-center justify-center py-3 rounded-full bg-primary/10 border border-primary/30 active:opacity-70"
            style={{ opacity: building ? 0.6 : 1 }}>
            {isBuilding ? <ActivityIndicator size="small" color={colors.primary} /> : <RefreshCw size={14} color={colors.primary} />}
            <Text className="text-primary font-bold text-[13px] ml-2">{isBuilding ? 'Building…' : 'Build now'}</Text>
        </Pressable>
    );

    let body: React.ReactNode;
    if (slot.loading && !slot.data && !slot.error) {
        body = <LoadingSkeleton />;
    } else if (slot.error && !data) {
        body = <ErrorState title="Couldn't load the briefing" body={slot.error} onRetry={() => load(kind)} />;
    } else if (!data) {
        body = (
            <View>
                <EmptyState icon={<KindIcon size={24} color={colors.textMuted} />}
                    title={`No ${LABELS[kind].toLowerCase()} briefing yet`}
                    body={`Sent at ${SCHEDULE[kind]} IST on trading days.`} />
                {buildButton}
            </View>
        );
    } else {
        body = (
            <FadeIn key={`${kind}-${data.generated_at}`}>
                {!!slot.error && (
                    <Pressable onPress={() => load(kind)} accessibilityRole="button" className="mb-3">
                        <Text className="text-error text-xs font-bold">Refresh failed ({slot.error}). Tap to retry.</Text>
                    </Pressable>
                )}
                <Text className="text-text-primary font-black text-xl leading-7">{data.title || `${LABELS[kind]} briefing`}</Text>
                <Text className="text-text-muted text-xs font-semibold mt-1">
                    {[dayLabel(data.day), generated ? `built ${istWhen(generated)}` : null].filter(Boolean).join(' · ')}
                </Text>

                {sections.length === 0 ? (
                    <View className="bg-surface rounded-3xl border border-border mt-5">
                        <EmptyState icon={<Newspaper size={24} color={colors.textMuted} />} title="Nothing in this briefing" />
                    </View>
                ) : sections.map((s, i) => {
                    const lines = (Array.isArray(s.lines) ? s.lines : []).filter(l => l != null && String(l).trim() !== '');
                    return (
                        <View key={`${s.title}-${i}`} className="bg-surface rounded-3xl border border-border p-5 mt-5">
                            <Text accessibilityRole="header" className="text-text-primary font-black text-[15px]">{s.title || 'Section'}</Text>
                            {lines.length === 0 && !s.note && <Text className="text-text-muted text-xs mt-2">Nothing to report.</Text>}
                            {lines.map((l, j) => (
                                <View key={j} className="flex-row mt-2">
                                    <Text className="text-text-muted text-[13px] leading-5 mr-2">•</Text>
                                    <Text className="text-text-secondary text-[13px] leading-5 flex-1">{String(l)}</Text>
                                </View>
                            ))}
                            {!!s.note && <Text className="text-text-muted text-[11px] leading-4 mt-3">{s.note}</Text>}
                        </View>
                    );
                })}

                <View className="mt-6">{buildButton}</View>
                <Text className="text-text-muted text-[11px] font-semibold text-center mt-3 leading-4">
                    Informational only — briefings change no orders or settings.
                </Text>
            </FadeIn>
        );
    }

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />
            <ScreenHeader
                title="Briefing"
                subtitle={`${LABELS[kind]} · ${SCHEDULE[kind]} IST on trading days`}
                onBack={() => navigation.goBack()}
                compact
                right={<IconButton label="Reload briefing" onPress={() => load(kind)}><RefreshCw size={18} color={colors.primary} /></IconButton>}
            />
            <View className="px-5 pb-3">
                <Segmented options={KINDS} value={kind} onChange={setKind} labels={LABELS} />
            </View>
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
            >
                {body}
            </ScrollView>
        </View>
    );
}
