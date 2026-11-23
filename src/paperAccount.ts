/**
 * Which paper account the app shows and trades in: the trader's own (their
 * Trader ID, "Main") or one of their books - "<id>~lab" (every scanner strategy,
 * virtual top-ups allowed) or "<id>~real" (treated as real money). The choice is
 * kept in AsyncStorage; screens re-read it on focus, and the ones that stay
 * mounted listen with onPaperAccountChange.
 *
 * Watchlists, alerts and the profile stay on the Trader ID itself.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { paperFetch } from './auth';
import { TEST_USER_ID } from './config';

const KEY = 'PAPER_ACCOUNT';

export type AccountKind = 'standard' | 'lab' | 'real';

export interface PaperAccountRow {
    user_id: string;
    kind?: AccountKind;
    initial_balance: number;
    balance: number;
    equity: number;
    net_deposits?: number;
}

/** The signed-in Trader ID (owner of every account). */
export async function getOwnerId(): Promise<string> {
    return (await AsyncStorage.getItem('USER_ID')) || TEST_USER_ID;
}

const belongsTo = (id: string | null, owner: string) => !!id && (id === owner || id.startsWith(`${owner}~`));

/** The selected paper account; the Trader ID itself until a book is picked. */
export async function getPaperAccountId(): Promise<string> {
    const owner = await getOwnerId();
    const saved = await AsyncStorage.getItem(KEY).catch(() => null);
    return belongsTo(saved, owner) ? (saved as string) : owner;
}

type Listener = (id: string) => void;
const listeners = new Set<Listener>();

/** Called when another screen switches the account. Returns the unsubscribe. */
export function onPaperAccountChange(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

export async function setPaperAccountId(id: string): Promise<void> {
    const owner = await getOwnerId();
    if (!belongsTo(id, owner)) return;
    await AsyncStorage.setItem(KEY, id).catch(() => { });
    listeners.forEach(fn => fn(id));
}

export function accountLabel(a: { kind?: AccountKind } | null | undefined): string {
    if (a?.kind === 'lab') return 'Lab';
    if (a?.kind === 'real') return 'Real book';
    return 'Main';
}

/** The trader's own account plus their opened books ([] if the service can't say). */
export async function listAccounts(): Promise<PaperAccountRow[]> {
    try {
        const res = await paperFetch(`/accounts/${encodeURIComponent(await getOwnerId())}`);
        if (!res.ok) return [];
        const rows = await res.json();
        return Array.isArray(rows) ? rows : [];
    } catch {
        return [];
    }
}

/** Virtual top-up of a lab book. Throws Error(reason) when refused. */
export async function addFunds(accountId: string, amount: number): Promise<PaperAccountRow> {
    const res = await paperFetch(`/account/${encodeURIComponent(accountId)}/funds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : `Paper service returned ${res.status}`);
    return body;
}
