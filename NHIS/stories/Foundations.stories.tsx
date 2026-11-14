import type { Meta, StoryObj } from '@storybook/react-vite';
import { tokenValues } from '../tokens/types/tokens';
import { GLYPH_NAMES, Glyph } from '../components/shared/Glyph';
import { PriorityBadge } from '../components/shared/StatusTags';
import { Button } from '../components/station/controls';
import './stories.css';

const meta: Meta = { title: 'Foundations' };
export default meta;
type S = StoryObj;

function lum(hex: string) {
  const h = hex.replace('#', '').slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return ((x! + 0.05) / (y! + 0.05)).toFixed(2);
};

const C = tokenValues.color;
function Swatch({ name, hex, on, role }: { name: string; hex: string; on?: string; role: string }) {
  return (
    <div className="sb-swatch">
      <div className="sb-swatch__chip" style={{ background: hex }} />
      <div>
        <div className="sb-swatch__name">{name}</div>
        <div className="sb-swatch__hex nhis-num">{hex}</div>
        <div className="sb-swatch__role">{role}</div>
        {on && <div className="sb-swatch__ratio nhis-num">{ratio(hex, on)}:1 vs panel</div>}
      </div>
    </div>
  );
}

export const Color: S = {
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Colour</h1>
      <p className="sb-lede">
        Colour is reserved for coded meaning. Everything else is achromatic: surfaces, text, actions, selection and focus. Red, yellow and blue appear only as alert semantics
        (plus hazard striping); violet only marks simulation/training. Exact ratios are in <code>validation/contrast-report.md</code>.
      </p>
      <h2 className="sb-h2">Surfaces</h2>
      <div className="sb-grid">
        {Object.entries(C.surface)
          .filter(([, v]) => v.length === 7)
          .map(([k, v]) => (
            <Swatch key={k} name={`surface.${k}`} hex={v} role="Achromatic surface step" />
          ))}
      </div>
      <h2 className="sb-h2">Text</h2>
      <div className="sb-grid">
        {Object.entries(C.text).map(([k, v]) => (
          <Swatch key={k} name={`text.${k}`} hex={v} on={C.surface.panel} role={k === 'inverse' ? 'On light fills' : 'On dark surfaces'} />
        ))}
      </div>
      <h2 className="sb-h2">Alert semantics (reserved)</h2>
      <div className="sb-grid">
        {(['advisory', 'caution', 'warning', 'emergency'] as const).map((p) => (
          <div key={p} className="sb-swatch">
            <div className="sb-swatch__chip" style={{ background: C.status[p].fill }} />
            <div>
              <div className="sb-swatch__name">status.{p}</div>
              <div className="sb-swatch__hex nhis-num">
                fill {C.status[p].fill} · stroke {C.status[p].stroke}
              </div>
              <div className="sb-swatch__role">
                <PriorityBadge priority={p} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="sb-note">Emergency and Warning share red values (NASA App. F). They are separate tokens and differ by label, glyph, double ring, layer and annunciation.</p>
      <h2 className="sb-h2">Mode and hazard</h2>
      <div className="sb-grid">
        <Swatch name="mode.simulation.fill" hex={C.mode.simulation.fill} role="Simulation / training / what-if only" />
        <div className="sb-swatch">
          <div className="sb-swatch__chip sb-hazard" />
          <div>
            <div className="sb-swatch__name">hazard.stripe*</div>
            <div className="sb-swatch__role">Hazardous or irreversible commands (A10)</div>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const Typography: S = {
  render: () => {
    const roles = Object.entries(tokenValues.type) as Array<[string, { fontFamily: string; fontSize: string; lineHeight: string; fontWeight: number }]>;
    return (
      <div className="sb-page">
        <h1 className="sb-h1">Typography</h1>
        <p className="sb-lede">
          Atkinson Hyperlegible Next (interface) and Atkinson Hyperlegible Mono (numeric data), both SIL OFL 1.1 from the Braille Institute, chosen because they keep I / l / 1 and O / 0
          apart (NHIS A22). Mixed case everywhere. Nothing important below 16 px (12 pt); nothing below 14 px.
        </p>
        <table className="sb-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Sample</th>
              <th>Spec</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(([k, v]) => (
              <tr key={k}>
                <td className="nhis-num">type.{k}</td>
                <td style={{ fontFamily: v.fontFamily, fontSize: v.fontSize, lineHeight: v.lineHeight, fontWeight: v.fontWeight }}>
                  {k.startsWith('telemetry') || k === 'tabular' ? '−12.0 · 104 · 0.98' : 'Heart rate trend 1l I0O'}
                </td>
                <td className="nhis-num">
                  {v.fontSize}/{v.lineHeight} · {v.fontWeight}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="sb-h2">Character discrimination</h2>
        <p className="sb-specimen">Il1| O0o · rn m · 5S 2Z 8B</p>
        <p className="sb-specimen nhis-num">Il1| O0o · 0123456789 · −12.0</p>
      </div>
    );
  },
};

export const SpaceAndShape: S = {
  name: 'Space, size and shape',
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Space, size and shape</h1>
      <p className="sb-lede">4 px grid. Controls are 44 px by default (touch toward WCAG 2.5.5) and 32 px when compact (above the 24 px floor). Small radii, no pill shapes.</p>
      <div className="sb-space">
        {Object.entries(tokenValues.primitive.space).map(([k, v]) => (
          <div key={k} className="sb-space__row">
            <span className="nhis-num">space.{k}</span>
            <span className="sb-space__bar" style={{ width: v }} />
            <span className="nhis-num">{v}</span>
          </div>
        ))}
      </div>
      <h2 className="sb-h2">Radius</h2>
      <div className="sb-grid">
        {Object.entries(tokenValues.radius).map(([k, v]) => (
          <div key={k} className="sb-radius" style={{ borderRadius: v }}>
            radius.{k} · {v}
          </div>
        ))}
      </div>
    </div>
  ),
};

export const Glyphs: S = {
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Glyphs</h1>
      <p className="sb-lede">
        One 24 px grid, 2 px round strokes, drawn for NHIS. Alert glyphs have four distinct silhouettes (circle, triangle, octagon, filled double octagon) so priority reads without
        colour. Glyphs reinforce labels; they never replace them.
      </p>
      <div className="sb-glyphs">
        {GLYPH_NAMES.map((n) => (
          <div key={n} className="sb-glyph">
            <Glyph name={n} size={28} />
            <span className="nhis-num">{n}</span>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const MotionAndFlashing: S = {
  name: 'Motion and flashing',
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Motion and flashing</h1>
      <p className="sb-lede">
        Nominal UI is still. Motion only marks state change, feedback (≤ 100 ms) and disclosure (200 ms). Flashing is reserved for unacknowledged Warning and Emergency, glyph only, at 3 Hz
        / 50% duty ({tokenValues.flash.nontextHigh.periodMs} ms), synchronised across the display, and stops on acknowledgement. With reduced motion it becomes a steady white ring.
      </p>
      <div className="sb-row">
        <PriorityBadge priority="warning" flashing size="lg" />
        <PriorityBadge priority="emergency" flashing size="lg" />
        <PriorityBadge priority="warning" size="lg" />
        <Button isPending>Loading example</Button>
      </div>
    </div>
  ),
};
