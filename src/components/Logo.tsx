// The Team Tracker logo. The same drawing is the browser tab icon (src/app/icon.svg).
export function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0ea5e9" />
      <rect x="5" y="9" width="10" height="3" rx="1" fill="#ffffff" />
      <rect x="8.5" y="9" width="3" height="14" rx="1" fill="#ffffff" />
      <rect x="17" y="9" width="10" height="3" rx="1" fill="#ffffff" />
      <rect x="20.5" y="9" width="3" height="14" rx="1" fill="#ffffff" />
    </svg>
  );
}
