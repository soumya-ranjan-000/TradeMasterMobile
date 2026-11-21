import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StatusBar, Pressable } from 'react-native';
import { Bell, Trash2, ListPlus, ScanLine } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TEST_USER_ID } from '../config';
import { paperFetch } from '../auth';
import { getMarketStatus, getMarketSession, isHolidayToday, nextMarketOpen } from '../api';
import MarketPulse from '../components/MarketPulse';
import TradingStatusPanel from '../components/TradingStatusPanel';
import { useNavigation, CompositeNavigationProp, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMarketData } from '../context/MarketDataContext';
import { IconButton, Segmented, Skeleton, SkeletonRow, EmptyState, FadeIn, confirmAction } from '../ui';
import { haptic } from '../haptics';
import { colors, signColor } from '../theme';
import { inr, pct, ago, bareSymbol, istDayLabel } from '../format';

interface ProfileData {
    full_name: string;
    email?: string;
    profile_pic?: string;
}
interface Quote { price: number; change: number }

type DashboardScreenNavigationProp = CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Dashboard'>,
    NativeStackNavigationProp<RootStackParamList>
>;

const TABS = ['Watchlists', 'Market', 'Events'] as const;
type Tab = typeof TABS[number];
/** Last prices seen, so the list shows numbers instantly while the live fetch runs (~5 s on Render). */
const QUOTE_CACHE_KEY = 'WATCHLIST_QUOTES_V1';

const greeting = () => {
    // IST hour without Intl.
    const h = new Date(Date.now() + 330 * 60_000).getUTCHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const DashboardScreen = () => {
    const navigation = useNavigation<DashboardScreenNavigationProp>();
    const insets = useSafeAreaInsets();
    // Empty until the saved account loads, so nothing is fetched for the test account first.
    const [userId, setUserId] = useState<string>('');
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [marketStatus, setMarketStatus] = useState<{ is_open: boolean; halted?: boolean; message: string } | null>(null);
    // YYYY-MM-DD of the next NSE session (market pulse), for "opens Mon 9:15".
    const [nextSession, setNextSession] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState<Tab>('Watchlists');
    const [watchlists, setWatchlists] = useState<any[]>([]);
    const [watchLoading, setWatchLoading] = useState(false);
    const [cached, setCached] = useState<{ at: number; quotes: Record<string, Quote> } | null>(null);
    const [pricesAt, setPricesAt] = useState<number | null>(null);
    const [, setTick] = useState(0);
    useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 30_000); return () => clearInterval(id); }, []);
    const isFocused = useIsFocused();
    const { ticks, subscribe, unsubscribe } = useMarketData();

    const fetchProfile = async (id: string = userId) => {
        try {
            const res = await paperFetch(`/profile/${id}`);
            if (res.ok) setProfile(await res.json());
        } catch (error) {
            console.error("Failed to fetch profile:", error);
        }
    };

    // Live quotes from the market data context, keyed by bare symbol.
    const liveQuotes = React.useMemo(() => {
        const quotes: Record<string, Quote> = {};
        watchlists.forEach(wl => {
            wl.symbols.forEach((sym: string) => {
                const code = bareSymbol(sym);
                const tick = ticks[`NSE:${code}`] || ticks[`NSE:${sym.toUpperCase()}`] || ticks[sym.toUpperCase()];
                if (tick && tick.ltp > 0) quotes[code] = { price: tick.ltp, change: tick.day_change_perc ?? 0 };
            });
        });
        return quotes;
    }, [watchlists, ticks]);

    useEffect(() => {
        AsyncStorage.getItem(QUOTE_CACHE_KEY).then(raw => { if (raw) setCached(JSON.parse(raw)); }).catch(() => { });
    }, []);
    // The quote cache is for the next cold start, so it's written at most every 30s
    // (and when leaving the screen), not on every tick.
    const pendingCache = React.useRef<{ at: number; quotes: Record<string, Quote> } | null>(null);
    const lastCacheWrite = React.useRef(0);
    const writeCache = React.useCallback(() => {
        const next = pendingCache.current;
        if (!next) return;
        pendingCache.current = null;
        lastCacheWrite.current = Date.now();
        setPricesAt(next.at);
        AsyncStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(next)).catch(() => { });
    }, []);
    useEffect(() => {
        if (!Object.keys(liveQuotes).length) return;
        pendingCache.current = { at: Date.now(), quotes: { ...(cached?.quotes || {}), ...liveQuotes } };
        if (Date.now() - lastCacheWrite.current >= 30_000) writeCache();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveQuotes]);
    useEffect(() => {
        if (!isFocused) writeCache();
    }, [isFocused, writeCache]);

    const fetchWatchlists = async (id: string = userId) => {
        try {
            setWatchLoading(true);
            const res = await paperFetch(`/watchlists/${id}`);
            const data = await res.json();
            setWatchlists(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch watchlists:", error);
        } finally {
            setWatchLoading(false);
        }
    };

    const fetchMarketStatus = async () => {
        try {
            const [status, session] = await Promise.all([getMarketStatus(), getMarketSession()]);
            // The clock-based status does not know exchange holidays; the pulse does.
            const holiday = !status.halted && status.is_open && isHolidayToday(session);
            setMarketStatus(holiday ? { ...status, is_open: false, message: 'Market Closed' } : status);
            setNextSession(session?.next_session ?? null);
        } catch (e) {
            console.log("Failed to fetch market status");
        }
    };

    const deleteWatchlist = (watchlistId: string, name: string, count: number) => {
        if (!watchlistId) return;
        confirmAction('Delete watchlist', `Delete "${name}" (${count} ${count === 1 ? 'stock' : 'stocks'})? This can't be undone.`, 'Delete', async () => {
            try {
                const res = await paperFetch(`/watchlists/${userId}/${watchlistId}`, {
                    method: 'DELETE', headers: { 'Accept': 'application/json' },
                });
                if (res.ok) fetchWatchlists(userId);
            } catch (error) {
                console.error("Failed to delete watchlist:", error);
            }
        }, true);
    };

    const removeFromWatchlist = (watchlistId: string, listName: string, symbol: string) => {
        confirmAction('Remove stock', `Remove ${bareSymbol(symbol)} from "${listName}"?`, 'Remove', async () => {
            try {
                const res = await paperFetch(`/watchlists/remove`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, watchlist_id: watchlistId, symbol }),
                });
                if (res.ok) fetchWatchlists(userId);
            } catch (error) {
                console.error("Failed to remove stock:", error);
            }
        }, true);
    };

    useEffect(() => {
        if (isFocused && userId) fetchWatchlists(userId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocused, userId]);

    const subscribedWatchlistSymbols = React.useRef<Set<string>>(new Set());

    useEffect(() => {
        if (isFocused && activeCategory === 'Watchlists' && watchlists.length > 0) {
            const allSymbols = new Set<string>();
            watchlists.forEach(wl => wl.symbols?.forEach((sym: string) => allSymbols.add(sym)));
            allSymbols.forEach(sym => {
                if (!subscribedWatchlistSymbols.current.has(sym)) {
                    subscribe(sym);
                    subscribedWatchlistSymbols.current.add(sym);
                }
            });
            return () => {
                subscribedWatchlistSymbols.current.forEach(sym => unsubscribe(sym));
                subscribedWatchlistSymbols.current.clear();
            };
        } else if (subscribedWatchlistSymbols.current.size > 0) {
            subscribedWatchlistSymbols.current.forEach(sym => unsubscribe(sym));
            subscribedWatchlistSymbols.current.clear();
        }
    }, [isFocused, activeCategory, watchlists, subscribe, unsubscribe]);

    useEffect(() => {
        const init = async () => {
            const savedId = await AsyncStorage.getItem('USER_ID');
            const finalId = savedId || TEST_USER_ID;
            setUserId(finalId);  // the focus effect above then loads the watchlists once
            fetchProfile(finalId);
            fetchMarketStatus();
        };
        init();
        const timer = setInterval(fetchMarketStatus, 300000); // 5 minutes
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        Promise.all([fetchProfile(userId), fetchWatchlists(userId), fetchMarketStatus()]).finally(() => setRefreshing(false));
    };

    const fullName = (profile?.full_name || 'Trader').trim();
    const first = fullName.split(/\s+/)[0];
    const firstName = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    const initials = fullName.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const statusColor = !marketStatus ? colors.textMuted : marketStatus.halted ? colors.warning : marketStatus.is_open ? colors.success : colors.error;
    const statusText = !marketStatus ? 'Checking market…' : marketStatus.halted ? 'Trading halted' : marketStatus.is_open ? 'Market open' : 'Market closed';
    // Closed (not halted): say when it reopens, e.g. "Closed · opens Mon 9:15" / "Closed · opens 9:15".
    const opensAt = marketStatus && !marketStatus.halted && !marketStatus.is_open ? nextMarketOpen(nextSession) : null;
    const opensDay = opensAt ? istDayLabel(opensAt) : '';
    const badgeText = opensAt
        ? `Closed · opens ${opensDay ? `${opensDay} ` : ''}9:15`
        : statusText.replace('Market ', '').replace(/^./, c => c.toUpperCase());
    const badgeLabel = opensAt ? `Market closed, opens ${opensDay ? `${opensDay} ` : 'today '}at 9:15 AM` : statusText;
    const anyLive = Object.keys(liveQuotes).length > 0;

    const renderStock = (wl: any, sym: string) => {
        const code = bareSymbol(sym);
        const live = liveQuotes[code];
        const quote = live || cached?.quotes?.[code];
        const stale = !live && !!quote;
        const tint = quote && quote.change !== 0 ? signColor(quote.change) : colors.primary;
        return (
            <Pressable
                key={sym}
                onPress={() => navigation.navigate('StockDetail', { symbol: sym })}
                onLongPress={() => { haptic.light(); removeFromWatchlist(wl._id || wl.id, wl.name, sym); }}
                delayLongPress={450}
                accessibilityRole="button"
                accessibilityLabel={`${code}${quote ? `, ${inr(quote.price)}, ${pct(quote.change)}` : ''}`}
                accessibilityHint="Opens the stock. Long-press to remove it from this watchlist."
                className="bg-surface px-4 py-3.5 rounded-3xl border border-border mb-2.5 flex-row items-center active:opacity-80"
            >
                <View className="w-11 h-11 rounded-2xl items-center justify-center mr-3" style={{ backgroundColor: `${tint}1A` }}>
                    <Text className="font-black text-lg" style={{ color: tint }}>{code[0]}</Text>
                </View>
                <View className="flex-1 mr-3">
                    <Text className="text-text-primary font-black text-base" numberOfLines={1}>{code}</Text>
                    <Text className="text-text-muted text-xs font-semibold mt-0.5">NSE · Equity</Text>
                </View>
                <View className="items-end shrink-0" style={{ opacity: stale ? 0.6 : 1 }}>
                    {quote ? (
                        <>
                            <Text className="text-text-primary font-bold text-base" style={{ fontVariant: ['tabular-nums'] }}>{inr(quote.price)}</Text>
                            <View className="px-1.5 py-0.5 rounded-md mt-1" style={{ backgroundColor: `${signColor(quote.change)}1F` }}>
                                <Text className="text-xs font-bold" style={{ color: signColor(quote.change), fontVariant: ['tabular-nums'] }}>{pct(quote.change)}</Text>
                            </View>
                        </>
                    ) : (
                        <>
                            <Skeleton w={78} h={15} />
                            <Skeleton w={48} h={12} style={{ marginTop: 7 }} />
                        </>
                    )}
                </View>
            </Pressable>
        );
    };

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" backgroundColor={colors.background} />

            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
                stickyHeaderIndices={[1]}
            >
                {/* Header: who, market state, alerts */}
                <View className="flex-row items-center px-5 pb-4" style={{ paddingTop: Math.max(insets.top, 12) + 14 }}>
                    <Pressable onPress={() => navigation.navigate('Profile')} accessibilityRole="button" accessibilityLabel="Open profile"
                        className="flex-row items-center flex-1 mr-3 active:opacity-70">
                        <View className="w-11 h-11 rounded-full bg-surface border border-border items-center justify-center mr-3">
                            <Text className="text-text-primary font-black text-[15px]">{initials}</Text>
                        </View>
                        <View className="flex-1">
                            <Text className="text-text-muted text-[13px] font-semibold" numberOfLines={1}>{greeting()}</Text>
                            <Text className="text-text-primary font-black text-xl" numberOfLines={1}>{firstName}</Text>
                        </View>
                    </Pressable>
                    <View className="flex-row items-center px-2.5 py-1.5 rounded-full mr-2 border" accessibilityLabel={badgeLabel}
                        style={{ borderColor: `${statusColor}55`, backgroundColor: `${statusColor}14` }}>
                        <View className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: statusColor }} />
                        <Text className="text-xs font-bold" style={{ color: statusColor }} numberOfLines={1}>{badgeText}</Text>
                    </View>
                    <View className="mr-2">
                        <IconButton label="Log in to TradeMaster Web: scan QR code" onPress={() => navigation.navigate('ScanLogin')}>
                            <ScanLine size={20} color={colors.textPrimary} />
                        </IconButton>
                    </View>
                    <IconButton label="Alerts" onPress={() => navigation.navigate('Alerts')}>
                        <Bell size={20} color={colors.primary} />
                    </IconButton>
                </View>
                <View className="px-5 pt-1 pb-3 bg-background">
                    <Segmented options={TABS} value={activeCategory} onChange={setActiveCategory} />
                </View>

                {activeCategory === 'Watchlists' && (
                    <FadeIn key="w"><View className="px-5 pt-1 pb-10">
                        {watchLoading && watchlists.length === 0 ? (
                            <>
                                <Skeleton w={120} h={18} style={{ marginBottom: 14, marginTop: 6 }} />
                                {[0, 1, 2, 3].map(i => <SkeletonRow key={i} />)}
                            </>
                        ) : watchlists.length > 0 ? (
                            <>
                                {anyLive && pricesAt ? (
                                    <Text className="text-text-muted text-xs font-semibold mb-2">Prices updated {ago(pricesAt)} · pull down to refresh</Text>
                                ) : cached ? (
                                    <Text className="text-text-muted text-xs font-semibold mb-2">Last prices from {ago(cached.at)} · updating…</Text>
                                ) : null}
                                {watchlists.map(wl => (
                                    <View key={wl._id || wl.id} className="mb-6">
                                        <View className="flex-row justify-between items-center mb-3 mt-1">
                                            <View>
                                                <Text className="text-lg font-black text-text-primary">{wl.name}</Text>
                                                <Text className="text-text-muted text-xs font-semibold">{wl.symbols.length} {wl.symbols.length === 1 ? 'stock' : 'stocks'}</Text>
                                            </View>
                                            <IconButton label={`Delete watchlist ${wl.name}`} onPress={() => deleteWatchlist(wl._id || wl.id, wl.name, wl.symbols.length)}>
                                                <Trash2 size={17} color={colors.textMuted} />
                                            </IconButton>
                                        </View>
                                        {wl.symbols.length > 0
                                            ? wl.symbols.map((sym: string) => renderStock(wl, sym))
                                            : (
                                                <View className="p-6 rounded-3xl border border-dashed border-border items-center">
                                                    <Text className="text-text-muted font-semibold text-[13px]">No stocks yet. Add them from a stock's page.</Text>
                                                </View>
                                            )}
                                    </View>
                                ))}
                                <Text className="text-text-muted text-xs text-center mt-1">Long-press a stock to remove it.</Text>
                            </>
                        ) : (
                            <EmptyState
                                icon={<ListPlus size={24} color={colors.textMuted} />}
                                title="No watchlists yet"
                                body="Open any stock from Search and tap + to start a watchlist."
                                action="Search stocks"
                                onAction={() => navigation.navigate('Watchlist')}
                            />
                        )}
                    </View></FadeIn>
                )}

                {activeCategory === 'Market' && (
                    <FadeIn key="m"><View className="px-5 pt-1 pb-8">
                        <MarketPulse active={isFocused && activeCategory === 'Market'} />
                    </View></FadeIn>
                )}
                {activeCategory === 'Events' && (
                    <FadeIn key="e"><View className="px-5 pt-1 pb-8">
                        <TradingStatusPanel active={isFocused && activeCategory === 'Events'} />
                    </View></FadeIn>
                )}
            </ScrollView>
        </View>
    );
};

export default DashboardScreen;
