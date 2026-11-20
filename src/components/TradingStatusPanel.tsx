import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Clock, ShieldAlert, ShieldCheck, ShieldQuestion, CalendarClock } from 'lucide-react-native';
import { getTradingStatus, isExchangeOpen, TradingStatus } from '../api';

/**
 * Dashboard "Events" tab: can I trade right now?
 *  - Exchange session: NSE hours, from the clock.
 *  - Event halts: the economic events service's GO/NO-GO (no-trade windows
 *    around high-impact releases, results days, manual halts). Its "OPEN" only
 *    means "no halt", so the two are shown separately.
 *  - Next high-impact event and its no-trade window.
 */

const REFRESH_MS = 60_000;
const GREEN = '#00E0A1', RED = '#FF4D4D', AMBER = '#FBBF24', MUTED = '#8B93A1';

/** HH:MM in IST (UTC+5:30, no DST) without Intl time zones (Hermes). */
const istTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(new Date(iso).getTime() + 330 * 60_000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const inMinutes = (m?: number | null) =>
    m == null ? '' : m < 1 ? 'now' : m < 60 ? `in ${Math.round(m)} min` : `in ${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;

const Card = ({ icon, title, value, color, children }: {
    icon: React.ReactNode; title: string; value: string; color: string; children?: React.ReactNode;
}) => (
    <View className="bg-surface rounded-3xl border border-border p-5 mb-3">
        <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-2xl items-center justify-center mr-3" style={{ backgroundColor: `${color}1A` }}>{icon}</View>
            <View className="flex-1">
                <Text className="text-text-muted text-[10px] font-black uppercase tracking-widest">{title}</Text>
                <Text className="font-black text-lg" style={{ color }}>{value}</Text>
            </View>
        </View>
        {children}
    </View>
);

export default function TradingStatusPanel({ active }: { active: boolean }) {
    const [st, setSt] = useState<TradingStatus | null>(null);
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [, tick] = useState(0);

    const load = useCallback(async () => {
        try {
            setSt(await getTradingStatus());
            setFailed(false);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!active) return;
        load();
        const id = setInterval(() => { load(); tick(t => t + 1); }, REFRESH_MS);
        return () => clearInterval(id);
    }, [active, load]);

    if (loading && !st) return <View className="py-20 items-center"><ActivityIndicator color={GREEN} /></View>;

    const open = isExchangeOpen();
    const unknown = failed || st?.events_service === 'unavailable';
    const halted = !unknown && (st?.market_status === 'HALTED' || st?.trade_allowed === false);
    const degraded = !unknown && st?.data_fresh === false;
    const ev = st?.next_event;

    return (
        <View>
            <Card icon={<Clock size={20} color={open ? GREEN : RED} />} title="Exchange session"
                value={open ? 'Open' : 'Closed'} color={open ? GREEN : RED}>
                <Text className="text-text-muted text-[11px] font-bold mt-3">NSE cash market · 09:15–15:30 IST, Mon–Fri</Text>
            </Card>

            <Card
                icon={unknown ? <ShieldQuestion size={20} color={AMBER} /> : halted ? <ShieldAlert size={20} color={RED} /> : <ShieldCheck size={20} color={GREEN} />}
                title="Event halts"
                value={unknown ? 'Unknown' : halted ? 'Trading halted' : 'No halts'}
                color={unknown ? AMBER : halted ? RED : GREEN}
            >
                {unknown && (
                    <Text className="text-text-muted text-[11px] mt-3 leading-4">
                        The economic events service did not answer, so halts can't be checked. The scanner treats this as halted (fail-closed).
                    </Text>
                )}
                {halted && (
                    <View className="mt-3">
                        {(st?.active_halts?.length ? st.active_halts : [{ scope: 'GLOBAL', reason: st?.reason || 'Halted' }]).map((h, i) => (
                            <Text key={i} className="text-text-primary text-[11px] font-bold mb-1">
                                {h.scope === 'GLOBAL' ? 'All stocks' : h.scope}: <Text className="text-text-muted font-normal">{h.reason}</Text>
                                {h.until ? <Text className="text-text-muted"> · until {istTime(h.until)}</Text> : null}
                            </Text>
                        ))}
                    </View>
                )}
                {degraded && !halted && (
                    <Text className="text-[11px] mt-3" style={{ color: AMBER }}>Calendar data is stale; protection may be incomplete.</Text>
                )}
                {!unknown && !halted && !degraded && (
                    <Text className="text-text-muted text-[11px] font-bold mt-3">
                        No high-impact release window or manual halt is active{open ? ', so trading is allowed.' : '.'}
                    </Text>
                )}
            </Card>

            <Card icon={<CalendarClock size={20} color={ev ? AMBER : MUTED} />} title="Next high-impact event"
                value={ev ? ev.name : 'None left today'} color={ev ? '#F3F4F6' : MUTED}>
                {ev ? (
                    <View className="mt-3">
                        <Text className="text-text-muted text-[11px] font-bold">
                            {ev.currency ? `${ev.currency} · ` : ''}{istTime(ev.event_at)} IST{ev.minutes_to_event != null ? ` · ${inMinutes(ev.minutes_to_event)}` : ''}
                        </Text>
                        {!!(ev.start && ev.end) && (
                            <Text className="text-[11px] font-bold mt-1" style={{ color: AMBER }}>
                                No-trade window {istTime(ev.start)}–{istTime(ev.end)}{ev.scope && ev.scope !== 'GLOBAL' ? ` · ${ev.scope}` : ' · all stocks'}
                            </Text>
                        )}
                    </View>
                ) : (
                    <Text className="text-text-muted text-[11px] mt-3">No more market-moving releases are scheduled today.</Text>
                )}
            </Card>
        </View>
    );
}
