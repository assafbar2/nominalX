import type { ChaosVectorId, StationCode } from "@nominalx/core";

export function NominalXLogo({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="40"
        height="40"
        rx="11"
        fill="var(--active-bg)"
        stroke="var(--active)"
        strokeWidth="2"
      />
      <circle
        cx="22"
        cy="22"
        r="12"
        stroke="var(--active)"
        strokeWidth="1.6"
        strokeDasharray="4 3"
      />
      <path
        d="M22 7V12M22 32V37M7 22H12M32 22H37"
        stroke="var(--active)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M22 13L29.5 28H14.5L22 13Z"
        fill="var(--active)"
        fillOpacity="0.22"
        stroke="var(--nominal)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="23" r="2.6" fill="var(--nominal)" />
    </svg>
  );
}

export function StationGlyph({
  code,
  color,
}: {
  code: StationCode;
  color: string;
}) {
  switch (code) {
    case "AUTH_SSO":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2L4 5.5V11.5C4 16.7 7.4 21.1 12 22.5C16.6 21.1 20 16.7 20 11.5V5.5L12 2Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="11" r="2.2" stroke={color} strokeWidth="2" />
          <path d="M12 13.2V16.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "RESIDENCY":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
          <ellipse cx="12" cy="12" rx="4.2" ry="9" stroke={color} strokeWidth="1.7" />
          <path d="M3.5 9H20.5M3.5 15H20.5" stroke={color} strokeWidth="1.7" />
        </svg>
      );
    case "WEBHOOKS":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M13 3L4 14H11L10 21L20 10H13L13 3Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "QUOTA_RATE":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4.5 16.5A8.5 8.5 0 1 1 19.5 16.5"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M12 14L16.5 9.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="14" r="2" fill={color} />
        </svg>
      );
    case "ALERTING":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18 15V10A6 6 0 0 0 6 10V15L4 18H20L18 15Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M9.5 18A2.5 2.5 0 0 0 14.5 18" stroke={color} strokeWidth="2" />
        </svg>
      );
    case "ROLLBACK":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 9H14A5.5 5.5 0 1 1 14 20H8"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M8 5L4 9L8 13"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

export function VectorGlyph({
  id,
  color,
}: {
  id: ChaosVectorId;
  color: string;
}) {
  switch (id) {
    case "duplicate_webhook":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2.5" stroke={color} strokeWidth="2" />
          <path d="M16 8V6A2 2 0 0 0 14 4H6A2 2 0 0 0 4 6V14A2 2 0 0 0 6 16H8" stroke={color} strokeWidth="2" />
        </svg>
      );
    case "out_of_order":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7H17M14 4L17 7L14 10" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 17H7M10 14L7 17L10 20" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "rate_limit_429":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 17L9 11L13 15L21 7" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 7H21V12" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "upstream_timeout_30s":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="13" r="8" stroke={color} strokeWidth="2" />
          <path d="M12 9V13L15 15M9 3H15" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "dual_hmac_rotation":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="8" cy="12" r="4" stroke={color} strokeWidth="2" />
          <path d="M12 12H21M18 12V15M15 12V14" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "additive_json_fields":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 4C6 4 6 6 6 8V10C6 11 4 12 4 12C4 12 6 13 6 14V16C6 18 6 20 8 20" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <path d="M16 4C18 4 18 6 18 8V10C18 11 20 12 20 12C20 12 18 13 18 14V16C18 18 18 20 16 20" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <path d="M12 9V15M9 12H15" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "clock_skew_5m":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" strokeDasharray="3 2" />
          <path d="M12 7V12L16 10" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
  }
}

export function ShieldLockIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2L4 5.5V11.5C4 16.6 7.4 20.9 12 22.3C16.6 20.9 20 16.6 20 11.5V5.5L12 2Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <rect x="9" y="11" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.9" />
      <path d="M10.2 11V9.5A1.8 1.8 0 0 1 13.8 9.5V11" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2V4.5M12 19.5V22M4.9 4.9L6.7 6.7M17.3 17.3L19.1 19.1M2 12H4.5M19.5 12H22M4.9 19.1L6.7 17.3M17.3 6.7L19.1 4.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5A6.8 6.8 0 0 0 20.5 14.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WireIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 17L10 11L4 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 19H20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
