import React, { useEffect, useState } from 'react';
import { haptic } from '../haptics';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { User, Zap, ArrowRight, Lock, Key } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, TEST_USER_ID } from '../config';
import { RootStackParamList } from '../navigation/RootNavigator';

const Logo = require('../../assets/icon.png');

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

const firstNameOf = (n: string) => { const f = (n || '').trim().split(/\s+/)[0] || ''; return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase(); };
const initialsOf = (n: string) => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const LoginScreen = () => {
    const navigation = useNavigation<LoginScreenNavigationProp>();
    const [view, setView] = useState<'CHOICE' | 'ID' | 'PIN'>('CHOICE');
    const [loading, setLoading] = useState(false);
    const [traderId, setTraderId] = useState('');
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState<string | null>(null);
    const [idError, setIdError] = useState<string | null>(null);
    const [realUser, setRealUser] = useState<any>(null);
    const [lastAccount, setLastAccount] = useState<{ id: string; name: string } | null>(null);

    // Offer "Continue as …" for the account used last on this device.
    useEffect(() => {
        (async () => {
            const id = await AsyncStorage.getItem('LAST_TRADER_ID');
            if (!id || id === 'real_user') return;
            let name = (await AsyncStorage.getItem('LAST_TRADER_NAME')) || id;
            setLastAccount({ id, name });
            try {
                const res = await fetch(`${API_URL}/profile/${encodeURIComponent(id)}`);
                if (res.ok) {
                    const p = await res.json();
                    if (p.full_name && p.full_name !== 'Trader') {
                        name = p.full_name;
                        setLastAccount({ id, name });
                        AsyncStorage.setItem('LAST_TRADER_NAME', name).catch(() => { });
                    }
                }
            } catch {
                // Name is cosmetic.
            }
        })();
    }, []);

    // The app no longer reads the broker session (that needs the Breeze key,
    // which must not ship inside the app). Your Trader ID names your paper
    // account: use the same one as before (your ICICI user id, if the app used
    // to log you in through Breeze) to keep your history, and set it as
    // portfolio.paper_user_id in the backend scanner config so scanner trades
    // land in this account.
    const startAccountLogin = async () => {
        const last = await AsyncStorage.getItem('LAST_TRADER_ID');
        if (last) setTraderId(last);
        setView('ID');
    };

    const continueWithId = async () => {
        const id = traderId.trim();
        setIdError(null);
        if (!id) return setIdError('Enter your Trader ID.');
        if (!/^[A-Za-z0-9_.@-]{3,64}$/.test(id)) {
            return setIdError('Use 3–64 letters, digits or . _ @ -');
        }
        try {
            setLoading(true);
            let name = id;
            try {
                const res = await fetch(`${API_URL}/profile/${encodeURIComponent(id)}`);
                if (res.ok) {
                    const p = await res.json();
                    if (p.full_name && p.full_name !== 'Trader') name = p.full_name;
                }
            } catch {
                // Profile lookup is cosmetic; the PIN step works without it.
            }
            setRealUser({ id, name });
            AsyncStorage.setItem('LAST_TRADER_NAME', name).catch(() => { });
            setView('PIN');
        } finally {
            setLoading(false);
        }
    };

    const verifyPin = async (enteredPin?: string) => {
        const pinToVerify = enteredPin || pin;
        if (pinToVerify === '0000') {
            haptic.success();
            const userId = realUser?.id || "real_user";
            await AsyncStorage.setItem('USER_ID', userId);
            await AsyncStorage.setItem('LAST_TRADER_ID', userId);
            await AsyncStorage.setItem('IS_REAL', 'true');
            navigation.replace('MainTabs');
        } else {
            haptic.error();
            setPinError('Incorrect PIN. Try again.');
            setPin('');
        }
    };

    const handleTestLogin = async () => {
        await AsyncStorage.setItem('USER_ID', TEST_USER_ID);
        await AsyncStorage.setItem('IS_REAL', 'false');
        navigation.replace('MainTabs');
    };

    const continueAsLast = () => {
        if (!lastAccount) return;
        setRealUser(lastAccount);
        setPin(''); setPinError(null);
        setView('PIN');
    };

    const renderChoice = () => (
        <View className="flex-1 justify-center px-6">
            <View className="mb-12 items-center">
                <Image
                    source={Logo}
                    style={{ width: 96, height: 96, borderRadius: 48 }}
                    className="mb-5"
                />
                <Text className="text-text-primary text-4xl font-black text-center tracking-tighter">TradeMaster</Text>
                <Text className="text-text-muted text-center mt-2 font-medium">Paper trading for NSE, with live market context</Text>
            </View>

            {lastAccount ? (
                <TouchableOpacity onPress={continueAsLast} accessibilityRole="button"
                    className="bg-primary p-5 rounded-3xl mb-3 flex-row items-center active:opacity-80">
                    <View className="w-12 h-12 bg-background/20 rounded-2xl items-center justify-center mr-4">
                        <Text className="text-background font-black text-lg">{initialsOf(lastAccount.name)}</Text>
                    </View>
                    <View className="flex-1">
                        <Text className="text-background font-black text-lg">Continue as {firstNameOf(lastAccount.name)}</Text>
                        <Text className="text-background/70 text-[13px] font-semibold mt-0.5">Trader ID {lastAccount.id}</Text>
                    </View>
                    <ArrowRight size={20} color="#0E1116" />
                </TouchableOpacity>
            ) : null}

            <TouchableOpacity
                onPress={startAccountLogin}
                accessibilityRole="button"
                className="bg-surface border border-border p-5 rounded-3xl mb-3 flex-row items-center active:opacity-80"
            >
                <View className="w-12 h-12 bg-primary/10 rounded-2xl items-center justify-center mr-4">
                    <Key size={22} color="#00E0A1" />
                </View>
                <View className="flex-1">
                    <Text className="text-text-primary font-black text-lg">{lastAccount ? 'Another Trader ID' : 'Sign in with Trader ID'}</Text>
                    <Text className="text-text-muted text-[13px] font-semibold mt-0.5">Your paper portfolio and scanner trades</Text>
                </View>
                <ArrowRight size={20} color="#8B93A1" />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleTestLogin} accessibilityRole="button" className="self-center py-3 px-4 mt-2">
                <Text className="text-text-muted font-bold text-[13px]">Explore with the demo account</Text>
            </TouchableOpacity>
        </View>
    );

    const renderIdInput = () => (
        <View className="flex-1 justify-center px-6">
            <TouchableOpacity onPress={() => setView('CHOICE')} className="mb-8">
                <Text className="text-primary font-bold">← Back to Selection</Text>
            </TouchableOpacity>

            <View className="mb-8">
                <Text className="text-text-primary text-3xl font-black">Your Trader ID</Text>
                <Text className="text-text-muted mt-2 font-medium">Your paper portfolio, orders and scanner trades are stored under this ID. Use the same ID on every device.</Text>
            </View>

            <View className={`bg-surface border rounded-2xl p-4 flex-row items-center ${idError ? 'border-error/60 mb-2' : 'border-border mb-6'}`}>
                <Key size={20} color="#00E0A1" />
                <TextInput
                    className="flex-1 ml-3 text-text-primary font-bold"
                    placeholder="Trader ID"
                    placeholderTextColor="#6B7280"
                    value={traderId}
                    onChangeText={(v) => { setTraderId(v); setIdError(null); }}
                    accessibilityLabel="Trader ID"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={continueWithId}
                />
            </View>

            {!!idError && <Text className="text-error text-[13px] font-semibold mb-4" accessibilityLiveRegion="polite">{idError}</Text>}
            <TouchableOpacity
                onPress={continueWithId}
                disabled={loading}
                className={`py-5 rounded-2xl items-center ${loading ? 'bg-primary/50' : 'bg-primary shadow-xl shadow-primary/30'}`}
            >
                {loading ? <ActivityIndicator color="white" /> : <Text className="text-background font-black text-lg">Continue</Text>}
            </TouchableOpacity>
        </View>
    );

    const pressDigit = (d: string) => {
        if (pin.length >= 4) return;
        haptic.select();
        setPinError(null);
        const next = pin + d;
        setPin(next);
        if (next.length === 4) setTimeout(() => verifyPin(next), 120);
    };
    const backspace = () => { haptic.select(); setPinError(null); setPin(p => p.slice(0, -1)); };

    const renderPinPad = () => (
        <View className="flex-1 justify-center px-8">
            <View className="items-center mb-8">
                <View className="w-14 h-14 bg-surface border border-border rounded-full items-center justify-center mb-5">
                    <Lock size={24} color="#E1E7ED" />
                </View>
                <Text className="text-text-primary text-3xl font-black">Enter PIN</Text>
                <Text className="text-text-muted mt-2 text-center">
                    Welcome back{realUser?.name ? `, ${firstNameOf(realUser.name)}` : ''}. Enter your 4-digit app PIN.
                </Text>
            </View>

            {/* Four dots; filled as digits are entered */}
            <View className="flex-row justify-center mb-3" accessibilityLabel={`${pin.length} of 4 digits entered`}>
                {[0, 1, 2, 3].map(i => (
                    <View key={i} className="w-4 h-4 rounded-full mx-2.5 border-2"
                        style={{ borderColor: pinError ? '#FF4D4D' : '#00E0A1', backgroundColor: i < pin.length ? (pinError ? '#FF4D4D' : '#00E0A1') : 'transparent' }} />
                ))}
            </View>
            <Text className="text-error text-center font-semibold h-6" accessibilityLiveRegion="polite">{pinError || ''}</Text>

            {/* Typing on a hardware keyboard (web) */}
            {Platform.OS === 'web' && (
                <TextInput
                    accessibilityLabel="App PIN"
                    autoFocus
                    value={pin}
                    maxLength={4}
                    keyboardType="number-pad"
                    onChangeText={(val) => {
                        const v = val.replace(/\D/g, '').slice(0, 4);
                        setPinError(null);
                        setPin(v);
                        if (v.length === 4) setTimeout(() => verifyPin(v), 120);
                    }}
                    style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                />
            )}

            <View className="mt-4">
                {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '⌫']].map((row, r) => (
                    <View key={r} className="flex-row justify-center mb-3">
                        {row.map((k, c) => k === '' ? <View key={c} className="w-20 h-16 mx-3" /> : (
                            <TouchableOpacity key={c}
                                onPress={() => (k === '⌫' ? backspace() : pressDigit(k))}
                                accessibilityRole="button"
                                accessibilityLabel={k === '⌫' ? 'Delete digit' : k}
                                className={`w-20 h-16 mx-3 rounded-2xl items-center justify-center active:opacity-60 ${k === '⌫' ? '' : 'bg-surface border border-border'}`}>
                                <Text className="text-text-primary text-2xl font-bold">{k}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ))}
            </View>

            <TouchableOpacity onPress={() => { setView('CHOICE'); setPin(''); setPinError(null); }} className="self-center py-2 px-4 mt-2">
                <Text className="text-text-muted text-center font-bold">Switch account</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-background"
        >
            <LinearGradient
                colors={['#0B0E11', '#151921']}
                className="flex-1"
            >
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {view === 'CHOICE' && renderChoice()}
                    {view === 'ID' && renderIdInput()}
                    {view === 'PIN' && renderPinPad()}
                </ScrollView>

                {loading && view === 'CHOICE' && (
                    <View className="absolute inset-0 bg-black/50 items-center justify-center">
                        <ActivityIndicator size="large" color="#2563eb" />
                    </View>
                )}
            </LinearGradient>
        </KeyboardAvoidingView>
    );
};

export default LoginScreen;
