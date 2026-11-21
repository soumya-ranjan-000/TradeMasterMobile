import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, TextInput, ActivityIndicator, StatusBar, Platform, RefreshControl } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Bell, BellPlus, BellRing, Trash2, Smartphone } from 'lucide-react-native';
import { ScreenHeader, IconButton, SectionLabel, EmptyState, confirmAction } from '../ui';
import { colors } from '../theme';
import { haptic } from '../haptics';
import { inr, istDateTime, bareSymbol } from '../format';
import { API_URL, TEST_USER_ID } from '../config';
import { searchSymbols } from '../api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLivePrice } from '../context/MarketDataContext';

import { useAlerts } from '../context/AlertContext';

const AlertsScreen = () => {
    const navigation = useNavigation();
    const { alerts, loading: contextLoading, createAlert, toggleAlert, deleteAlert, refreshAlerts } = useAlerts();
    const [pulling, setPulling] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // New Alert State
    const [showAddAlert, setShowAddAlert] = useState(false);
    const [newSymbol, setNewSymbol] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [condition, setCondition] = useState('Above');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Symbol picked from the results. The live price (for validation) is only
    // subscribed for a picked symbol, or for typed text that matches a search
    // result exactly, not for every partial string typed.
    const [chosenSymbol, setChosenSymbol] = useState<string | null>(null);
    const priceSymbol = useMemo(() => {
        const typed = newSymbol.trim().toUpperCase();
        if (!typed) return undefined;
        if (chosenSymbol && newSymbol === chosenSymbol) return newSymbol;
        return searchResults.some(r => String(r.symbol || '').toUpperCase() === typed) ? newSymbol : undefined;
    }, [newSymbol, chosenSymbol, searchResults]);

    // Get live price for the selected symbol for validation
    const liveTick = useLivePrice(priceSymbol);
    const currentPrice = liveTick?.ltp || 0;

    // Debounced search; only the latest request's response is applied.
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchSeq = useRef(0);
    useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

    const cancelSearch = () => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = null;
        searchSeq.current++;
        setSearchLoading(false);
    };

    const handleSearch = (text: string) => {
        setNewSymbol(text);
        cancelSearch();
        if (text.length < 2) {
            setSearchResults([]);
            return;
        }

        setSearchLoading(true);
        const seq = searchSeq.current;
        searchTimer.current = setTimeout(async () => {
            searchTimer.current = null;
            try {
                const data = await searchSymbols(text);
                if (seq === searchSeq.current) setSearchResults(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error("Symbol search failed:", error);
            } finally {
                if (seq === searchSeq.current) setSearchLoading(false);
            }
        }, 250);
    };

    const selectSymbol = (symbol: string) => {
        cancelSearch();
        setChosenSymbol(symbol);
        setNewSymbol(symbol);
        setSearchResults([]);
    };

    const handleToggle = async (id: string, currentStatus: boolean) => {
        haptic.light();
        await toggleAlert(id, !currentStatus);
    };

    const handleDelete = (id: string, symbol: string) => {
        confirmAction('Delete alert', `Remove the price alert for ${bareSymbol(symbol)}?`, 'Delete', () => deleteAlert(id), true);
    };

    const handleCreate = async () => {
        setFormError(null);
        if (!newSymbol || !newPrice) {
            setFormError('Pick a stock and enter a trigger price.');
            return;
        }

        const triggerVal = parseFloat(newPrice);

        // Logic Improvement: Validate condition against current price
        if (currentPrice > 0) {
            if (condition === 'Above' && triggerVal <= currentPrice) {
                setFormError(`For "Above", the trigger must be higher than the current price (${inr(currentPrice)}).`);
                return;
            }
            if (condition === 'Below' && triggerVal >= currentPrice) {
                setFormError(`For "Below", the trigger must be lower than the current price (${inr(currentPrice)}).`);
                return;
            }
        }

        try {
            setSubmitting(true);
            const success = await createAlert(newSymbol, triggerVal, condition);

            if (success) {
                haptic.success();
                setShowAddAlert(false);
                cancelSearch();
                setNewSymbol('');
                setChosenSymbol(null);
                setNewPrice('');
                setSearchResults([]);
            } else {
                setFormError("Couldn't create the alert. Try again.");
            }
        } catch (error) {
            setFormError('Network error. Check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />

            <ScreenHeader
                title="Price alerts"
                subtitle={alerts.length ? `${alerts.filter(a => a.active && !a.isTriggered).length} watching · ${alerts.filter(a => a.isTriggered).length} triggered` : undefined}
                onBack={() => navigation.goBack()}
                compact
                right={<IconButton label={showAddAlert ? 'Close new alert form' : 'New alert'} tone="primary" onPress={() => { setShowAddAlert(!showAddAlert); setFormError(null); }}>
                    <BellPlus size={18} color={colors.background} />
                </IconButton>}
            />

            <ScrollView className="flex-1 px-5 pt-2" showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={pulling} tintColor={colors.primary}
                    onRefresh={() => { setPulling(true); refreshAlerts().finally(() => setPulling(false)); }} />}>
                {showAddAlert && (
                    <View className="bg-surface rounded-[32px] border border-primary/30 p-6 mb-8 shadow-2xl">
                        <Text className="text-lg font-black text-text-primary mb-6">Create Price Alert</Text>

                        <View className="gap-4">
                            <View>
                                <Text className="text-text-muted text-[11px] font-bold uppercase tracking-widest mb-2">Stock Symbol</Text>
                                <View className="relative">
                                    <TextInput
                                        className="bg-background border border-border p-4 rounded-xl text-text-primary font-bold"
                                        placeholder="Search Symbol (e.g. RELIANCE)"
                                        placeholderTextColor="#6B7280"
                                        value={newSymbol}
                                        onChangeText={handleSearch}
                                        autoCapitalize="characters"
                                    />
                                    {searchLoading && (
                                        <View className="absolute right-4 top-4">
                                            <ActivityIndicator size="small" color="#00E0A1" />
                                        </View>
                                    )}

                                    {searchResults.length > 0 && (
                                        <View className="absolute top-14 left-0 right-0 bg-surface border border-border rounded-xl z-50 shadow-2xl max-h-40">
                                            <ScrollView nestedScrollEnabled>
                                                {searchResults.map((item) => (
                                                    <TouchableOpacity
                                                        key={item.symbol}
                                                        className="p-4 border-b border-border"
                                                        onPress={() => selectSymbol(item.symbol)}
                                                    >
                                                        <Text className="text-text-primary font-bold">{item.symbol}</Text>
                                                        <Text className="text-text-muted text-[11px]">{item.description}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    )}
                                </View>

                                {currentPrice > 0 && (
                                    <View className="flex-row items-center mt-2 px-2">
                                        <View className="w-1.5 h-1.5 rounded-full bg-success mr-2" />
                                        <Text className="text-xs font-bold text-success">Current price {inr(currentPrice)}</Text>
                                    </View>
                                )}
                            </View>

                            <View className="flex-row gap-4">
                                <View className="flex-1">
                                    <Text className="text-text-muted text-[11px] font-bold uppercase tracking-widest mb-2">Condition</Text>
                                    <View className="flex-row bg-background rounded-xl p-1 border border-border">
                                        <TouchableOpacity
                                            onPress={() => setCondition('Above')}
                                            className={`flex-1 py-2 items-center rounded-lg ${condition === 'Above' ? 'bg-surface border border-border shadow-sm' : ''}`}
                                        >
                                            <Text className={`text-xs font-bold ${condition === 'Above' ? 'text-text-primary' : 'text-text-muted'}`}>Above</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setCondition('Below')}
                                            className={`flex-1 py-2 items-center rounded-lg ${condition === 'Below' ? 'bg-surface border border-border shadow-sm' : ''}`}
                                        >
                                            <Text className={`text-xs font-bold ${condition === 'Below' ? 'text-text-primary' : 'text-text-muted'}`}>Below</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View className="flex-1">
                                    <Text className="text-text-muted text-[11px] font-bold uppercase tracking-widest mb-2">Trigger Price</Text>
                                    <TextInput
                                        className="bg-background border border-border p-4 rounded-xl text-text-primary font-bold"
                                        placeholder="Price"
                                        placeholderTextColor="#6B7280"
                                        keyboardType="numeric"
                                        value={newPrice}
                                        onChangeText={setNewPrice}
                                    />
                                </View>
                            </View>

                            {!!formError && <Text className="text-error text-xs font-semibold">{formError}</Text>}
                            <TouchableOpacity
                                onPress={handleCreate}
                                disabled={submitting}
                                className={`py-4 rounded-2xl items-center mt-4 shadow-lg ${submitting ? 'bg-primary/50' : 'bg-primary shadow-primary/30'}`}
                            >
                                {submitting ? <ActivityIndicator size="small" color="white" /> : <Text className="text-background font-black text-[15px]">Create alert</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                <SectionLabel>Your alerts</SectionLabel>

                {contextLoading ? (
                    <ActivityIndicator color="#00E0A1" className="mt-10" />
                ) : alerts.length > 0 ? (
                    alerts.map((alert) => {
                        const tone = alert.isTriggered ? colors.success : alert.active ? colors.primary : colors.textMuted;
                        return (
                            <View key={alert.id}
                                className="bg-surface px-4 py-3.5 rounded-3xl border mb-2.5 flex-row items-center"
                                style={{ borderColor: alert.isTriggered ? `${colors.success}4D` : colors.border }}>
                                <View className="w-11 h-11 rounded-2xl items-center justify-center mr-3" style={{ backgroundColor: `${tone}1A` }}>
                                    {alert.isTriggered ? <BellRing size={19} color={tone} /> : <Bell size={19} color={tone} />}
                                </View>
                                <View className="flex-1 mr-2">
                                    <Text className="text-text-primary font-black text-base" numberOfLines={1}>{bareSymbol(alert.symbol)}</Text>
                                    {alert.isTriggered ? (
                                        <>
                                            <Text className="text-success text-xs font-bold mt-0.5" numberOfLines={1}>Triggered at {inr(alert.triggeredPrice)}</Text>
                                            <Text className="text-text-muted text-xs mt-0.5">{istDateTime(alert.triggeredAt)} IST</Text>
                                        </>
                                    ) : (
                                        <Text className="text-text-muted text-xs font-semibold mt-0.5" numberOfLines={1}>
                                            {alert.condition === 'Above' ? 'Rises above' : 'Falls below'} {inr(Number(alert.price))}{alert.active ? '' : ' · paused'}
                                        </Text>
                                    )}
                                </View>
                                {!alert.isTriggered && (
                                    <Switch
                                        accessibilityLabel={`${alert.active ? 'Pause' : 'Resume'} alert for ${bareSymbol(alert.symbol)}`}
                                        value={alert.active}
                                        onValueChange={() => handleToggle(alert.id, alert.active)}
                                        trackColor={{ false: colors.border, true: colors.primary }}
                                        thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : alert.active ? '#FFFFFF' : '#94A3B8'}
                                    />
                                )}
                                <View className="ml-2">
                                    <IconButton label={`Delete alert for ${bareSymbol(alert.symbol)}`} onPress={() => handleDelete(alert.id, alert.symbol)}>
                                        <Trash2 size={16} color={colors.textMuted} />
                                    </IconButton>
                                </View>
                            </View>
                        );
                    })
                ) : (
                    <EmptyState icon={<Bell size={24} color={colors.textMuted} />} title="No alerts yet"
                        body="Get notified when a stock crosses a price you choose." action="Create an alert"
                        onAction={() => setShowAddAlert(true)} />
                )}

                <View className="flex-row items-center px-1 mt-4 mb-16">
                    <Smartphone size={16} color={colors.textMuted} />
                    <Text className="text-text-muted text-xs ml-2 flex-1 leading-4">Alerts are checked on the server and arrive as push notifications, even when the app is closed.</Text>
                </View>

            </ScrollView>
        </View>
    );
};

export default AlertsScreen;
