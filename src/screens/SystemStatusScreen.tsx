/**
 * System status: health of every TradeMaster service, the phone version of the
 * web's "System Status" drawer (TradeMasterFrontend components/dashboard/SystemStatus.tsx).
 *
 * The backend runs the checks (GET /api/v1/system/status, cached 60 s). If the
 * backend can't be reached, that is the headline, and below it the phone pings
 * each service's public /health itself so the others are still visible.
 *
 * Checking wakes sleeping free-plan Render services and spends their free
 * hours, so the screen checks only while it is open and the app is in front:
 * once on opening, then every 60 s. Re-check / pull down forces a fresh round.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StatusBar, Pressable, ActivityIndicator, Linking } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { ExternalLink, RefreshCw } from '../icons';
import { getSystemStatus, getFallbackSystemStatus, ServiceState, SystemStatus } from '../api';
import { serverDate } from '../auth';
import { useAppActive } from '../appState';
import { ScreenHeader, Skeleton, ErrorState, FadeIn } from '../ui';
import { colors } from '../theme';
import { ago, istClock } from '../format';
import { haptic } from '../haptics';
import { toast } from '../components/Toast';

const POLL_MS = 60_000;

type Key = ServiceState | 'unknown' | 'unreachable';
export const STATUS_LOOK: Record<Key, { label: string; color: string }> = {
    ok: { label: 'Operational', color: colors.success },
    degraded: { label: 'Degraded', color: colors.warning },
    down: { label: 'Down', color: colors.error },
    sleeping: { label: 'Sleeping', color: colors.textMuted },
    unconfigured: { label: 'Not configured', color: colors.textMuted },
    unknown: { label: 'Not checked', color: colors.textMuted },
    unreachable: { label: 'Backend unreachable', color: colors.error },
};

function Badge({ k }: { k: Key }) {
    const s = STATUS_LOOK[k] ?? STATUS_LOOK.unknown;
    return (
        <View className="px-2.5 py-1 rounded-full border" style={{ borderColor: `${s.color}55`, backgroundColor: `${s.color}14` }}>
            <Text className="text-[11px] font-black uppercase tracking-wider" style={{ color: s.color }} numberOfLines={1}>{s.label}</Text>
        </View>
    );
}

/** "All 5 operational" / "1 degraded · 4 operational". */
function countsLine(data: SystemStatus): string {
    const order: ServiceState[] = ['down', 'degraded', 'sleeping', 'unconfigured', 'ok'];
    const n = data.services.length;
    const counts = order
        .map(st => [st, data.services.filter(s => s.state === st).length] as const)
        .filter(([, c]) => c > 0);
    if (counts.length === 1 && counts[0][0] === 'ok') return `All ${n} services operational`;
    return counts.map(([st, c]) => `${c} ${STATUS_LOOK[st].label.toLowerCase()}`).join(' · ');
}

function LoadingSkeleton() {
    return (
        <View>
            <View className="bg-surface rounded-3xl border border-border p-5">
                <Skeleton w={120} h={22} r={11} />
                <Skeleton w="60%" h={12} style={{ marginTop: 12 }} />
            </View>
            {[0, 1, 2, 3, 4].map(i => (
                <View key={i} className="bg-surface rounded-3xl border border-border p-4 mt-3">
                    <Skeleton w="50%" h={14} />
                    <Skeleton w="35%" h={10} style={{ marginTop: 8 }} />
                    <Skeleton w="80%" h={11} style={{ marginTop: 14 }} />
                </View>
            ))}
        </View>
    );
}

export default function SystemStatusScreen() {
    const navigation = useNavigation();
    const isFocused = useIsFocused();
    const appActive = useAppActive();
    const [data, setData] = useState<SystemStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const inFlight = useRef(false);

    const load = useCallback(async (refresh = false) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setLoading(true);
        try {
            setData(await getSystemStatus(refresh));
            setError(null);
        } catch (e: any) {
            // The backend runs the real checks, so its failure IS the headline;
            // the phone's own /health pings keep the other services visible.
            setError(e?.message || 'Request failed');
            try {
                setData(await getFallbackSystemStatus());
            } catch {
                setData(null);
            }
        } finally {
            inFlight.current = false;
            setLoading(false);
        }
    }, []);

    // Check on opening and every minute while open and in front; stop otherwise.
    useEffect(() => {
        if (!isFocused || !appActive) return;
        load();
        const id = setInterval(() => load(), POLL_MS);
        return () => clearInterval(id);
    }, [isFocused, appActive, load]);

    const recheck = async () => {
        haptic.light();
        await load(true);
    };

    const onPull = async () => {
        setRefreshing(true);
        await load(true);
        setRefreshing(false);
    };

    const openLink = (url: string) => {
        Linking.openURL(url).catch(() => toast.error("Couldn't open the link", url));
    };

    const overall: Key = error ? 'unreachable' : data ? data.overall : 'unknown';
    const checked = serverDate(data?.checked_at);

    let body: React.ReactNode;
    if (!data && !error) {
        body = <LoadingSkeleton />;
    } else if (!data) {
        body = (
            <ErrorState title="Can't reach the backend" onRetry={() => load(true)}
                body={`${error}. Nothing else can be checked until it answers.`} />
        );
    } else {
        body = (
            <FadeIn>
                {/* Summary */}
                <View className="bg-surface rounded-3xl border border-border p-5">
                    <View className="flex-row items-center justify-between">
                        <Badge k={overall} />
                        <Pressable onPress={recheck} disabled={loading} accessibilityRole="button"
                            accessibilityLabel="Re-check every service" accessibilityState={{ busy: loading, disabled: loading }}
                            hitSlop={8}
                            className="flex-row items-center px-3 py-1.5 rounded-full border border-border active:opacity-70"
                            style={{ opacity: loading ? 0.6 : 1 }}>
                            {loading ? <ActivityIndicator size="small" color={colors.textMuted} style={{ transform: [{ scale: 0.7 }] }} />
                                : <RefreshCw size={13} color={colors.textMuted} />}
                            <Text className="text-text-muted text-xs font-bold uppercase tracking-wider ml-1.5">Re-check</Text>
                        </Pressable>
                    </View>
                    <Text className="text-text-primary font-black text-lg mt-3">{error ? 'Backend unreachable' : countsLine(data)}</Text>
                    {checked && (
                        <Text className="text-text-muted text-xs font-semibold mt-1">
                            {data.fallback ? 'Basic check' : 'Checked'} {istClock(checked)} IST · {ago(checked)}
                        </Text>
                    )}
                </View>

                {!!error && (
                    <View className="mt-3 px-4 py-3 rounded-2xl border" style={{ borderColor: `${colors.error}55`, backgroundColor: `${colors.error}14` }}>
                        <Text className="text-[13px] leading-5" style={{ color: colors.error }}>
                            Can't reach the backend ({error}).{' '}
                            {data.fallback
                                ? 'Below: basic up/down checks from this phone. No deep checks (ICICI session, calendar data, scanner) until the backend answers.'
                                : 'Nothing else can be checked until it answers.'}
                        </Text>
                    </View>
                )}

                {!data.active_window && (
                    <Text className="text-text-muted text-xs leading-5 mt-3 px-1">
                        Outside market hours. Free Render services sleep when idle; a check wakes them (30-60 s), so
                        “Sleeping” services answer on the next re-check.
                    </Text>
                )}

                {/* One card per service */}
                {data.services.map(svc => {
                    const s = STATUS_LOOK[svc.state] ?? STATUS_LOOK.unknown;
                    return (
                        <View key={svc.key} className="bg-surface rounded-3xl border border-border p-4 mt-3"
                            accessible accessibilityLabel={`${svc.name}: ${s.label}. ${svc.detail}`}>
                            <View className="flex-row items-start justify-between">
                                <View className="flex-1 mr-3">
                                    <View className="flex-row items-center">
                                        <View className="w-2 h-2 rounded-full mr-2.5" style={{ backgroundColor: s.color }} />
                                        <Text className="text-text-primary font-black text-[15px] flex-1" numberOfLines={1}>{svc.name}</Text>
                                    </View>
                                    <Text className="text-text-muted text-xs mt-0.5 ml-[18px]" numberOfLines={1}>{svc.role}</Text>
                                </View>
                                <Badge k={svc.state} />
                            </View>
                            {!!svc.detail && (
                                <Text className="text-[13px] leading-5 mt-2.5 ml-[18px]"
                                    style={{ color: svc.state === 'ok' ? colors.textSecondary : colors.textPrimary }}>
                                    {svc.detail}
                                </Text>
                            )}
                            {!!svc.dashboard_url && (
                                <Pressable onPress={() => openLink(svc.dashboard_url!)} accessibilityRole="link"
                                    accessibilityLabel={`Open ${svc.name} ${svc.dashboard_label}`} hitSlop={8}
                                    className="flex-row items-center self-start mt-2.5 ml-[18px] py-1 active:opacity-70">
                                    <Text className="text-[13px] font-bold" style={{ color: colors.blue }}>{svc.dashboard_label}</Text>
                                    <ExternalLink size={13} color={colors.blue} style={{ marginLeft: 5 }} />
                                </Pressable>
                            )}
                        </View>
                    );
                })}

                <Text className="text-text-muted text-[11px] font-semibold text-center mt-5 leading-4">
                    Checks update every minute while this screen is open.
                </Text>
            </FadeIn>
        );
    }

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />
            <ScreenHeader
                title="System status"
                subtitle="Health of every TradeMaster service"
                onBack={() => navigation.goBack()}
                compact
            />
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 48 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} tintColor={colors.primary} colors={[colors.primary]} />}
            >
                {body}
            </ScrollView>
        </View>
    );
}
