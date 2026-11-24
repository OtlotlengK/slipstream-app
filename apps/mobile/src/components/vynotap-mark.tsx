import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

export function VynoTapMark({ size = 76 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id="vynoMarkGradient" x1="92" y1="92" x2="420" y2="420" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#6C4CF1" />
          <Stop offset="0.58" stopColor="#2B2A6B" />
          <Stop offset="1" stopColor="#10B981" />
        </LinearGradient>
      </Defs>
      <Rect x="28" y="28" width="456" height="456" rx="112" fill="#0F172A" />
      <Path d="M92 108h74l74 202 74-202h74L272 404h-64L92 108z" fill="url(#vynoMarkGradient)" />
      <Path d="M252 108h168v62h-53v234h-64V170h-51v-62z" fill="url(#vynoMarkGradient)" />
    </Svg>
  );
}
