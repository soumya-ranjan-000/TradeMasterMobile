import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ActivityIndicator, StatusBar, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ChevronLeft, Info, HelpCircle, ShieldCheck } from 'lucide-react-native';
import { API_URL, BREEZE_API_URL, TEST_USER_ID } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type TradeScreenNavigationProp = CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Trade'>,
    NativeStackNavigationProp<RootStackParamList>
>;

const TradeScreen = () => {
    const route = useRoute();
    const navigation = useNavigation<TradeScreenNavigationProp>();

    // Safety check for route params
    const params = route.params as { symbol: string, side: 'BUY' | 'SELL' } | undefined;
    const symbol = params?.symbol || 'UNKNOWN';
    const initialSide = params?.side || 'BUY';

    const [userId, setUserId] = useState<string>(TEST_USER_ID);
    const [side, setSide] = useState<'BUY' | 'SELL'>(initialSide);
    const [quantity, setQuantity] = useState('1');
    const [livePrice, setLivePrice] = useState<number | null>(null);
    const [stopLoss, setStopLoss] = useState('');
    const [target, setTarget] = useState('');
    const [trailingStopLoss, setTrailingStopLoss] = useState('');
    const [loading, setLoading] = useState(false);
    const [showRiskPanel, setShowRiskPanel] = useState(false);

    const fetchLivePrice = async () => {
        try {
            // Using API_URL (paper trading service) which fetches directly from Breeze
            const response = await fetch(`${API_URL}/market/price?symbol=${symbol}`);
            const data = await response.json();
            setLivePrice(data.price);
        } catch (error) {
            console.error("Failed to fetch live price:", error);
        }
    };

    React.useEffect(() => {
        let timer: any;
        const init = async () => {
            const savedId = await AsyncStorage.getItem('USER_ID');
            if (savedId) setUserId(savedId);

            // Check market status once
            try {
                const msRes = await fetch(`${BREEZE_API_URL}/api/market-status`);
                const msData = await msRes.json();

                // Always fetch once
                fetchLivePrice();

                // Only poll if open
                if (msData.is_open) {
                    timer = setInterval(fetchLivePrice, 10000);
                }
            } catch (e) {
                // Fallback: poll anyway if check fails
                fetchLivePrice();
                timer = setInterval(fetchLivePrice, 10000);
            }
        };
        init();
        return () => timer && clearInterval(timer);
    }, [symbol]);

    const placeOrder = async () => {
        if (!livePrice) {
            Alert.alert("Error", "Market price not available yet");
            return;
        }
        try {
            setLoading(true);
            const orderPayload = {
                user_id: userId,
                symbol: symbol,
                side: side,
                quantity: parseInt(quantity),
                order_type: "MARKET",
                price: livePrice,
                stop_loss: stopLoss ? parseFloat(stopLoss) : null,
                target: target ? parseFloat(target) : null,
                trailing_sl: trailingStopLoss ? parseFloat(trailingStopLoss) : null
            };

            const response = await fetch(`${API_URL}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderPayload)
            });

            if (response.ok) {
                Alert.alert("Order Executed", `Successfully ${side.toLowerCase()}ed ${quantity} ${symbol}`);
                // Navigate to Portfolio (sibling tab)
                navigation.navigate('Portfolio' as any);
            } else {
                const err = await response.json();
                Alert.alert("Execution Failed", err.detail || "Error processing order");
            }
        } catch (error) {
            Alert.alert("Error", "Network error");
        } finally {
            setLoading(false);
        }
    };

    const isBuy = side === 'BUY';

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View className="flex-row items-center px-6 pt-12 pb-4">
                <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 -ml-2 mr-4">
                    <ChevronLeft size={28} color="#E1E7ED" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-text-primary">New Order</Text>
            </View>

            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                {/* Side Selector */}
                <View className="px-6 mt-4">
                    <View className="bg-surface p-1.5 rounded-2xl flex-row border border-border">
                        <TouchableOpacity
                            onPress={() => setSide('BUY')}
                            className={`flex-1 py-3.5 rounded-xl items-center ${isBuy ? 'bg-success shadow-lg shadow-success/20' : ''}`}
                        >
                            <Text className={`font-black tracking-widest ${isBuy ? 'text-white' : 'text-text-muted'}`}>BUY</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setSide('SELL')}
                            className={`flex-1 py-3.5 rounded-xl items-center ${!isBuy ? 'bg-error shadow-lg shadow-error/20' : ''}`}
                        >
                            <Text className={`font-black tracking-widest ${!isBuy ? 'text-white' : 'text-text-muted'}`}>SELL</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Stock Quick Info */}
                <View className="px-6 mt-8 flex-row justify-between items-center">
                    <View>
                        <Text className="text-text-muted text-xs uppercase font-bold tracking-widest">Asset</Text>
                        <Text className="text-2xl font-black text-text-primary mt-1">{symbol}</Text>
                    </View>
                    <View className="items-end">
                        <Text className="text-text-muted text-xs uppercase font-bold tracking-widest">Market Price</Text>
                        <Text className="text-2xl font-black text-text-primary mt-1">
                            ₹{livePrice ? livePrice.toFixed(2) : '---'}
                        </Text>
                    </View>
                </View>

                {/* Input Section */}
                <View className="px-6 mt-10">
                    <View className="bg-surface rounded-3xl border border-border p-8 pb-10">
                        <View className="items-center mb-8">
                            <Text className="text-text-secondary text-sm font-bold uppercase mb-4">Enter Quantity</Text>
                            <TextInput
                                className="text-6xl font-black text-text-primary text-center w-full"
                                keyboardType="numeric"
                                value={quantity}
                                onChangeText={setQuantity}
                                placeholder="0"
                                placeholderTextColor="#2A2E39"
                                autoFocus
                            />
                        </View>

                        <View className="flex-row gap-2 justify-center">
                            {[1, 10, 50, 100].map((val) => (
                                <TouchableOpacity
                                    key={val}
                                    onPress={() => setQuantity(val.toString())}
                                    className="px-4 py-2 bg-background border border-border rounded-xl"
                                >
                                    <Text className="text-text-primary font-bold">+{val}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Risk Management Section */}
                <View className="px-6 mt-8">
                    <TouchableOpacity
                        onPress={() => setShowRiskPanel(!showRiskPanel)}
                        className="bg-surface/50 border border-border p-5 rounded-3xl flex-row justify-between items-center"
                    >
                        <View className="flex-row items-center">
                            <ShieldCheck size={20} color="#00E0A1" />
                            <Text className="text-text-primary font-bold ml-3 text-base">Risk Management</Text>
                        </View>
                        <Text className="text-primary font-bold">{showRiskPanel ? 'Hide' : 'Add SL/TP'}</Text>
                    </TouchableOpacity>

                    {showRiskPanel && (
                        <View className="bg-surface border-x border-b border-border p-6 rounded-b-[32px] -mt-6 pt-10 gap-6">
                            <View>
                                <Text className="text-text-secondary text-[10px] uppercase font-bold tracking-widest mb-3">Stop Loss (Price)</Text>
                                <TextInput
                                    className="bg-background border border-border p-4 rounded-xl text-text-primary font-bold"
                                    placeholder="Set SL Quote"
                                    placeholderTextColor="#6B7280"
                                    keyboardType="numeric"
                                    value={stopLoss}
                                    onChangeText={setStopLoss}
                                />
                                <View className="flex-row gap-2 mt-2">
                                    {[1, 2, 5].map(p => (
                                        <TouchableOpacity
                                            key={p}
                                            onPress={() => {
                                                if (livePrice) {
                                                    const val = isBuy ? livePrice * (1 - p / 100) : livePrice * (1 + p / 100);
                                                    setStopLoss(val.toFixed(2));
                                                }
                                            }}
                                            className="px-3 py-1 bg-error/10 border border-error/20 rounded-lg"
                                        >
                                            <Text className="text-error text-[10px] font-bold">-{p}%</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <View>
                                <Text className="text-text-secondary text-[10px] uppercase font-bold tracking-widest mb-3">Target Price</Text>
                                <TextInput
                                    className="bg-background border border-border p-4 rounded-xl text-text-primary font-bold"
                                    placeholder="Set Target Quote"
                                    placeholderTextColor="#6B7280"
                                    keyboardType="numeric"
                                    value={target}
                                    onChangeText={setTarget}
                                />
                                <View className="flex-row gap-2 mt-2">
                                    {[2, 5, 10].map(p => (
                                        <TouchableOpacity
                                            key={p}
                                            onPress={() => {
                                                if (livePrice) {
                                                    const val = isBuy ? livePrice * (1 + p / 100) : livePrice * (1 - p / 100);
                                                    setTarget(val.toFixed(2));
                                                }
                                            }}
                                            className="px-3 py-1 bg-success/10 border border-success/20 rounded-lg"
                                        >
                                            <Text className="text-success text-[10px] font-bold">+{p}%</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                            <View>
                                <Text className="text-text-secondary text-[10px] uppercase font-bold tracking-widest mb-3">Trailing Stop Loss (Distance)</Text>
                                <TextInput
                                    className="bg-background border border-border p-4 rounded-xl text-text-primary font-bold"
                                    placeholder="Set Trailing Distance"
                                    placeholderTextColor="#6B7280"
                                    keyboardType="numeric"
                                    value={trailingStopLoss}
                                    onChangeText={setTrailingStopLoss}
                                />
                                <View className="flex-row gap-2 mt-2">
                                    {[0.5, 1, 2].map(p => (
                                        <TouchableOpacity
                                            key={p}
                                            onPress={() => {
                                                if (livePrice) {
                                                    const val = livePrice * (p / 100);
                                                    setTrailingStopLoss(val.toFixed(2));
                                                }
                                            }}
                                            className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-lg"
                                        >
                                            <Text className="text-primary text-[10px] font-bold">{p}% Dist</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </View>
                    )}
                </View>

                {/* Order Summary */}
                <View className="px-6 mt-8 mb-20">
                    <Text className="text-sm font-bold text-text-muted uppercase tracking-widest mb-4">Order Summary</Text>
                    <View className="bg-surface rounded-3xl border border-border p-6 gap-4">
                        <View className="flex-row justify-between">
                            <Text className="text-text-secondary font-medium">Order Type</Text>
                            <Text className="text-text-primary font-bold">Market Order</Text>
                        </View>
                        <View className="flex-row justify-between">
                            <Text className="text-text-secondary font-medium">Estimated Value</Text>
                            <Text className="text-text-primary font-bold">
                                ₹{((livePrice || 0) * (parseInt(quantity) || 0)).toFixed(2)}
                            </Text>
                        </View>
                        <View className="h-px bg-border my-2" />
                        <View className="flex-row justify-between">
                            <Text className="text-text-secondary font-medium">Platform Fee</Text>
                            <Text className="text-text-primary font-bold">₹0.00 (Zero Fee)</Text>
                        </View>
                    </View>

                    <View className="flex-row items-center justify-center mt-6 gap-2">
                        <ShieldCheck size={16} color="#10B981" />
                        <Text className="text-text-muted text-xs font-medium">Your trade is secure and verified</Text>
                    </View>
                </View>
            </ScrollView>

            {/* Action Footer */}
            <View className="px-6 pb-12 pt-4 bg-background border-t border-border">
                <TouchableOpacity
                    disabled={loading || !quantity || parseInt(quantity) <= 0}
                    onPress={placeOrder}
                    className={`py-5 rounded-2xl items-center shadow-2xl ${isBuy ? 'bg-success shadow-success/30' : 'bg-error shadow-error/30'}`}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text className="text-white font-black text-lg uppercase tracking-tight">Confirm {side} Order</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default TradeScreen;
