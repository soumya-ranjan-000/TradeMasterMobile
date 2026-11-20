import React from 'react';
import { View, Text } from 'react-native';
import { EconomicCalendar, CalendarEvent } from '../api';

/**
 * The week ahead on the Events tab: high-impact releases (ForexFactory,
 * IST times) and results days (NSE board meetings) from the economic events
 * service. Weekend days with nothing on them are skipped.
 */

const GREEN = '#00E0A1', RED = '#FF4D4D', AMBER = '#FBBF24', MUTED = '#8B93A1', BLUE = '#60A5FA';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon 23 Nov" from an ISO date, no Intl. */
export const dayLabel = (iso: string, weekday?: string) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${weekday ? weekday + ' ' : ''}${d} ${MONTHS[m - 1] ?? ''}`;
};

const CURRENCY_COLOR: Record<string, string> = { INR: GREEN, USD: BLUE, EUR: '#A78BFA', CNY: RED, JPY: '#F472B6' };

function EventRow({ e }: { e: CalendarEvent }) {
    const earnings = e.category === 'earnings';
    const timed = e.time_status === 'exact' && e.time;
    const dim = e.past ? 0.45 : 1;
    const tag = earnings ? 'RESULTS' : e.currency || '—';
    const tagColor = earnings ? AMBER : CURRENCY_COLOR[e.currency || ''] || MUTED;
    const numbers = [
        e.actual ? `Actual ${e.actual}` : null,
        e.forecast ? `Fcst ${e.forecast}` : null,
        e.previous ? `Prev ${e.previous}` : null,
    ].filter(Boolean).join(' · ');

    return (
        <View className="flex-row py-2.5" style={{ opacity: dim }}>
            <Text className="text-text-primary text-[12px] font-black w-12" style={{ fontVariant: ['tabular-nums'] }}>
                {earnings ? 'Day' : timed ? e.time : (e.time || 'TBA')}
            </Text>
            <View className="py-0.5 rounded-md mr-2.5 self-start items-center" style={{ backgroundColor: `${tagColor}22`, width: 60 }}>
                <Text className="text-[11px] font-black" style={{ color: tagColor }}>{tag}</Text>
            </View>
            <View className="flex-1">
                <Text className="text-text-primary text-[12px] font-bold" numberOfLines={2}>
                    {earnings ? (e.symbols?.[0] || e.name) : e.name}
                </Text>
                {earnings ? (
                    <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={2}>
                        {e.company ? `${e.company} · ` : ''}{e.action === 'watch' ? 'watch only' : 'no new trades in it all session'}
                    </Text>
                ) : !!numbers && (
                    <Text className="text-text-muted text-[11px] mt-0.5">{numbers}</Text>
                )}
            </View>
        </View>
    );
}

export default function WeekCalendar({ cal, todayIso }: { cal: EconomicCalendar | null; todayIso: string }) {
    if (!cal) return null;
    if (!cal.available) {
        return (
            <View className="bg-surface rounded-3xl border border-border p-5 mb-3">
                <Text className="text-text-muted text-[11px] font-black uppercase tracking-widest">This week</Text>
                <Text className="text-text-muted text-[11px] mt-2">Calendar unavailable: the economic events service did not answer.</Text>
            </View>
        );
    }
    const macroUntil = cal.coverage?.macro_until || null;
    const resultsUntil = cal.coverage?.results_until || null;
    const visible = cal.days.filter((d, i) => {
        const weekend = d.weekday === 'Sat' || d.weekday === 'Sun';
        return i === 0 || d.events.length > 0 || !weekend;
    });
    // Consecutive empty days past the macro feed's reach collapse into one row.
    type Block = { date: string; weekday: string; events: CalendarEvent[]; until?: { date: string; weekday: string } };
    const days: Block[] = [];
    for (const d of visible) {
        const unpublished = !d.events.length && !!macroUntil && d.date > macroUntil && d.date !== todayIso;
        const last = days[days.length - 1];
        const lastUnpublished = last && !last.events.length && !!macroUntil && last.date > macroUntil && last.date !== todayIso;
        if (unpublished && lastUnpublished) last.until = { date: d.date, weekday: d.weekday };
        else days.push({ ...d });
    }
    const total = cal.days.reduce((n, d) => n + d.events.length, 0);

    return (
        <View className="bg-surface rounded-3xl border border-border p-5 mb-3">
            <View className="flex-row items-baseline justify-between">
                <Text className="text-text-muted text-[11px] font-black uppercase tracking-widest">Next 7 days</Text>
                <Text className="text-text-muted text-[11px] font-bold">{total} high-impact · IST</Text>
            </View>
            {days.map((d, i) => {
                const label = d.until ? `${dayLabel(d.date, d.weekday)} – ${dayLabel(d.until.date, d.until.weekday)}`
                    : d.date === todayIso ? 'Today' : cal.days[1]?.date === d.date ? 'Tomorrow' : dayLabel(d.date, d.weekday);
                const unpublished = !!macroUntil && d.date > macroUntil;
                return (
                    <View key={d.date} className={i ? 'mt-3 pt-3 border-t border-border' : 'mt-3'}>
                        <Text className="text-[11px] font-black uppercase tracking-wider"
                            style={{ color: d.date === todayIso ? GREEN : '#F3F4F6' }}>
                            {label}{!d.until && label !== dayLabel(d.date, d.weekday) ? <Text className="text-text-muted font-bold normal-case">  {dayLabel(d.date, d.weekday)}</Text> : null}
                        </Text>
                        {d.events.map(e => <EventRow key={e.event_id} e={e} />)}
                        {!d.events.length && (
                            <Text className="text-text-muted text-[11px] mt-1.5">
                                {unpublished
                                    ? `${resultsUntil && (d.until?.date || d.date) <= resultsUntil ? "No results days for the scanner's stocks. " : ''}Next week's macro calendar is published on Sunday.`
                                    : 'No high-impact events.'}
                            </Text>
                        )}
                    </View>
                );
            })}
            <Text className="text-text-muted text-[11px] mt-4 leading-4">
                Releases for {(cal.coverage?.currencies || ['USD', 'INR', 'EUR', 'CNY', 'JPY']).join(', ')}; results days for the stocks the scanner trades.
            </Text>
        </View>
    );
}
