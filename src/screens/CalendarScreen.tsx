import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, TrendingUp, TrendingDown } from 'lucide-react-native';
import { API_URL, TEST_USER_ID } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CalendarScreen = () => {
    const [pnlData, setPnlData] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const fetchPnL = async () => {
        try {
            setLoading(true);
            const savedId = await AsyncStorage.getItem('USER_ID');
            const uid = savedId || TEST_USER_ID;
            const res = await fetch(`${API_URL}/stats/daily/${uid}`);
            const data = await res.json();
            setPnlData(data);
        } catch (error) {
            console.error("Error fetching PnL stats:", error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchPnL();
        }, [])
    );

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month + 1, 0).getDate();
    };

    const firstDayOfMonth = (date: Date) => {
        return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    };

    const renderHeader = () => {
        const monthYear = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
        return (
            <View className="flex-row justify-between items-center mb-8">
                <View>
                    <Text className="text-text-muted text-xs font-bold uppercase tracking-widest mb-1">Trading Activity</Text>
                    <Text className="text-2xl font-black text-text-primary">{monthYear}</Text>
                </View>
                <View className="flex-row gap-2">
                    <TouchableOpacity
                        onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                        className="w-10 h-10 bg-surface rounded-xl items-center justify-center border border-border"
                    >
                        <ChevronLeft size={20} color="#E1E7ED" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                        className="w-10 h-10 bg-surface rounded-xl items-center justify-center border border-border"
                    >
                        <ChevronRight size={20} color="#E1E7ED" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const renderCalendar = () => {
        const days = getDaysInMonth(currentMonth);
        const startDay = firstDayOfMonth(currentMonth);
        const calendar = [];

        // Week Headers
        const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const weekHeader = weekDays.map(d => (
            <View key={d} className="flex-1 items-center mb-4">
                <Text className="text-text-secondary text-[10px] font-black">{d}</Text>
            </View>
        ));

        // Rows
        let currentDay = 1;
        for (let i = 0; i < 6; i++) {
            const row = [];
            for (let j = 0; j < 7; j++) {
                if (i === 0 && j < startDay) {
                    row.push(<View key={`empty-${j}`} className="flex-1 h-20" />);
                } else if (currentDay > days) {
                    row.push(<View key={`empty-end-${j}`} className="flex-1 h-20" />);
                } else {
                    const dateStr = `${currentMonth.getFullYear()}-${(currentMonth.getMonth() + 1).toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`;
                    const pnl = pnlData[dateStr];
                    const dayNum = currentDay;

                    row.push(
                        <View key={dateStr} className="flex-1 h-20 border border-border/20 p-1">
                            <Text className="text-text-muted text-[10px] font-bold">{dayNum}</Text>
                            {pnl !== undefined && (
                                <View className={`flex-1 rounded-lg mt-1 items-center justify-center ${pnl >= 0 ? 'bg-success/10' : 'bg-error/10'}`}>
                                    <Text className={`text-[10px] font-black ${pnl >= 0 ? 'text-success' : 'text-error'}`}>
                                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}
                                    </Text>
                                </View>
                            )}
                        </View>
                    );
                    currentDay++;
                }
            }
            calendar.push(<View key={`row-${i}`} className="flex-row">{row}</View>);
            if (currentDay > days) break;
        }

        return (
            <View className="bg-surface rounded-3xl border border-border p-4 shadow-2xl">
                <View className="flex-row">{weekHeader}</View>
                {calendar}
            </View>
        );
    };

    const totalMonthPnL = Object.entries(pnlData).reduce((acc, [date, pnl]) => {
        const d = new Date(date);
        if (d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()) {
            return acc + pnl;
        }
        return acc;
    }, 0);

    return (
        <View className="flex-1 bg-background pt-12">
            <StatusBar barStyle="light-content" />
            <ScrollView
                className="flex-1 px-4"
                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPnL} tintColor="#2563eb" />}
            >
                <View className="mb-6">
                    <Text className="text-3xl font-black text-text-primary">Journal</Text>
                </View>

                {/* Monthly Summary */}
                <View className="bg-surface rounded-[32px] border border-border p-6 mb-8 flex-row items-center justify-between">
                    <View>
                        <Text className="text-text-muted text-xs font-bold uppercase tracking-widest mb-1">Monthly P&L</Text>
                        <Text className={`text-2xl font-black ${totalMonthPnL >= 0 ? 'text-success' : 'text-error'}`}>
                            {totalMonthPnL >= 0 ? '+' : ''}₹{totalMonthPnL.toLocaleString()}
                        </Text>
                    </View>
                    <View className={`w-12 h-12 rounded-2xl items-center justify-center ${totalMonthPnL >= 0 ? 'bg-success/10' : 'bg-error/10'}`}>
                        {totalMonthPnL >= 0 ? <TrendingUp size={24} color="#10B981" /> : <TrendingDown size={24} color="#EF4444" />}
                    </View>
                </View>

                {renderHeader()}
                {renderCalendar()}

                {/* Legend */}
                <View className="flex-row justify-center gap-6 mt-8 mb-12">
                    <View className="flex-row items-center">
                        <View className="w-3 h-3 rounded-full bg-success mr-2" />
                        <Text className="text-text-muted text-xs font-bold uppercase tracking-widest">Profit Day</Text>
                    </View>
                    <View className="flex-row items-center">
                        <View className="w-3 h-3 rounded-full bg-error mr-2" />
                        <Text className="text-text-muted text-xs font-bold uppercase tracking-widest">Loss Day</Text>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
};

export default CalendarScreen;
