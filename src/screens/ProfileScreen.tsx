import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StatusBar, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    User,
    Settings,
    LogOut,
    CreditCard,
    Shield,
    Bell,
    ChevronRight,
    Wallet,
    ChevronLeft
} from 'lucide-react-native';
import { API_URL, BREEZE_API_URL, TEST_USER_ID } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';

interface AccountData {
    balance: number;
    equity: number;
}

interface ProfileData {
    full_name: string;
    email?: string;
    profile_pic?: string;
}

const ProfileScreen = () => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [userId, setUserId] = useState<string>(TEST_USER_ID);
    const [account, setAccount] = useState<AccountData | null>(null);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const savedId = await AsyncStorage.getItem('USER_ID');
            const finalId = savedId || TEST_USER_ID;
            setUserId(finalId);

            // Fetch account and profile in parallel
            const [accRes, profRes] = await Promise.all([
                fetch(`${API_URL}/account/${finalId}`),
                fetch(`${API_URL}/profile/${finalId}`)
            ]);

            const accData = await accRes.json();
            const profData = await profRes.json();

            setAccount(accData);
            setProfile(profData);
        } catch (error) {
            console.error("Failed to fetch profile data:", error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [])
    );

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
    };

    const handleLogout = async () => {
        await AsyncStorage.clear();
        navigation.replace('Login');
    };

    const MenuItem = ({ icon: Icon, title, subtitle, onPress, color = "#2563eb" }: any) => (
        <TouchableOpacity
            onPress={onPress}
            className="flex-row items-center justify-between p-5 bg-surface rounded-[28px] border border-border mb-4"
        >
            <View className="flex-row items-center">
                <View className={`w-12 h-12 rounded-2xl items-center justify-center mr-4`} style={{ backgroundColor: `${color}15` }}>
                    <Icon size={22} color={color} />
                </View>
                <View>
                    <Text className="text-text-primary font-bold text-base">{title}</Text>
                    {subtitle && <Text className="text-text-muted text-xs mt-0.5">{subtitle}</Text>}
                </View>
            </View>
            <ChevronRight size={20} color="#6B7280" />
        </TouchableOpacity>
    );

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingTop: 20, paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={fetchData}
                        tintColor="#00E0A1"
                        colors={["#00E0A1"]}
                    />
                }
            >
                {/* Custom Header with Back Button */}
                <View className="px-6 pt-4 mb-4 flex-row items-center">
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        className="w-10 h-10 bg-surface rounded-full items-center justify-center border border-border"
                    >
                        <ChevronLeft size={24} color="#E1E7ED" />
                    </TouchableOpacity>
                    <Text className="ml-4 text-xl font-black text-text-primary">Profile</Text>
                </View>

                {/* Profile Header */}
                <View className="items-center px-6 mb-8">
                    <View className="w-24 h-24 rounded-full bg-surface border-4 border-primary/20 items-center justify-center mb-4">
                        <Text className="text-text-primary text-3xl font-black">
                            {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'TD'}
                        </Text>
                    </View>
                    <Text className="text-text-primary text-2xl font-black">{profile?.full_name || 'Trader'}</Text>
                    <Text className="text-text-muted text-sm font-medium mt-1">{profile?.email || 'trader@trademaster.io'}</Text>
                </View>

                {/* Total Balance Card (Moved from Dashboard) */}
                <View className="px-4 mb-8">
                    <LinearGradient
                        colors={['#00E0A1', '#059669']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        className="rounded-[32px] p-8 shadow-2xl shadow-primary/20 overflow-hidden"
                    >
                        <View className="items-center">
                            <Text className="text-white/70 text-sm mb-1 uppercase tracking-widest font-bold">Total Balance</Text>
                            <Text className="text-white text-4xl font-black tracking-tight mb-8">
                                {account ? formatCurrency(account.equity) : '₹0.00'}
                            </Text>

                            <View className="flex-row gap-4 w-full">
                                <TouchableOpacity className="flex-1 bg-white/20 py-3.5 rounded-2xl items-center border border-white/30">
                                    <Text className="text-white font-bold text-base">Deposit</Text>
                                </TouchableOpacity>
                                <TouchableOpacity className="flex-1 bg-white/10 py-3.5 rounded-2xl items-center border border-white/20">
                                    <Text className="text-white font-bold text-base">Withdraw</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        {/* Decorative Circle */}
                        <View className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-white/10" />
                    </LinearGradient>
                </View>

                {/* Settings & Options */}
                <View className="px-4">
                    <Text className="text-text-muted text-[10px] uppercase font-bold tracking-widest mb-4 ml-4">Account Settings</Text>

                    <MenuItem
                        icon={CreditCard}
                        title="Payment Methods"
                        subtitle="Manage your bank accounts & UPI"
                        onPress={() => { }}
                    />
                    <MenuItem
                        icon={Shield}
                        title="Security"
                        subtitle="PIN, Biometrics & Session management"
                        color="#10B981"
                        onPress={() => { }}
                    />
                    <MenuItem
                        icon={Bell}
                        title="Notifications"
                        subtitle="Configure price alerts & updates"
                        color="#F59E0B"
                        onPress={() => { }}
                    />
                    <MenuItem
                        icon={Settings}
                        title="App Preferences"
                        subtitle="Theme, Language & Chart settings"
                        color="#6366F1"
                        onPress={() => { }}
                    />

                    <View className="h-px bg-border my-4 mx-4" />

                    <TouchableOpacity
                        onPress={handleLogout}
                        className="flex-row items-center p-5 bg-error/5 rounded-[28px] border border-error/10 mb-4"
                    >
                        <View className="w-12 h-12 rounded-2xl bg-error/10 items-center justify-center mr-4">
                            <LogOut size={22} color="#EF4444" />
                        </View>
                        <View>
                            <Text className="text-error font-bold text-base">Logout</Text>
                            <Text className="text-error/60 text-xs mt-0.5">End your current session</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                <View className="items-center mt-4">
                    <Text className="text-text-muted text-[10px] font-bold uppercase tracking-widest opacity-50">TradeMaster Mobile v1.0.4</Text>
                </View>
            </ScrollView>
        </View>
    );
};

export default ProfileScreen;
