import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/** Foreground = anything but 'background' (iOS 'inactive' is a brief overlay, not a pause). */
const isActive = () => AppState.currentState !== 'background';

const subscribe = (onChange: () => void) => {
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
};

/**
 * False while the app is in the background. Polls and timers key off it so they
 * stop in the background and restart (refreshing once) when the app returns.
 */
export const useAppActive = (): boolean => useSyncExternalStore(subscribe, isActive, isActive);
