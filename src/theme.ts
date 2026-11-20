/**
 * Design tokens for places that need raw values (icon colours, inline styles).
 * Keep in sync with tailwind.config.js, which exposes the same names as classes.
 *
 * Contrast (WCAG AA needs 4.5:1 for body text):
 *   textMuted #8B93A1 on surface #1C1F26 ≈ 5.2:1, on background ≈ 5.9:1
 *   textSecondary #A9B0BC on surface ≈ 7:1
 */
export const colors = {
    background: '#0E1116',
    surface: '#1C1F26',
    surfaceHighlight: '#252932',
    border: '#2A2E39',
    textPrimary: '#F3F4F6',
    textSecondary: '#A9B0BC',
    textMuted: '#8B93A1',
    primary: '#00E0A1',
    blue: '#3B82F6',
    success: '#00E0A1',
    error: '#FF4D4D',
    warning: '#FBBF24',
    tabBar: '#161A20',
} as const;

/** Profit/loss colour for a signed number (0 and null are neutral). */
export const signColor = (v?: number | null) =>
    v == null || v === 0 ? colors.textMuted : v > 0 ? colors.success : colors.error;
