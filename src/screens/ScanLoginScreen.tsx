/**
 * WhatsApp-Web-style sign-in: TradeMaster Web shows a QR code
 * ("trademaster-login:<qr_id>"); this screen scans it, shows which browser is
 * asking, and the user approves or denies. Only then is the browser signed in.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Linking, Platform, ScrollView, StatusBar, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Camera, CheckCircle2, XCircle, Monitor, ShieldAlert } from '../icons';
import { RootStackParamList } from '../navigation/RootNavigator';
import { paperFetch, errorMessage, authErrorText, serverDate, QR_PREFIX } from '../auth';
import { ScreenHeader, Card } from '../ui';
import { colors } from '../theme';
import { haptic } from '../haptics';
import { istDateTime } from '../format';

interface QrInfo {
    qr_id: string;
    web_label: string;
    web_ip?: string | null;
    created_at: string;
    expires_at: string;
    user_id: string;
}

type Phase =
    | { kind: 'scan' }
    | { kind: 'checking' }
    | { kind: 'approve'; info: QrInfo }
    | { kind: 'deciding'; info: QrInfo; approve: boolean }
    | { kind: 'done'; approved: boolean }
    | { kind: 'error'; title: string; message: string };

/** Friendly copy for the QR endpoints' error statuses. */
const qrError = (status: number, detail: string): { title: string; message: string } => {
    switch (status) {
        case 404: return { title: 'Code not recognised', message: detail || "This QR code isn't valid. Refresh the login page and scan again." };
        case 410: return { title: 'Code expired', message: 'This QR code has expired. Refresh the login page on TradeMaster Web and scan the new code.' };
        case 409: return { title: 'Code already used', message: detail || 'This QR code was already used. Refresh the login page and scan again.' };
        case 403: return { title: "Can't approve from here", message: detail || 'Only the signed-in mobile app can approve web logins.' };
        default: return { title: 'Something went wrong', message: detail || "Couldn't complete the request. Try again." };
    }
};

/** "trademaster-login:<id>" (or, when typed/pasted, a bare id) -> id; anything else -> null. */
const parseCode = (raw: string, allowBare: boolean): string | null => {
    const text = raw.trim();
    if (text.startsWith(QR_PREFIX)) {
        const id = text.slice(QR_PREFIX.length).trim();
        return id || null;
    }
    if (allowBare && /^[A-Za-z0-9_-]{8,128}$/.test(text)) return text;
    return null;
};

const ScanLoginScreen = () => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const isFocused = useIsFocused();
    const [permission, requestPermission] = useCameraPermissions();
    const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
    const [phase, setPhase] = useState<Phase>({ kind: 'scan' });
    const [manual, setManual] = useState('');
    const [manualError, setManualError] = useState<string | null>(null);
    // onBarcodeScanned fires repeatedly before state updates land; take only the first code.
    const locked = useRef(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // isAvailableAsync exists only in expo-camera's web build; on Android/iOS it throws
        // UnavailabilityError, which used to read as "no camera" on every phone. Native
        // devices are assumed to have one; a real failure arrives via onMountError.
        if (Platform.OS === 'web') {
            CameraView.isAvailableAsync().then(setCameraAvailable).catch(() => setCameraAvailable(false));
        } else {
            setCameraAvailable(true);
        }
        return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
    }, []);

    const close = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));

    const handleCode = async (raw: string, fromManual = false) => {
        const qrId = parseCode(raw, fromManual);
        if (!qrId) {
            // Not ours (some other QR in view): keep scanning.
            if (fromManual) setManualError(`That isn't a TradeMaster login code. It starts with "${QR_PREFIX}".`);
            return;
        }
        if (locked.current) return;
        locked.current = true;
        haptic.light();
        setManualError(null);
        setPhase({ kind: 'checking' });
        try {
            const res = await paperFetch(`/auth/qr/${encodeURIComponent(qrId)}/scan`, { method: 'POST' });
            if (res.ok) {
                setPhase({ kind: 'approve', info: await res.json() });
                return;
            }
            if (res.status === 401) return; // paperFetch already signed out and is returning to Login
            haptic.error();
            setPhase({ kind: 'error', ...qrError(res.status, await errorMessage(res, '')) });
        } catch (e) {
            haptic.error();
            setPhase({ kind: 'error', title: "Couldn't check the code", message: authErrorText(e) });
        }
    };

    const decide = async (info: QrInfo, approve: boolean) => {
        if (approve) haptic.light(); else haptic.select();
        setPhase({ kind: 'deciding', info, approve });
        try {
            const res = await paperFetch(`/auth/qr/${encodeURIComponent(info.qr_id)}/decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approve }),
            });
            if (res.ok) {
                const body = await res.json();
                const approved = body?.status === 'approved';
                if (approved) haptic.success();
                setPhase({ kind: 'done', approved });
                closeTimer.current = setTimeout(close, 2500);
                return;
            }
            if (res.status === 401) return;
            haptic.error();
            setPhase({ kind: 'error', ...qrError(res.status, await errorMessage(res, '')) });
        } catch (e) {
            haptic.error();
            setPhase({ kind: 'error', title: "Couldn't send your answer", message: authErrorText(e) });
        }
    };

    const scanAgain = () => {
        locked.current = false;
        setManual('');
        setManualError(null);
        setPhase({ kind: 'scan' });
    };

    // --- scanner -----------------------------------------------------------------------
    const renderCamera = () => {
        if (cameraAvailable === false) {
            return (
                <Card className="items-center py-8 mb-5">
                    <Camera size={28} color={colors.textMuted} />
                    <Text className="text-text-primary font-bold text-base mt-3 text-center">No camera available</Text>
                    <Text className="text-text-muted text-[13px] text-center mt-1.5 leading-5">Paste the code shown under the QR code on TradeMaster Web below.</Text>
                </Card>
            );
        }
        if (!permission || cameraAvailable === null) {
            return (
                <View className="aspect-square rounded-3xl bg-surface border border-border items-center justify-center mb-5">
                    <ActivityIndicator color={colors.primary} />
                </View>
            );
        }
        if (!permission.granted) {
            const canAsk = permission.canAskAgain;
            return (
                <Card className="items-center py-8 px-6 mb-5">
                    <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center mb-4">
                        <Camera size={26} color={colors.primary} />
                    </View>
                    <Text className="text-text-primary font-bold text-base text-center">{canAsk ? 'Allow camera access' : 'Camera access is turned off'}</Text>
                    <Text className="text-text-muted text-[13px] text-center mt-1.5 leading-5">
                        {canAsk
                            ? 'TradeMaster uses the camera only to scan the login QR code shown on TradeMaster Web.'
                            : 'Turn on camera access for TradeMaster in your phone settings, or paste the code below instead.'}
                    </Text>
                    {canAsk ? (
                        <Pressable onPress={requestPermission} accessibilityRole="button"
                            className="mt-5 px-6 py-3 rounded-2xl bg-primary active:opacity-80">
                            <Text className="text-background font-black">Allow camera</Text>
                        </Pressable>
                    ) : Platform.OS !== 'web' ? (
                        <Pressable onPress={() => Linking.openSettings().catch(() => { })} accessibilityRole="button"
                            className="mt-5 px-6 py-3 rounded-2xl bg-surfaceHighlight border border-border active:opacity-80">
                            <Text className="text-text-primary font-bold">Open Settings</Text>
                        </Pressable>
                    ) : null}
                </Card>
            );
        }
        return (
            <View className="aspect-square rounded-3xl overflow-hidden bg-black border border-border mb-3">
                {isFocused && phase.kind === 'scan' && (
                    <CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={phase.kind === 'scan' ? ({ data }) => { handleCode(data); } : undefined}
                        onMountError={() => setCameraAvailable(false)}
                    />
                )}
                {/* Viewfinder */}
                <View pointerEvents="none" style={StyleSheet.absoluteFill} className="items-center justify-center">
                    <View style={{ width: '68%', aspectRatio: 1, borderRadius: 24, borderWidth: 3, borderColor: `${colors.primary}CC` }} />
                </View>
            </View>
        );
    };

    const renderScan = () => (
        <>
            <Text className="text-text-secondary text-[14px] leading-5 mb-4">
                Open TradeMaster Web on your computer and point your phone at the QR code on its login page.
            </Text>
            {renderCamera()}
            {permission?.granted && cameraAvailable && (
                <Text className="text-text-muted text-xs text-center mb-5">Other QR codes are ignored.</Text>
            )}

            <Text className="text-text-muted text-xs font-bold uppercase tracking-wider mb-2">Can't scan? Paste the code</Text>
            <View className={`bg-surface border rounded-2xl px-4 py-1 flex-row items-center ${manualError ? 'border-error/60' : 'border-border'}`}>
                <TextInput
                    className="flex-1 text-text-primary font-semibold py-3"
                    placeholder={`${QR_PREFIX}…`}
                    placeholderTextColor="#6B7280"
                    value={manual}
                    onChangeText={(v) => { setManual(v); setManualError(null); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Login code"
                    onSubmitEditing={() => handleCode(manual, true)}
                />
            </View>
            {!!manualError && <Text className="text-error text-[13px] font-semibold mt-2" accessibilityLiveRegion="polite">{manualError}</Text>}
            <Pressable onPress={() => handleCode(manual, true)} disabled={!manual.trim()} accessibilityRole="button"
                className={`mt-3 py-4 rounded-2xl items-center ${manual.trim() ? 'bg-surfaceHighlight border border-border active:opacity-80' : 'bg-surface border border-border opacity-50'}`}>
                <Text className="text-text-primary font-bold">Continue with code</Text>
            </Pressable>
        </>
    );

    // --- approval -------------------------------------------------------------------------
    const Detail = ({ label, value }: { label: string; value: string }) => (
        <View className="flex-row justify-between py-2.5 border-t border-border">
            <Text className="text-text-muted text-[13px] font-semibold mr-4">{label}</Text>
            <Text className="text-text-primary text-[14px] font-bold flex-1 text-right" numberOfLines={2}>{value}</Text>
        </View>
    );

    const renderApprove = (info: QrInfo, busy: false | { approve: boolean }) => (
        <>
            <Card className="mb-4">
                <View className="items-center pt-2 pb-4">
                    <View className="w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center mb-4">
                        <Monitor size={30} color={colors.primary} />
                    </View>
                    <Text accessibilityRole="header" className="text-text-primary text-2xl font-black text-center">Log in to TradeMaster Web?</Text>
                    <Text className="text-text-muted text-[13px] text-center mt-1.5">A browser is asking to sign in to your account.</Text>
                </View>
                <Detail label="Browser" value={info.web_label || 'Web browser'} />
                <Detail label="IP address" value={info.web_ip || 'Unknown'} />
                <Detail label="Requested" value={istDateTime(serverDate(info.created_at))} />
                <Detail label="Account" value={info.user_id} />
            </Card>

            <View className="flex-row items-start mb-6 px-1">
                <ShieldAlert size={16} color={colors.warning} style={{ marginTop: 2 }} />
                <Text className="text-text-secondary text-[13px] leading-5 ml-2 flex-1">
                    Only approve if you are signing in on a computer in front of you right now. Never approve a code someone sent you.
                </Text>
            </View>

            <Pressable onPress={() => decide(info, true)} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Approve web login"
                className="py-5 rounded-2xl items-center bg-primary active:opacity-80 mb-3" style={{ opacity: busy && !busy.approve ? 0.5 : 1 }}>
                {busy && busy.approve ? <ActivityIndicator color={colors.background} /> : <Text className="text-background font-black text-lg">Approve</Text>}
            </Pressable>
            <Pressable onPress={() => decide(info, false)} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Deny web login"
                className="py-5 rounded-2xl items-center border active:opacity-80"
                style={{ borderColor: `${colors.error}80`, backgroundColor: `${colors.error}14`, opacity: busy && busy.approve ? 0.5 : 1 }}>
                {busy && !busy.approve ? <ActivityIndicator color={colors.error} /> : <Text className="font-black text-lg" style={{ color: colors.error }}>Deny</Text>}
            </Pressable>
        </>
    );

    // --- outcome ---------------------------------------------------------------------------
    const renderOutcome = (ok: boolean, title: string, message: string, showRetry: boolean) => (
        <View className="items-center pt-10">
            <View className="w-20 h-20 rounded-full items-center justify-center mb-5"
                style={{ backgroundColor: `${ok ? colors.success : colors.error}1A` }}>
                {ok ? <CheckCircle2 size={40} color={colors.success} /> : <XCircle size={40} color={colors.error} />}
            </View>
            <Text accessibilityRole="header" className="text-text-primary text-2xl font-black text-center">{title}</Text>
            <Text className="text-text-muted text-[14px] text-center mt-2 leading-5 px-4" accessibilityLiveRegion="polite">{message}</Text>
            {showRetry && (
                <Pressable onPress={scanAgain} accessibilityRole="button" className="mt-8 self-stretch py-4 rounded-2xl items-center bg-primary active:opacity-80">
                    <Text className="text-background font-black text-lg">Scan again</Text>
                </Pressable>
            )}
            <Pressable onPress={close} accessibilityRole="button"
                className={`${showRetry ? 'mt-3' : 'mt-8'} self-stretch py-4 rounded-2xl items-center bg-surface border border-border active:opacity-80`}>
                <Text className="text-text-primary font-bold">{showRetry ? 'Close' : 'Done'}</Text>
            </Pressable>
        </View>
    );

    const body = () => {
        switch (phase.kind) {
            case 'scan': return renderScan();
            case 'checking': return (
                <View className="items-center pt-16">
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text className="text-text-muted mt-4 font-semibold">Checking the code…</Text>
                </View>
            );
            case 'approve': return renderApprove(phase.info, false);
            case 'deciding': return renderApprove(phase.info, { approve: phase.approve });
            case 'done': return phase.approved
                ? renderOutcome(true, 'TradeMaster Web is signed in', 'You can see and sign out browsers under Profile → Signed-in devices & browsers.', false)
                : renderOutcome(false, 'Login denied', 'The browser was not signed in.', false);
            case 'error': return renderOutcome(false, phase.title, phase.message, true);
        }
    };

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="light-content" />
            <ScreenHeader title="Log in to web" subtitle="Approve TradeMaster Web with this phone" onBack={close} compact />
            <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                {body()}
            </ScrollView>
        </View>
    );
};

export default ScanLoginScreen;
