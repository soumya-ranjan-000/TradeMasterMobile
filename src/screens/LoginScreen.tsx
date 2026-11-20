import React, { useState } from 'react';
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

const LoginScreen = () => {
    const navigation = useNavigation<LoginScreenNavigationProp>();
    const [view, setView] = useState<'CHOICE' | 'ID' | 'PIN'>('CHOICE');
    const [loading, setLoading] = useState(false);
    const [traderId, setTraderId] = useState('');
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState<string | null>(null);
    const [idError, setIdError] = useState<string | null>(null);
    const [realUser, setRealUser] = useState<any>(null);

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
            setView('PIN');
        } finally {
            setLoading(false);
        }
    };

    const verifyPin = async (enteredPin?: string) => {
        const pinToVerify = enteredPin || pin;
        if (pinToVerify === '0000') {
            const userId = realUser?.id || "real_user";
            await AsyncStorage.setItem('USER_ID', userId);
            await AsyncStorage.setItem('LAST_TRADER_ID', userId);
            await AsyncStorage.setItem('IS_REAL', 'true');
            navigation.replace('MainTabs');
        } else {
            setPinError('Incorrect PIN. Try again.');
            setPin('');
        }
    };

    const handleTestLogin = async () => {
        await AsyncStorage.setItem('USER_ID', TEST_USER_ID);
        await AsyncStorage.setItem('IS_REAL', 'false');
        navigation.replace('MainTabs');
    };

    const renderChoice = () => (
        <View className="flex-1 justify-center px-6">
            <View className="mb-12 items-center">
                <Image
                    source={Logo}
                    style={{ width: 100, height: 100, borderRadius: 50 }}
                    className="mb-6 shadow-2xl"
                />
                <Text className="text-text-primary text-4xl font-black text-center tracking-tighter">TradeMaster</Text>
                <Text className="text-text-muted text-center mt-2 font-medium">Master the Markets</Text>
            </View>

            <TouchableOpacity
                onPress={startAccountLogin}
                className="bg-surface border border-border/50 p-6 rounded-[32px] mb-4 flex-row items-center active:scale-95 transition-transform"
            >
                <View className="w-14 h-14 bg-primary/10 rounded-2xl items-center justify-center mr-4">
                    <Zap size={28} color="#00E0A1" />
                </View>
                <View className="flex-1">
                    <Text className="text-text-primary font-black text-xl">My Account</Text>
                    <Text className="text-text-muted text-xs font-bold uppercase mt-1">Live Market • Your Paper Portfolio</Text>
                </View>
                <ArrowRight size={20} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity
                onPress={handleTestLogin}
                className="bg-surface/50 border border-border/30 p-6 rounded-[32px] flex-row items-center active:scale-95 transition-transform"
            >
                <View className="w-14 h-14 bg-primary-blue/10 rounded-2xl items-center justify-center mr-4">
                    <User size={28} color="#3B82F6" />
                </View>
                <View className="flex-1">
                    <Text className="text-text-primary font-black text-xl opacity-80">Test User</Text>
                    <Text className="text-text-muted text-xs font-bold uppercase mt-1">Paper Trading • Demo Account</Text>
                </View>
                <ArrowRight size={20} color="#6B7280" />
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

    const renderPinPad = () => (
        <View className="flex-1 justify-center px-6">
            <View className="items-center mb-12">
                <View className="w-16 h-16 bg-surface border border-border rounded-full items-center justify-center mb-6">
                    <Lock size={30} color="#E1E7ED" />
                </View>
                <Text className="text-text-primary text-3xl font-black">Enter PIN</Text>
                <Text className="text-text-muted mt-2 text-center">
                    Welcome back{realUser?.name ? `, ${String(realUser.name).split(/\s+/)[0].toLowerCase().replace(/^./, (c: string) => c.toUpperCase())}` : ''}. Enter your 4-digit app PIN.
                </Text>
            </View>

            <TextInput
                className={`bg-surface border-2 p-6 rounded-3xl text-text-primary text-4xl font-black text-center tracking-[10px] outline-none ${pinError ? 'border-error/60 mb-3' : 'border-primary/30 mb-8'}`}
                placeholder="••••"
                placeholderTextColor="#3A3F4B"
                autoFocus
                accessibilityLabel="App PIN"
                keyboardType="numeric"
                secureTextEntry
                maxLength={4}
                value={pin}
                onChangeText={(val) => {
                    setPinError(null);
                    setPin(val.replace(/\D/g, ''));
                    if (val.length === 4) {
                        // Small delay for better UX
                        setTimeout(() => verifyPin(val), 100);
                    }
                }}
            />

            {!!pinError && <Text className="text-error text-center font-semibold mb-5" accessibilityLiveRegion="polite">{pinError}</Text>}
            <TouchableOpacity onPress={() => { setView('CHOICE'); setPin(''); setPinError(null); }} className="self-center py-2 px-4">
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
