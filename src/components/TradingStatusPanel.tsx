import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Clock, ShieldAlert, ShieldCheck, ShieldQuestion, CalendarClock, Landmark } from 'lucide-react-native';
import {
    getTradingStatus, getMarketPulse, getEconomicCalendar, isExchangeOpen,
    TradingStatus, MarketPulse, EconomicCalendar,
} from '../api';
import WeekCalendar, { dayLabel } from './WeekCalendar';

/**
 * Dashboard "Events" tab: can I trade right now, and what is coming?
 *  - Exchange session: NSE hours from the clock; next session (holidays
 *    included) from the sentiment service.
 *  - Event halts: the economic events service's GO/NO-GO (no-trade windows
 *    around high-impact releases, results days, manual halts). Its "OPEN" only
 *    means "no halt", so the two are shown separately.
 *  - Next high-impact event and its no-trade window.
 *  - FII/DII provisional cash flows (last session).
 *  - The next 7 days of releases and results days.
 */

const REFRESH_MS = 60_000;
const GREEN = '#00E0A1', RED = '#FF4D4D', AMBER = '#FBBF24', MUTED = '#8B93A1';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** HH:MM in IST (UTC+5:30, no DST) without Intl time zones (Hermes). */
const istTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(new Date(iso).getTime() + 330 * 60_000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const istTodayIso = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const weekdayOf = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const inMinutes = (m?: number | null) =>
    m == null ? '' : m < 1 ? 'now' : m < 60 ? `in ${Math.round(m)} min` : `in ${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
/** ₹ crore with thousands separators and an explicit sign, no Intl. */
const crore = (v?: number | null) => {
    if (v == null) return '—';
    const n = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}₹${n} cr`;
};

const Card = ({ icon, title, value, color, children }: {
    icon: React.ReactNode; title: string; value: string; color: string; children?: React.ReactNode;
}) => (
    <View className="bg-surface rounded-3xl border border-border p-5 mb-3">
        <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-2xl items-center justify-center mr-3" style={{ backgroundColor: `${color}1A` }}>{icon}</View>
            <View className="flex-1">
                <Text className="text-text-muted text-[11px] font-black uppercase tracking-widest">{title}</Text>
                <Text className="font-black text-lg" style={{ color }}>{value}</Text>
            </View>
        </View>
        {children}
    </View>
);

/** Recent sessions' nets as bars around a zero line. */
function FlowBars({ values }: { values: number[] }) {
    const max = Math.max(...values.map(Math.abs), 1);
    const H = 14;
    return (
        <View className="flex-row items-center" style={{ height: H * 2 + 1 }}>
            {values.map((v, i) => (
                <View key={i} style={{ width: 5, marginLeft: i ? 2 : 0, height: H * 2 + 1, justifyContent: 'center' }}>
                    <View style={{
                        position: 'absolute', left: 0, right: 0, borderRadius: 1,
                        height: Math.max(1, (Math.abs(v) / max) * H),
                        backgroundColor: v >= 0 ? GREEN : RED,
                        opacity: i === values.length - 1 ? 1 : 0.55,
                        ...(v >= 0 ? { bottom: H + 1 } : { top: H + 1 }),
                    }} />
                </View>
            ))}
        </View>
    );
}

function FlowsCard({ flows }: { flows: NonNullable<MarketPulse['flows']> }) {
    const session = flows.find(f => f.session)?.session;
    return (
        <Card icon={<Landmark size={20} color={MUTED} />} title="Institutional flows"
            value={session ? `Session ${dayLabel(session, weekdayOf(session))}` : 'Last session'} color="#F3F4F6">
            {flows.map(f => {
                const color = f.impact === 'positive' ? GREEN : f.impact === 'negative' ? RED : MUTED;
                return (
                    <View key={f.key} className="flex-row items-center mt-4">
                        <View className="flex-1">
                            <Text className="text-text-primary text-[12px] font-black">{f.label}</Text>
                            <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={1}>
                                Buy {crore(f.buy).replace(/^\+| cr$/g, '')} · Sell {crore(f.sell).replace(/^\+| cr$/g, '')}
                            </Text>
                        </View>
                        {!!f.spark && f.spark.length > 1 && <View className="mr-3"><FlowBars values={f.spark.slice(-10)} /></View>}
                        <View className="items-end" style={{ minWidth: 92 }}>
                            <Text className="text-[14px] font-black" style={{ color, fontVariant: ['tabular-nums'] }}>{crore(f.value)}</Text>
                            <Text className="text-[11px] font-bold" style={{ color }}>{f.reading}</Text>
                        </View>
                    </View>
                );
            })}
            <Text className="text-text-muted text-[11px] mt-4 leading-4">
                NSE provisional cash-market figures, published after the close. Sustained FII selling tends to weigh on the next sessions; DIIs often absorb it.
            </Text>
        </Card>
    );
}

export default function TradingStatusPanel({ active }: { active: boolean }) {
    const [st, setSt] = useState<TradingStatus | null>(null);
    const [pulse, setPulse] = useState<MarketPulse | null>(null);
    const [cal, setCal] = useState<EconomicCalendar | null>(null);
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [, tick] = useState(0);

    const load = useCallback(async () => {
        const [s, p, c] = await Promise.allSettled([getTradingStatus(), getMarketPulse(), getEconomicCalendar(7)]);
        if (s.status === 'fulfilled') { setSt(s.value); setFailed(false); } else setFailed(true);
        if (p.status === 'fulfilled') setPulse(p.value);
        setCal(c.status === 'fulfilled' ? c.value : { available: false, days: [] });
        setLoading(false);
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
    const today = istTodayIso();
    const holiday = pulse?.available ? pulse.session?.holiday : null;
    const next = pulse?.available ? pulse.session?.next_session : null;
    const flows = pulse?.available ? pulse.flows || [] : [];

    return (
        <View>
            <Card icon={<Clock size={20} color={open ? GREEN : RED} />} title="Exchange session"
                value={open ? 'Open' : holiday ? 'Holiday' : 'Closed'} color={open ? GREEN : RED}>
                {!!holiday && <Text className="text-text-primary text-[12px] font-bold mt-3">{holiday}</Text>}
                <Text className="text-text-muted text-[11px] font-bold mt-3">NSE cash market · 09:15–15:30 IST, Mon–Fri</Text>
                {!open && !!next && (
                    <Text className="text-[11px] font-bold mt-1" style={{ color: GREEN }}>
                        Next session {next === today ? 'today' : dayLabel(next, weekdayOf(next))}, 09:15 IST
                    </Text>
                )}
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
                    <Text className="text-text-muted text-[11px] mt-3">No more market-moving releases are scheduled today. The week ahead is below.</Text>
                )}
            </Card>

            {flows.length > 0 && <FlowsCard flows={flows} />}

            <WeekCalendar cal={cal} todayIso={today} />
        </View>
    );
}
