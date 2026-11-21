import React, { useEffect, useState } from 'react';
import { haptic } from '../haptics';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Lock, Key, ShieldCheck } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { paperFetch, getUserStatus, loginWithPin, setupPin, authErrorText, AuthRequestError } from '../auth';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useAlerts } from '../context/AlertContext';
import { usePositions } from '../context/PositionContext';

const Logo = require('../../assets/icon.png');

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

const firstNameOf = (n: string) => { const f = (n || '').trim().split(/\s+/)[0] || ''; return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase(); };
const initialsOf = (n: string) => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const LoginScreen = () => {
    const navigation = useNavigation<LoginScreenNavigationProp>();
    // App-wide providers load before sign-in; reload them for the signed-in account.
    const { refreshAlerts } = useAlerts();
    const { refreshPositions } = usePositions();
    const [view, setView] = useState<'CHOICE' | 'ID' | 'PIN' | 'CREATE'>('CHOICE');
    const [loading, setLoading] = useState(false);
    const [traderId, setTraderId] = useState('');
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState<string | null>(null);
    const [idError, setIdError] = useState<string | null>(null);
    const [realUser, setRealUser] = useState<{ id: string; name: string } | null>(null);
    const [lastAccount, setLastAccount] = useState<{ id: string; name: string } | null>(null);
    // Create-PIN step: first entry, then confirm.
    const [createStep, setCreateStep] = useState<'enter' | 'confirm'>('enter');
    const [firstPin, setFirstPin] = useState('');

    // Offer "Continue as …" for the account used last on this device. The name is
    // the one cached at the last sign-in (profile reads need a signed-in session).
    useEffect(() => {
        (async () => {
            const id = await AsyncStorage.getItem('LAST_TRADER_ID');
            if (!id || id === 'real_user') return;
            const name = (await AsyncStorage.getItem('LAST_TRADER_NAME')) || id;
            setLastAccount({ id, name });
        })();
    }, []);

    // Your Trader ID names your paper account: use the same one as before (your
    // ICICI user id, if the app used to log you in through Breeze) to keep your
    // history, and set it as portfolio.paper_user_id in the backend scanner
    // config so scanner trades land in this account. Each Trader ID has its own
    // PIN, created on first sign-in.
    const startAccountLogin = async () => {
        const last = await AsyncStorage.getItem('LAST_TRADER_ID');
        if (last) setTraderId(last);
        setIdError(null);
        setView('ID');
    };

    const resetPinState = () => {
        setPin(''); setPinError(null); setFirstPin(''); setCreateStep('enter');
    };

    /** Ask the server whether this Trader ID has a PIN, then show the PIN or Create-PIN step. */
    const checkId = async (id: string, name: string) => {
        try {
            setLoading(true);
            const status = await getUserStatus(id);
            const cachedName = id === lastAccount?.id ? lastAccount.name : id;
            setRealUser({ id, name: name || cachedName });
            resetPinState();
            setView(status.has_pin ? 'PIN' : 'CREATE');
        } catch (e) {
            setTraderId(id);
            setIdError(authErrorText(e));
            setView('ID');
        } finally {
            setLoading(false);
        }
    };

    const continueWithId = async () => {
        const id = traderId.trim();
        setIdError(null);
        if (!id) return setIdError('Enter your Trader ID.');
        if (!/^[A-Za-z0-9_.@-]{3,64}$/.test(id)) {
            return setIdError('Use 3–64 letters, digits or . _ @ -');
        }
        await checkId(id, id === lastAccount?.id ? lastAccount.name : id);
    };

    const onSignedIn = async (userId: string) => {
        haptic.success();
        // Remember the display name for "Continue as …" (cosmetic; don't block on it).
        paperFetch('/auth/me', {}, { signOutOn401: false, timeoutMs: 5000 })
            .then(r => (r.ok ? r.json() : null))
            .then(me => {
                const name = me?.full_name && me.full_name !== 'Trader' ? me.full_name : userId;
                AsyncStorage.setItem('LAST_TRADER_NAME', name).catch(() => { });
            })
            .catch(() => { });
        refreshAlerts();
        refreshPositions();
        navigation.replace('MainTabs');
    };

    const verifyPin = async (enteredPin?: string) => {
        const pinToVerify = enteredPin ?? pin;
        if (!realUser || loading) return;
        if (pinToVerify.length < 4) return setPinError('Enter your 4–6 digit PIN.');
        try {
            setLoading(true);
            const session = await loginWithPin(realUser.id, pinToVerify);
            await onSignedIn(session.user_id);
        } catch (e) {
            haptic.error();
            setPin('');
            if (e instanceof AuthRequestError && e.status === 404) {
                // No PIN yet for this ID: create one instead.
                resetPinState();
                setView('CREATE');
                return;
            }
            setPinError(authErrorText(e));
        } finally {
            setLoading(false);
        }
    };

    const submitCreate = async (entered?: string) => {
        const value = entered ?? pin;
        if (!realUser || loading) return;
        if (!/^\d{4,6}$/.test(value)) return setPinError('Use 4 to 6 digits.');
        if (createStep === 'enter') {
            haptic.select();
            setFirstPin(value);
            setPin(''); setPinError(null);
            setCreateStep('confirm');
            return;
        }
        if (value !== firstPin) {
            haptic.error();
            setFirstPin(''); setPin('');
            setCreateStep('enter');
            setPinError("PINs didn't match. Choose your PIN again.");
            return;
        }
        try {
            setLoading(true);
            const session = await setupPin(realUser.id, value);
            await onSignedIn(session.user_id);
        } catch (e) {
            haptic.error();
            if (e instanceof AuthRequestError && e.status === 409) {
                // Someone already set a PIN for this ID: sign in with it.
                resetPinState();
                setView('PIN');
                setPinError(e.message);
                return;
            }
            setFirstPin(''); setPin('');
            setCreateStep('enter');
            setPinError(authErrorText(e));
        } finally {
            setLoading(false);
        }
    };

    const continueAsLast = () => {
        if (!lastAccount) return;
        setTraderId(lastAccount.id);
        checkId(lastAccount.id, lastAccount.name);
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
        </View>
    );

    const renderIdInput = () => (
        <View className="flex-1 justify-center px-6">
            <TouchableOpacity onPress={() => setView('CHOICE')} className="mb-8">
                <Text className="text-primary font-bold">← Back to Selection</Text>
            </TouchableOpacity>

            <View className="mb-8">
                <Text className="text-text-primary text-3xl font-black">Your Trader ID</Text>
                <Text className="text-text-muted mt-2 font-medium">Your paper portfolio, orders and scanner trades are stored under this ID. Use the same ID on every device. You'll enter your PIN next, or create one if this is your first sign-in.</Text>
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

    const MAX_PIN = 6;
    const submitPin = (value?: string) => (view === 'CREATE' ? submitCreate(value) : verifyPin(value));

    const pressDigit = (d: string) => {
        if (loading || pin.length >= MAX_PIN) return;
        haptic.select();
        setPinError(null);
        const next = pin + d;
        setPin(next);
        // PINs are 4–6 digits, so only a full 6 can submit itself; shorter ones use the button.
        if (next.length === MAX_PIN) setTimeout(() => submitPin(next), 120);
    };
    const backspace = () => { haptic.select(); setPinError(null); setPin(p => p.slice(0, -1)); };

    const renderPinPad = () => {
        const creating = view === 'CREATE';
        const confirming = creating && createStep === 'confirm';
        const title = !creating ? 'Enter PIN' : confirming ? 'Confirm your PIN' : 'Create your PIN';
        const subtitle = !creating
            ? `Welcome back${realUser?.name ? `, ${firstNameOf(realUser.name)}` : ''}. Enter your PIN for ${realUser?.id ?? 'this Trader ID'}.`
            : confirming
                ? 'Enter the same PIN again.'
                : `First sign-in for ${realUser?.id ?? 'this Trader ID'}. Choose a 4–6 digit PIN. It protects your account and approves sign-ins to TradeMaster Web.`;
        const submitLabel = !creating ? 'Sign in' : confirming ? 'Create PIN' : 'Next';
        const dots = Math.min(MAX_PIN, Math.max(4, pin.length));
        const canSubmit = pin.length >= 4 && !loading;
        return (
            <View className="flex-1 justify-center px-8">
                <View className="items-center mb-8">
                    <View className="w-14 h-14 bg-surface border border-border rounded-full items-center justify-center mb-5">
                        {creating ? <ShieldCheck size={24} color="#00E0A1" /> : <Lock size={24} color="#E1E7ED" />}
                    </View>
                    <Text className="text-text-primary text-3xl font-black">{title}</Text>
                    <Text className="text-text-muted mt-2 text-center">{subtitle}</Text>
                </View>

                {/* One dot per digit (at least four); filled as digits are entered */}
                <View className="flex-row justify-center mb-3" accessibilityLabel={`${pin.length} digits entered`}>
                    {Array.from({ length: dots }, (_, i) => (
                        <View key={i} className="w-4 h-4 rounded-full mx-2.5 border-2"
                            style={{ borderColor: pinError ? '#FF4D4D' : '#00E0A1', backgroundColor: i < pin.length ? (pinError ? '#FF4D4D' : '#00E0A1') : 'transparent' }} />
                    ))}
                </View>
                <Text className="text-error text-center font-semibold min-h-6" accessibilityLiveRegion="polite">{pinError || ''}</Text>

                {/* Typing on a hardware keyboard (web) */}
                {Platform.OS === 'web' && (
                    <TextInput
                        key={`${view}-${createStep}`}
                        accessibilityLabel={creating ? 'New PIN' : 'PIN'}
                        autoFocus
                        value={pin}
                        maxLength={MAX_PIN}
                        keyboardType="number-pad"
                        secureTextEntry
                        onChangeText={(val) => {
                            const v = val.replace(/\D/g, '').slice(0, MAX_PIN);
                            setPinError(null);
                            setPin(v);
                        }}
                        onSubmitEditing={() => submitPin()}
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

                <TouchableOpacity
                    onPress={() => submitPin()}
                    disabled={!canSubmit}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canSubmit }}
                    className={`py-4 rounded-2xl items-center mt-2 ${canSubmit ? 'bg-primary shadow-xl shadow-primary/30' : 'bg-primary/40'}`}
                >
                    {loading ? <ActivityIndicator color="#0E1116" /> : <Text className="text-background font-black text-lg">{submitLabel}</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => {
                    if (confirming) { setCreateStep('enter'); setFirstPin(''); setPin(''); setPinError(null); return; }
                    setView('CHOICE'); resetPinState();
                }} className="self-center py-2 px-4 mt-3">
                    <Text className="text-text-muted text-center font-bold">{confirming ? 'Start over' : 'Switch account'}</Text>
                </TouchableOpacity>
            </View>
        );
    };

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
                    {(view === 'PIN' || view === 'CREATE') && renderPinPad()}
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
