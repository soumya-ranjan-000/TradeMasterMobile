/**
 * Number, money and time formatting shared by every screen.
 *
 * No Intl: Hermes on Android ships without full ICU, so en-IN grouping and
 * time zones are done by hand. Times are always IST (UTC+5:30, no DST).
 */

const IST_MS = 330 * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 1234567.891 -> "12,34,567.89" (Indian grouping). */
export function groupIN(v: number, decimals = 2): string {
    const [int, frac] = Math.abs(v).toFixed(decimals).split('.');
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${rest ? rest + ',' : ''}${last3}${frac ? '.' + frac : ''}`;
}

/**
 * Rupees. inr(1377.5) -> "₹1,377.50"; inr(-25, { sign: true }) -> "−₹25.00";
 * inr(1.2e7, { compact: true }) -> "₹1.20 Cr"; inr(9200, { trim: true }) -> "₹9,200".
 */
export function inr(v?: number | null, opts: { decimals?: number; sign?: boolean; compact?: boolean; trim?: boolean } = {}): string {
    if (v == null || !isFinite(v)) return '—';
    const { decimals = 2, sign = false, compact = false, trim = false } = opts;
    const s = v < 0 ? '−' : sign && v > 0 ? '+' : '';
    const a = Math.abs(v);
    if (compact && a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
    if (compact && a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
    const body = groupIN(a, decimals);
    return `${s}₹${trim ? body.replace(/\.0+$/, '') : body}`;
}

/** Plain number with Indian grouping, no currency. */
export const num = (v?: number | null, decimals = 2) =>
    v == null || !isFinite(v) ? '—' : `${v < 0 ? '−' : ''}${groupIN(v, decimals)}`;

/** pct(1.234) -> "+1.23%"; pct(-0.5) -> "−0.50%". */
export function pct(v?: number | null, decimals = 2, sign = true): string {
    if (v == null || !isFinite(v)) return '—';
    const s = v < 0 ? '−' : sign && v > 0 ? '+' : '';
    return `${s}${Math.abs(v).toFixed(decimals)}%`;
}

const ist = (d: Date | string | number) => new Date(new Date(d).getTime() + IST_MS);
const pad = (n: number) => String(n).padStart(2, '0');

/** "09:32" IST. */
export function istTime(d?: Date | string | number | null): string {
    if (d == null) return '—';
    const t = ist(d);
    return isNaN(t.getTime()) ? '—' : `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** "21 Nov" (or "Sat 21 Nov" with weekday). */
export function istDate(d?: Date | string | number | null, weekday = false): string {
    if (d == null) return '—';
    const t = ist(d);
    if (isNaN(t.getTime())) return '—';
    return `${weekday ? DAYS[t.getUTCDay()] + ' ' : ''}${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
}

/** "21 Nov, 09:32" IST; "Today, 09:32" when it is today in IST. */
export function istDateTime(d?: Date | string | number | null): string {
    if (d == null) return '—';
    const day = istDate(d);
    return `${day === istDate(Date.now()) ? 'Today' : day}, ${istTime(d)}`;
}

/** "3:30 PM" IST (12-hour clock). */
export function istClock(d?: Date | string | number | null): string {
    if (d == null) return '—';
    const t = ist(d);
    if (isNaN(t.getTime())) return '—';
    const h = t.getUTCHours();
    return `${h % 12 || 12}:${pad(t.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "2026-11-21": the IST calendar day. */
export function istDayKey(d?: Date | string | number | null): string {
    if (d == null) return '';
    const t = ist(d);
    return isNaN(t.getTime()) ? '' : `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** "Today, 9:26 AM" or "20 Nov, 9:26 AM" (IST, 12-hour). */
export function istWhen(d?: Date | string | number | null): string {
    if (d == null) return '—';
    const day = istDate(d);
    if (day === '—') return '—';
    return `${day === istDate(Date.now()) ? 'Today' : day}, ${istClock(d)}`;
}

/**
 * How to name the IST day of a coming moment: "" when it is today, the
 * weekday ("Mon") within the next 6 days, else the date ("30 Nov").
 */
export function istDayLabel(d: Date | string | number, now: Date | number = Date.now()): string {
    const a = istDayKey(d), b = istDayKey(now);
    if (!a || a === b) return '';
    const days = Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
    return days > 0 && days <= 6 ? DAYS[ist(d).getUTCDay()] : istDate(d);
}

/** "just now", "5 min ago", "3 h ago", then the date. */
export function ago(d?: Date | string | number | null, now = Date.now()): string {
    if (d == null) return '—';
    const ms = now - new Date(d).getTime();
    if (isNaN(ms)) return '—';
    const m = Math.round(ms / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    if (m < 24 * 60) return `${Math.floor(m / 60)} h ago`;
    return istDate(d);
}

/** "RELIANCE.NS" -> "RELIANCE". */
export const bareSymbol = (s: string) => s.toUpperCase().trim().replace(/\.(NS|BO)$/, '');
