import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SaeimaArc, WestminsterDiagram } from '../../components/Diagrams';
import { runSimulation } from '../simulate';
import { defaultDistricts } from '../../data/presets';
import { buildScenario, RIGHT, RIGHT_BLOCS, CENTER, CENTER_BLOCS, LEFT, LEFT_BLOCS } from './reference.test';
import { BUILTIN_TEMPLATES } from '../../data/builtinTemplates';

const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);

function extractSeats(html: string, r: number) {
  // parse each <circle ...> tag independently of attribute order
  const out: { cx: number; cy: number }[] = [];
  for (const m of html.matchAll(/<circle ([^>]*)>/g)) {
    const attrs = m[1];
    const rm = attrs.match(new RegExp(`r="${r}"`));
    if (!rm) continue;
    const cx = attrs.match(/cx="([\d.-]+)"/);
    const cy = attrs.match(/cy="([\d.-]+)"/);
    if (cx && cy) out.push({ cx: +cx[1], cy: +cy[1] });
  }
  return out;
}

describe('Full audit — all three chambers, all reference scenarios', () => {
  for (const [label, specs, blocs] of [
    ['RIGHT', RIGHT, RIGHT_BLOCS],
    ['CENTER', CENTER, CENTER_BLOCS],
    ['LEFT', LEFT, LEFT_BLOCS],
  ] as const) {
    it(`[${label}] Saeima valley: upright, centered bottom, arms at ends, correct order`, () => {
      const sc = buildScenario(specs as any, blocs as any, 20);
      const html = renderToString(<SaeimaArc scenario={sc} />);
      const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
      const W = +vb[1];
      const seats = extractSeats(html, 7.5);
      const expected = sc.parties.reduce((sum: number, p: any) => sum + p.saeimaSeats, 0);
      expect(seats.length).toBe(expected);
      const ys = seats.map((s) => s.cy);
      const lowest = Math.max(...ys);
      const highest = Math.min(...ys);
      // VALLEY: lowest seats at bottom-CENTER; highest at both ends
      const bottom = seats.filter((s) => s.cy > lowest - 8);
      const top = seats.filter((s) => s.cy < highest + 8);
      expect(Math.abs(avg(bottom.map((s) => s.cx)) - W / 2)).toBeLessThan(W * 0.12);
      expect(Math.min(...top.map((s) => s.cx))).toBeLessThan(W * 0.25);
      expect(Math.max(...top.map((s) => s.cx))).toBeGreaterThan(W * 0.75);
      // NOT upside down: the vertical middle of the canvas is ABOVE the band's center of mass
      expect(avg(ys)).toBeGreaterThan(+vb[2] * 0.42);
    });

    it(`[${label}] CoR Westminster: gov left, opp right, floor empty, cross-bench detached above`, () => {
      const sc = buildScenario(specs as any, blocs as any, 20);
      const res = runSimulation(sc, defaultDistricts());
      const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
      const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
      const W = +vb[1];
      const seats = extractSeats(html, 9);
      expect(seats.length).toBe(150);
      const titles = [...html.matchAll(/<circle[^>]*><title>([^<]*)<\/title>/g)].map((m) => m[1]);
      expect(titles.length).toBe(150);
      const govNames = new Set(sc.alliances.filter((a) => a.saeimaStatus === 'Government').map((a) => a.name));
      const oppNames = new Set(sc.alliances.filter((a) => a.saeimaStatus === 'Opposition').map((a) => a.name));
      const crossNames = new Set(sc.alliances.filter((a) => a.saeimaStatus === 'Cross-bench').map((a) => a.name));
      const govX: number[] = [], oppX: number[] = [];
      let crossMaxY = 0, nonCrossMinY = Infinity;
      seats.forEach((s, i) => {
        const n = titles[i].replace(/ \(.*\)/, '');
        if (govNames.has(n)) govX.push(s.cx);
        if (oppNames.has(n)) oppX.push(s.cx);
        if (crossNames.has(n)) crossMaxY = Math.max(crossMaxY, s.cy);
        else nonCrossMinY = Math.min(nonCrossMinY, s.cy);
      });
      if (govX.length && oppX.length) expect(avg(govX)).toBeLessThan(avg(oppX));
      // cross-bench sits ABOVE the other banks (detached)
      if (crossMaxY > 0 && nonCrossMinY < Infinity) expect(crossMaxY).toBeLessThan(nonCrossMinY + 26);
      // floor: between banks, below cross-bench — empty
      const crossBottom = crossMaxY;
      const floorHalf = W * 0.085;
      const inFloor = seats.filter((s, i) => {
        const n = titles[i].replace(/ \(.*\)/, '');
        return !crossNames.has(n) && Math.abs(s.cx - W / 2) < floorHalf && s.cy > crossBottom - 2;
      });
      expect(inFloor.length).toBe(0);
      // labels present
      expect(html).toContain('GOVERNMENT');
      expect(html).toContain('OPPOSITION');
    });

    it(`[${label}] CoG Westminster: 18 seats, 2× badges, gov/opp sides`, () => {
      const sc = buildScenario(specs as any, blocs as any, 20);
      const res = runSimulation(sc, defaultDistricts());
      const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
      const seats = extractSeats(html, 19);
      expect(seats.length).toBe(18);
      const badgeTexts = [...html.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
      expect(badgeTexts.filter((t) => t.includes('2')).length).toBeGreaterThanOrEqual(18);
      expect(html).toContain('36 joint votes');
    });

    it(`[${label}] totals + no splits (self-check silent)`, () => {
      const sc = buildScenario(specs as any, blocs as any, 20);
      const res = runSimulation(sc, defaultDistricts());
      expect(Object.values(res.councilorTotals).reduce((s, x) => s + x, 0)).toBe(150);
      expect(Object.keys(res.governors).length).toBe(18);
    });
  }

  it('built-in 25th Saeima template: renders all chambers correctly', () => {
    const tpl = BUILTIN_TEMPLATES.find((t) => t.label === '25th Saeima — The Left Won')!;
    const sc = tpl.build();
    const res = runSimulation(sc, defaultDistricts());
    const saeima = renderToString(<SaeimaArc scenario={sc} />);
    expect((saeima.match(/r="7\.5"/g) ?? []).length).toBe(300); // template sums to 300 (one unlisted seat)
    const cor = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
    expect((cor.match(/<circle [^>]*><title>/g) ?? []).length).toBe(150);
    const cog = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
    expect((cog.match(/<circle [^>]*><title>/g) ?? []).length).toBe(18);
  });
});
