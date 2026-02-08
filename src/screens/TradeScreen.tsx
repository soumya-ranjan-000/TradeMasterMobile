import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ActivityIndicator, StatusBar, ScrollView, KeyboardAvoidingView, Platform, PanResponder, Dimensions } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ChevronLeft, Info, HelpCircle, ShieldCheck, Zap, Target, ChevronsRight } from 'lucide-react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { API_URL, BREEZE_API_URL, TEST_USER_ID } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLivePrice } from '../context/MarketDataContext';
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

    const [userId, setUserId] = useState<string>(TEST_USER_ID);
    const [side, setSide] = useState<'BUY' | 'SELL'>(params?.side || 'BUY');
    const [quantity, setQuantity] = useState('1');
    const [stopLoss, setStopLoss] = useState('');
    const [target, setTarget] = useState('');
    const [trailingStopLoss, setTrailingStopLoss] = useState('');
    const [loading, setLoading] = useState(false);
    const [showRiskPanel, setShowRiskPanel] = useState(false);
    const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
    const [limitPrice, setLimitPrice] = useState('');

    // Context Awareness: Sync state with navigation params
    React.useEffect(() => {
        if (params?.side) setSide(params.side);
        // Reset form when entering with new params or different symbol
        setQuantity('1');
        setStopLoss('');
        setTarget('');
        setTrailingStopLoss('');
        setShowRiskPanel(false);
        setOrderType('MARKET');
        setLimitPrice('');
    }, [params?.symbol, params?.side]);

    const symbol = params?.symbol || 'UNKNOWN';

    // Use the new Socket mechanism for live price
    const tick = useLivePrice(symbol);
    const livePrice = tick?.ltp || null;

    React.useEffect(() => {
        const init = async () => {
            const savedId = await AsyncStorage.getItem('USER_ID');
            if (savedId) setUserId(savedId);
        };
        init();
    }, [symbol]);

    const placeOrder = async () => {
        if (orderType === 'MARKET' && !livePrice) {
            Alert.alert("Error", "Market price not available yet");
            return;
        }
        if (orderType === 'LIMIT' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
            Alert.alert("Error", "Please enter a valid limit price");
            return;
        }
        try {
            setLoading(true);
            const orderPayload = {
                user_id: userId,
                symbol: symbol,
                side: side,
                quantity: parseInt(quantity),
                order_type: orderType,
                price: orderType === 'LIMIT' ? parseFloat(limitPrice) : livePrice,
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
                const message = orderType === 'MARKET'
                    ? `Successfully ${side.toLowerCase()}ed ${quantity} ${symbol}`
                    : `${side} Limit Order for ${quantity} ${symbol} placed at ₹${limitPrice}`;
                Alert.alert("Order Placed", message);
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
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-background"
        >
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View className="flex-row items-center px-6 pt-12 pb-4">
                <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 -ml-2 mr-4">
                    <ChevronLeft size={28} color="#E1E7ED" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-text-primary">New Order</Text>
            </View>

            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
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
                                    onPress={() => {
                                        const current = parseInt(quantity) || 0;
                                        setQuantity((current + val).toString());
                                    }}
                                    className="px-4 py-2 bg-background border border-border rounded-xl"
                                >
                                    <Text className="text-text-primary font-bold">+{val}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Order Type Selector */}
                <View className="px-6 mt-6">
                    <View className="bg-surface p-1 rounded-2xl flex-row border border-border">
                        <TouchableOpacity
                            onPress={() => setOrderType('MARKET')}
                            className={`flex-1 py-3.5 rounded-xl items-center flex-row justify-center ${orderType === 'MARKET' ? 'bg-primary shadow-lg shadow-primary/20' : ''}`}
                        >
                            <Zap size={14} color={orderType === 'MARKET' ? 'white' : '#6B7280'} />
                            <Text className={`text-xs ml-2 font-black tracking-widest ${orderType === 'MARKET' ? 'text-white' : 'text-text-muted'}`}>MARKET</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => {
                                setOrderType('LIMIT');
                                if (!limitPrice && livePrice) setLimitPrice(livePrice.toFixed(2));
                            }}
                            className={`flex-1 py-3.5 rounded-xl items-center flex-row justify-center ${orderType === 'LIMIT' ? 'bg-primary shadow-lg shadow-primary/20' : ''}`}
                        >
                            <Target size={14} color={orderType === 'LIMIT' ? 'white' : '#6B7280'} />
                            <Text className={`text-xs ml-2 font-black tracking-widest ${orderType === 'LIMIT' ? 'text-white' : 'text-text-muted'}`}>LIMIT</Text>
                        </TouchableOpacity>
                    </View>

                    {orderType === 'LIMIT' && (
                        <View className="mt-4 bg-surface border border-primary/20 p-8 rounded-[32px] shadow-2xl shadow-primary/5">
                            <View className="flex-row justify-between items-center mb-6">
                                <Text className="text-text-secondary text-[10px] uppercase font-black tracking-widest">Target Price Entry</Text>
                                <View className="bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                                    <Text className="text-primary text-[8px] font-black uppercase">Pending Order</Text>
                                </View>
                            </View>
                            <TextInput
                                className="text-5xl font-black text-text-primary text-center"
                                keyboardType="numeric"
                                value={limitPrice}
                                onChangeText={setLimitPrice}
                                placeholder="0.00"
                                placeholderTextColor="#2A2E39"
                            />
                            <View className="flex-row gap-2 justify-center mt-8">
                                {[-1, -0.5, 0.5, 1].map((perc) => (
                                    <TouchableOpacity
                                        key={perc}
                                        onPress={() => {
                                            const base = parseFloat(limitPrice) || livePrice || 0;
                                            setLimitPrice((base * (1 + perc / 100)).toFixed(2));
                                        }}
                                        className="px-4 py-2 bg-background border border-border rounded-xl"
                                    >
                                        <Text className={`text-[10px] font-black ${perc < 0 ? 'text-error' : 'text-success'}`}>
                                            {perc > 0 ? '+' : ''}{perc}%
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}
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
                            <Text className="text-text-primary font-bold">{orderType === 'MARKET' ? 'Market Order' : 'Limit Order'}</Text>
                        </View>
                        {orderType === 'LIMIT' && (
                            <View className="flex-row justify-between">
                                <Text className="text-text-secondary font-medium">Limit Price</Text>
                                <Text className="text-text-primary font-bold">₹{parseFloat(limitPrice).toFixed(2)}</Text>
                            </View>
                        )}
                        <View className="flex-row justify-between">
                            <Text className="text-text-secondary font-medium">Estimated Value</Text>
                            <Text className="text-text-primary font-bold">
                                ₹{((orderType === 'LIMIT' ? (parseFloat(limitPrice) || 0) : (livePrice || 0)) * (parseInt(quantity) || 0)).toFixed(2)}
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
            <View className="px-6 pb-12 pt-6 bg-background border-t border-border">
                <SwipeButton
                    side={side}
                    isBuy={isBuy}
                    loading={loading}
                    onSwipeComplete={placeOrder}
                    disabled={!quantity || parseInt(quantity) <= 0}
                />
            </View>
        </KeyboardAvoidingView>
    );
};

const SwipeButton = ({ side, isBuy, loading, onSwipeComplete, disabled }: any) => {
    const translateX = useSharedValue(0);
    const trackWidth = useSharedValue(0);
    const THUMB_SIZE = 58;
    const padding = 6;

    // Fix stale closure: Store the latest callback in a ref
    const onCompleteRef = React.useRef(onSwipeComplete);
    React.useEffect(() => {
        onCompleteRef.current = onSwipeComplete;
    }, [onSwipeComplete]);

    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => !loading && !disabled,
            onMoveShouldSetPanResponder: () => !loading && !disabled,
            onPanResponderMove: (_, gestureState) => {
                const maxRange = trackWidth.value - THUMB_SIZE - (padding * 2);
                if (maxRange <= 0) return;
                const nextValue = Math.max(0, Math.min(gestureState.dx, maxRange));
                translateX.value = nextValue;
            },
            onPanResponderRelease: (_, gestureState) => {
                const maxRange = trackWidth.value - THUMB_SIZE - (padding * 2);
                const threshold = maxRange * 0.75;

                if (gestureState.dx > threshold) {
                    translateX.value = withSpring(maxRange, { damping: 20, stiffness: 90 });
                    // Execute the LATEST callback from ref
                    if (onCompleteRef.current) {
                        runOnJS(onCompleteRef.current)();
                    }
                    // Auto-reset after delay to allow for success/error handling
                    setTimeout(() => {
                        translateX.value = withSpring(0);
                    }, 2500);
                } else {
                    translateX.value = withSpring(0, { damping: 20, stiffness: 90 });
                }
            },
        })
    ).current;

    const animatedThumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const animatedTextStyle = useAnimatedStyle(() => {
        const maxRange = trackWidth.value - THUMB_SIZE - (padding * 2);
        const opacity = interpolate(
            translateX.value,
            [0, maxRange * 0.4],
            [1, 0],
            Extrapolate.CLAMP
        );
        return { opacity };
    });

    const animatedProgressStyle = useAnimatedStyle(() => ({
        width: translateX.value + THUMB_SIZE / 2 + padding,
        backgroundColor: isBuy ? 'rgba(0, 224, 161, 0.1)' : 'rgba(255, 77, 77, 0.1)',
    }));

    return (
        <View
            onLayout={(e) => {
                trackWidth.value = e.nativeEvent.layout.width;
            }}
            className={`w-full h-[72px] rounded-[26px] bg-[#1A1D24] border border-[#2A2E39] relative overflow-hidden flex-row items-center px-[6px] ${disabled ? 'opacity-40' : ''}`}
        >
            {/* Background Progress */}
            <Animated.View
                style={[
                    { height: '100%', position: 'absolute', left: 0, top: 0 },
                    animatedProgressStyle
                ]}
            />

            {/* Static Text Center */}
            <Animated.View style={[animatedTextStyle, { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }]}>
                <View className="flex-row items-center">
                    <Text className={`font-black tracking-[3px] text-[11px] uppercase ${isBuy ? 'text-success' : 'text-error'} opacity-60`}>
                        Swipe to {side}
                    </Text>
                </View>
            </Animated.View>

            {/* Draggable Thumb */}
            <Animated.View
                {...panResponder.panHandlers}
                style={[
                    animatedThumbStyle,
                    {
                        width: THUMB_SIZE,
                        height: THUMB_SIZE,
                        borderRadius: 20,
                        backgroundColor: loading ? '#2A2E39' : (isBuy ? '#00E0A1' : '#FF4D4D'),
                        shadowColor: isBuy ? '#00E0A1' : '#FF4D4D',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.5,
                        shadowRadius: 10,
                        elevation: 12,
                        zIndex: 10
                    }
                ]}
                className="items-center justify-center flex-row"
            >
                {loading ? (
                    <ActivityIndicator color="white" size="small" />
                ) : (
                    <ChevronsRight size={26} color="white" strokeWidth={3} />
                )}
            </Animated.View>
        </View>
    );
};

export default TradeScreen;
