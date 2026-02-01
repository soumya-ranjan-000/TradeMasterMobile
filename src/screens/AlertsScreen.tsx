import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, TextInput, Alert, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { ChevronLeft, Bell, BellPlus, Trash2, TrendingUp, AlertCircle, Clock, Smartphone } from 'lucide-react-native';
import { API_URL, BREEZE_API_URL, TEST_USER_ID } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useLivePrice } from '../context/MarketDataContext';

const AlertsScreen = () => {
    const navigation = useNavigation();
    const [userId, setUserId] = useState(TEST_USER_ID);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // New Alert State
    const [showAddAlert, setShowAddAlert] = useState(false);
    const [newSymbol, setNewSymbol] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [condition, setCondition] = useState('Above');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    // Get live price for the selected symbol for validation
    const liveTick = useLivePrice(newSymbol);
    const currentPrice = liveTick?.ltp || 0;

    const fetchAlerts = async () => {
        try {
            setLoading(true);
            const savedId = await AsyncStorage.getItem('USER_ID');
            const uid = savedId || TEST_USER_ID;
            setUserId(uid);

            const res = await fetch(`${API_URL}/alerts/${uid}`);
            if (res.ok) {
                const data = await res.json();
                setAlerts(data.map((a: any) => ({
                    id: a._id || a.id,
                    symbol: a.symbol,
                    price: a.price,
                    condition: a.condition,
                    active: a.active,
                    isTriggered: a.is_triggered,
                    triggeredAt: a.triggered_at,
                    triggeredPrice: a.triggered_price,
                    createdAt: a.created_at
                })));
            }
        } catch (error) {
            console.error("Failed to fetch alerts:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    const handleSearch = async (text: string) => {
        setNewSymbol(text);
        if (text.length < 2) {
            setSearchResults([]);
            return;
        }

        try {
            setSearchLoading(true);
            const res = await fetch(`${BREEZE_API_URL}/api/search?q=${text}`);
            const data = await res.json();
            setSearchResults(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Symbol search failed:", error);
        } finally {
            setSearchLoading(false);
        }
    };

    const selectSymbol = (symbol: string) => {
        setNewSymbol(symbol);
        setSearchResults([]);
    };

    const toggleAlert = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch(`${API_URL}/alerts`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    alert_id: id,
                    active: !currentStatus
                })
            });
            if (res.ok) {
                setAlerts(alerts.map(a => a.id === id ? { ...a, active: !currentStatus } : a));
            }
        } catch (error) {
            Alert.alert("Error", "Failed to toggle alert");
        }
    };

    const deleteAlert = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/alerts/${userId}/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                setAlerts(alerts.filter(a => a.id !== id));
            }
        } catch (error) {
            Alert.alert("Error", "Failed to delete alert");
        }
    };

    const createAlert = async () => {
        if (!newSymbol || !newPrice) {
            Alert.alert("Error", "Please fill all fields");
            return;
        }

        const triggerVal = parseFloat(newPrice);

        // Logic Improvement: Validate condition against current price
        if (currentPrice > 0) {
            if (condition === 'Above' && triggerVal <= currentPrice) {
                Alert.alert("Invalid Logic", `Trigger price must be GREATER than current price (₹${currentPrice.toFixed(2)}) for 'Above' condition.`);
                return;
            }
            if (condition === 'Below' && triggerVal >= currentPrice) {
                Alert.alert("Invalid Logic", `Trigger price must be LESS than current price (₹${currentPrice.toFixed(2)}) for 'Below' condition.`);
                return;
            }
        }

        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/alerts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    symbol: newSymbol.toUpperCase(),
                    price: triggerVal,
                    condition
                })
            });

            if (res.ok) {
                setShowAddAlert(false);
                setNewSymbol('');
                setNewPrice('');
                setSearchResults([]);
                fetchAlerts();
                Alert.alert("Success", "Alert set successfully");
            } else {
                const errData = await res.json();
                Alert.alert("Error", errData.detail || "Failed to create alert");
            }
        } catch (error) {
            Alert.alert("Error", "Network error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <LinearGradient
                colors={['#1C1F26', '#0E1116']}
                className="px-6 pt-12 pb-6 border-b border-border/30"
            >
                <View className="flex-row items-center justify-between">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 -ml-2 bg-white/5 rounded-full">
                        <ChevronLeft size={24} color="#E1E7ED" />
                    </TouchableOpacity>
                    <Text className="text-xl font-black text-text-primary">Smart Alerts</Text>
                    <TouchableOpacity
                        onPress={() => setShowAddAlert(!showAddAlert)}
                        className="p-2 bg-primary/10 rounded-full border border-primary/20"
                    >
                        <BellPlus size={20} color="#00E0A1" />
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
                {showAddAlert && (
                    <View className="bg-surface rounded-[32px] border border-primary/30 p-6 mb-8 shadow-2xl">
                        <Text className="text-lg font-black text-text-primary mb-6">Create Price Alert</Text>

                        <View className="gap-4">
                            <View>
                                <Text className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-2">Stock Symbol</Text>
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
                                                        <Text className="text-text-muted text-[10px]">{item.description}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    )}
                                </View>

                                {currentPrice > 0 && (
                                    <View className="flex-row items-center mt-2 px-2">
                                        <View className="w-1.5 h-1.5 rounded-full bg-success mr-2" />
                                        <Text className="text-[10px] font-bold text-success uppercase">Current Price: ₹{currentPrice.toFixed(2)}</Text>
                                    </View>
                                )}
                            </View>

                            <View className="flex-row gap-4">
                                <View className="flex-1">
                                    <Text className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-2">Condition</Text>
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
                                    <Text className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-2">Trigger Price</Text>
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

                            <TouchableOpacity
                                onPress={createAlert}
                                className="bg-primary py-4 rounded-2xl items-center mt-4 shadow-lg shadow-primary/30"
                            >
                                <Text className="text-white font-black uppercase tracking-widest">Set Alert</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                <View className="flex-row items-center mb-6">
                    <Text className="text-text-muted text-xs font-bold uppercase tracking-widest mr-2">Active Notifications</Text>
                    <View className="flex-1 h-px bg-border/50" />
                </View>

                {loading ? (
                    <ActivityIndicator color="#00E0A1" className="mt-10" />
                ) : alerts.length > 0 ? (
                    alerts.map((alert) => (
                        <View
                            key={alert.id}
                            className={`bg-surface p-5 rounded-[28px] border mb-4 flex-row items-center justify-between ${alert.isTriggered ? 'border-success/30 bg-success/5' : alert.active ? 'border-primary/20' : 'border-border'}`}
                        >
                            <View className="flex-row items-center flex-1">
                                <View className={`w-12 h-12 rounded-2xl items-center justify-center mr-4 ${alert.active ? 'bg-primary/10' : 'bg-background'}`}>
                                    <Bell size={20} color={alert.active ? "#00E0A1" : "#6B7280"} />
                                </View>
                                <View>
                                    <Text className="text-text-primary font-black text-lg">{alert.symbol}</Text>
                                    {alert.isTriggered ? (
                                        <View className="mt-1">
                                            <View className="flex-row items-center">
                                                <TrendingUp size={12} color="#10B981" />
                                                <Text className="text-success text-[10px] font-black ml-1 uppercase">Triggered @ ₹{alert.triggeredPrice?.toFixed(2)}</Text>
                                            </View>
                                            <Text className="text-text-muted text-[9px] mt-0.5 font-bold">
                                                {new Date(alert.triggeredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                        </View>
                                    ) : (
                                        <View className="flex-row items-center mt-1">
                                            <TrendingUp size={12} color={alert.condition === 'Above' ? "#10B981" : "#EF4444"} />
                                            <Text className="text-text-muted text-xs font-bold ml-1">
                                                {alert.condition} ₹{alert.price}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            <View className="flex-row items-center">
                                <Switch
                                    value={alert.active}
                                    onValueChange={() => toggleAlert(alert.id, alert.active)}
                                    trackColor={{ false: '#2A2E39', true: '#00E0A1' }}
                                    thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : alert.active ? '#FFFFFF' : '#94A3B8'}
                                />
                                <TouchableOpacity
                                    onPress={() => deleteAlert(alert.id)}
                                    className="ml-4 p-2 bg-error/5 rounded-full"
                                >
                                    <Trash2 size={18} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
                ) : (
                    <View className="items-center py-20 opacity-50">
                        <AlertCircle size={48} color="#2A2E39" />
                        <Text className="text-text-muted font-bold mt-4">No active alerts</Text>
                        <Text className="text-text-muted text-xs mt-2">Click the bell plus to add one</Text>
                    </View>
                )}

                {/* Automation Tip */}
                <View className="bg-primary/5 p-6 rounded-[32px] border border-primary/10 mt-10 mb-20 flex-row items-center">
                    <Smartphone size={24} color="#00E0A1" className="mr-4" />
                    <View className="flex-1 ml-4">
                        <Text className="text-text-primary font-black text-sm">Real-time Push</Text>
                        <Text className="text-text-muted text-xs mt-1">Alerts are processed in the cloud and sent via high-priority FCM for instant execution.</Text>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
};

export default AlertsScreen;
