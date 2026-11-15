/**
 * Section icons for the Station navigation rail. NHIS's glyph set has no
 * section icons, so these follow its iconography rules: 24 px grid, 1.5 px
 * stroke, currentColor, no fills, always paired with a text label.
 */
export type NavKey = 'overview' | 'telemetry' | 'history' | 'protocol';

const PATHS: Record<NavKey, string> = {
  // Crosshair: what is happening now
  overview: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  // Line chart on axes: measurements over time
  telemetry: 'M4 4v16h16M7 15l4-4 3 3 5-6',
  // Clock: longitudinal history
  history: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  // Checklist: protocol steps
  protocol: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
};

export function NavIcon({ name, size = 24 }: { name: NavKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
