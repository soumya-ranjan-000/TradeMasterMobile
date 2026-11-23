import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StatusBar, RefreshControl, Pressable } from 'react-native';
import { ScreenHeader } from '../ui';
import { colors, signColor } from '../theme';
import { inr, groupIN, istDate } from '../format';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, ChevronRight } from '../icons';
import { paperFetch } from '../auth';
import { getPaperAccountId } from '../paperAccount';

const CalendarScreen = () => {
    const [pnlData, setPnlData] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const fetchPnL = async () => {
        try {
            setLoading(true);
            const uid = await getPaperAccountId();      // Main, Lab or Real book (Portfolio picks it)
            const res = await paperFetch(`/stats/daily/${encodeURIComponent(uid)}`);
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
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous month"
                        onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                        className="w-10 h-10 bg-surface rounded-xl items-center justify-center border border-border"
                    >
                        <ChevronLeft size={20} color="#E1E7ED" />
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next month"
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
        const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weekHeader = weekDays.map(d => (
            <View key={d} className="flex-1 items-center mb-4">
                <Text className="text-text-secondary text-[11px] font-black">{d}</Text>
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
                            <Text className="text-text-muted text-[11px] font-bold">{dayNum}</Text>
                            {pnl !== undefined && (
                                <View className={`flex-1 rounded-lg mt-1 items-center justify-center ${pnl > 0 ? 'bg-success/10' : pnl < 0 ? 'bg-error/10' : 'bg-surfaceHighlight'}`}>
                                    <Text className={`text-[11px] font-black ${pnl > 0 ? 'text-success' : pnl < 0 ? 'text-error' : 'text-text-muted'}`}>
                                        {pnl > 0 ? '+' : pnl < 0 ? '−' : ''}{groupIN(Math.abs(pnl), 0)}
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

    const monthKey = `${currentMonth.getFullYear()}-${(currentMonth.getMonth() + 1).toString().padStart(2, '0')}`;
    const monthDays = Object.entries(pnlData).filter(([d]) => d.startsWith(monthKey));
    const winDays = monthDays.filter(([, v]) => v > 0).length;
    const latest = Object.keys(pnlData).sort().pop();

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />
            <ScreenHeader title="Journal" subtitle="Daily P&L from closed paper trades" />
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 20 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPnL} tintColor={colors.primary} />}
            >
                {/* Monthly Summary */}
                <View className="bg-surface rounded-3xl border border-border p-4 mb-5">
                    <Text className="text-text-muted text-xs font-semibold">P&L this month</Text>
                    <Text className="text-3xl font-black mt-0.5" style={{ color: signColor(totalMonthPnL) === colors.textMuted ? colors.textPrimary : signColor(totalMonthPnL), fontVariant: ['tabular-nums'] }}>
                        {inr(totalMonthPnL, { sign: true })}
                    </Text>
                    <Text className="text-text-muted text-xs font-semibold mt-1">
                        {monthDays.length
                            ? `${monthDays.length} trading ${monthDays.length === 1 ? 'day' : 'days'} · ${winDays} in profit`
                            : 'No closed trades this month'}
                    </Text>
                    {!monthDays.length && latest && (
                        <Pressable onPress={() => { const [y, m] = latest.split('-').map(Number); setCurrentMonth(new Date(y, m - 1, 1)); }}
                            className="flex-row items-center mt-3 self-start" accessibilityRole="button">
                            <Text className="text-primary text-[13px] font-bold">Jump to latest trades ({istDate(`${latest}T12:00:00+05:30`)})</Text>
                            <ChevronRight size={15} color={colors.primary} />
                        </Pressable>
                    )}
                </View>

                {renderHeader()}
                {renderCalendar()}

                {/* Legend */}
                <View className="flex-row justify-center gap-6 mt-8 mb-12">
                    <View className="flex-row items-center">
                        <View className="w-3 h-3 rounded-full bg-success mr-2" />
                        <Text className="text-text-muted text-xs font-semibold">Profit day</Text>
                    </View>
                    <View className="flex-row items-center">
                        <View className="w-3 h-3 rounded-full bg-error mr-2" />
                        <Text className="text-text-muted text-xs font-semibold">Loss day</Text>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
};

export default CalendarScreen;
