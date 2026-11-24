export const vynoTapTheme = {
  colors: {
    navy: "#0B1220",
    navyRaised: "#111827",
    surface: "#151F30",
    surfaceRaised: "#1E293B",
    border: "#334155",
    text: "#F8FAFC",
    textMuted: "#A8B4C7",
    violet: "#6C4CF1",
    indigo: "#2B2A6B",
    teal: "#0F766E",
    emerald: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    success: "#10B981",
    white: "#FFFFFF",
    black: "#0F172A",
  },
  gradients: {
    brand: ["#6C4CF1", "#2B2A6B", "#10B981"] as const,
    operational: ["#0F766E", "#10B981"] as const,
  },
  radius: {
    small: 10,
    control: 14,
    card: 20,
    panel: 26,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  typography: {
    // Use platform-native system fonts; preserve the website's bold,
    // high-contrast heading hierarchy and readable body sizing.
    body: 15,
    caption: 12,
    label: 11,
    heading: 24,
    display: 32,
  },
} as const;

export type VynoTapTheme = typeof vynoTapTheme;
