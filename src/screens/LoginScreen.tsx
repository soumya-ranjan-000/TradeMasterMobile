import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck, User, Zap, ArrowRight, Lock, Key } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BREEZE_API_URL, API_URL, TEST_USER_ID } from '../config';
import { RootStackParamList } from '../navigation/RootNavigator';

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

const LoginScreen = () => {
    const navigation = useNavigation<LoginScreenNavigationProp>();
    const [view, setView] = useState<'CHOICE' | 'TOKEN' | 'PIN'>('CHOICE');
    const [loading, setLoading] = useState(false);
    const [token, setToken] = useState('');
    const [pin, setPin] = useState('');
    const [realUser, setRealUser] = useState<any>(null);

    const checkExistingSession = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${BREEZE_API_URL}/api/customer-details`);
            const data = await response.json();

            if (data.Success) {
                // Handle both array (typical Breeze SDK) and object (direct API return)
                const user = Array.isArray(data.Success) ? data.Success[0] : data.Success;
                if (user) {
                    setRealUser({
                        id: user.idirect_userid || user.id,
                        name: user.idirect_user_name || user.name,
                        email: user.email
                    });
                    setView('PIN');
                } else {
                    setView('TOKEN');
                }
            } else {
                setView('TOKEN');
            }
        } catch (error) {
            console.log("Session check failed, need token");
            setView('TOKEN');
        } finally {
            setLoading(false);
        }
    };

    const handleLoginWithToken = async () => {
        if (!token) return Alert.alert("Error", "Please provide a session token");

        try {
            setLoading(true);
            const response = await fetch(`${BREEZE_API_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_token: token })
            });

            if (response.ok) {
                // Now get details
                const detailRes = await fetch(`${BREEZE_API_URL}/api/customer-details`);
                const detailData = await detailRes.json();

                if (detailData.Success) {
                    const user = Array.isArray(detailData.Success) ? detailData.Success[0] : detailData.Success;
                    setRealUser({
                        id: user.idirect_userid || user.id,
                        name: user.idirect_user_name || user.name,
                        email: user.email
                    });
                    setView('PIN');
                } else {
                    Alert.alert("Error", "Login successful but failed to retrieve details. Try again.");
                }
            } else {
                Alert.alert("Login Failed", "Invalid token or session expired.");
            }
        } catch (error) {
            Alert.alert("Error", "Connection to Breeze API failed.");
        } finally {
            setLoading(false);
        }
    };

    const verifyPin = async (enteredPin?: string) => {
        const pinToVerify = enteredPin || pin;
        if (pinToVerify === '0000') {
            const userId = realUser?.id || "real_user";
            await AsyncStorage.setItem('USER_ID', userId);
            await AsyncStorage.setItem('IS_REAL', 'true');
            navigation.replace('MainTabs');
        } else {
            Alert.alert("Incorrect PIN", "Please enter the correct app PIN. Default is 0000.");
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
                <View className="w-20 h-20 bg-primary/20 rounded-[24px] items-center justify-center mb-6 border border-primary/30">
                    <ShieldCheck size={40} color="#2563eb" />
                </View>
                <Text className="text-text-primary text-3xl font-black text-center">Welcome Back</Text>
                <Text className="text-text-muted text-center mt-2 font-medium">Choose your trading environment</Text>
            </View>

            <TouchableOpacity
                onPress={checkExistingSession}
                className="bg-surface border border-border p-6 rounded-[32px] mb-4 flex-row items-center active:scale-95 transition-transform"
            >
                <View className="w-14 h-14 bg-primary/10 rounded-2xl items-center justify-center mr-4">
                    <Zap size={28} color="#2563eb" />
                </View>
                <View className="flex-1">
                    <Text className="text-text-primary font-black text-xl">Real Trading</Text>
                    <Text className="text-text-muted text-xs font-bold uppercase mt-1">Live Market • Breeze API</Text>
                </View>
                <ArrowRight size={20} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity
                onPress={handleTestLogin}
                className="bg-surface/50 border border-border/50 p-6 rounded-[32px] flex-row items-center active:scale-95 transition-transform"
            >
                <View className="w-14 h-14 bg-success/10 rounded-2xl items-center justify-center mr-4">
                    <User size={28} color="#10B981" />
                </View>
                <View className="flex-1">
                    <Text className="text-text-primary font-black text-xl opacity-80">Test User</Text>
                    <Text className="text-text-muted text-xs font-bold uppercase mt-1">Paper Trading • Demo Account</Text>
                </View>
                <ArrowRight size={20} color="#6B7280" />
            </TouchableOpacity>
        </View>
    );

    const renderTokenInput = () => (
        <View className="flex-1 justify-center px-6">
            <TouchableOpacity onPress={() => setView('CHOICE')} className="mb-8">
                <Text className="text-primary font-bold">← Back to Selection</Text>
            </TouchableOpacity>

            <View className="mb-10">
                <Text className="text-text-primary text-3xl font-black">Session Expired</Text>
                <Text className="text-text-muted mt-2 font-medium">Please provide a new session token from your ICICI Direct portal to establish a real connection.</Text>
            </View>

            <View className="bg-surface border border-border rounded-2xl p-4 flex-row items-center mb-6">
                <Key size={20} color="#6B7280" />
                <TextInput
                    className="flex-1 ml-3 text-text-primary font-bold"
                    placeholder="Enter Session Token"
                    placeholderTextColor="#6B7280"
                    value={token}
                    onChangeText={setToken}
                    autoCapitalize="none"
                />
            </View>

            <TouchableOpacity
                onPress={handleLoginWithToken}
                disabled={loading}
                className={`py-5 rounded-2xl items-center ${loading ? 'bg-primary/50' : 'bg-primary shadow-xl shadow-primary/30'}`}
            >
                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-black text-lg uppercase">Link Account</Text>}
            </TouchableOpacity>
        </View>
    );

    const renderPinPad = () => (
        <View className="flex-1 justify-center px-6">
            <View className="items-center mb-12">
                <View className="w-16 h-16 bg-surface border border-border rounded-full items-center justify-center mb-6">
                    <Lock size={30} color="#E1E7ED" />
                </View>
                <Text className="text-text-primary text-3xl font-black">Security Pin</Text>
                <Text className="text-text-muted mt-2 text-center">Hello {realUser?.id || 'Trader'}, enter your app PIN to continue.</Text>
            </View>

            <TextInput
                className="bg-surface border-2 border-primary/30 p-6 rounded-[24px] text-text-primary text-4xl font-black text-center tracking-[10px] mb-8"
                placeholder="****"
                placeholderTextColor="#2A2E39"
                keyboardType="numeric"
                secureTextEntry
                maxLength={4}
                value={pin}
                onChangeText={(val) => {
                    setPin(val);
                    if (val.length === 4) {
                        // Small delay for better UX
                        setTimeout(() => verifyPin(val), 100);
                    }
                }}
            />

            <TouchableOpacity onPress={() => setView('CHOICE')}>
                <Text className="text-text-muted text-center font-bold">Switch Account</Text>
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
                {view === 'CHOICE' && renderChoice()}
                {view === 'TOKEN' && renderTokenInput()}
                {view === 'PIN' && renderPinPad()}

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
