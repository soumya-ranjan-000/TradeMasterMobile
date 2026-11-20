/**
 * Light haptic feedback for taps that change state. No-op on web and on
 * devices without a vibration motor; never throws.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const run = (fn: () => Promise<void>) => {
    if (Platform.OS === 'web') return;
    fn().catch(() => { });
};

export const haptic = {
    /** Selection changed (segmented control, tab, keypad digit). */
    select: () => run(() => Haptics.selectionAsync()),
    /** A light confirmation (toggle, long-press recognised). */
    light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
    /** Something succeeded (order placed, alert created). */
    success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
    /** Something was rejected (wrong PIN, failed order). */
    error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
