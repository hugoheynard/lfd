import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { arc, hierarchy, type HierarchyRectangularNode, partition, select } from 'd3';

/** Un nœud du sunburst : un nom, une valeur (feuilles), d'éventuels enfants. */
export interface SunburstDatum {
  readonly name: string;
  readonly value: number;
  readonly children?: readonly SunburstDatum[];
}

/**
 * 7 teintes catégorielles validées CVD (méthode dataviz), une par branche de 1er
 * niveau — ordre fixe, jamais cyclé/réordonné (la sûreté daltonien en dépend).
 */
const HUES: readonly string[] = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
];

/** Éclaircit un hex vers le blanc (mix `amount` ∈ 0..1). */
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number): number => Math.round(c + (255 - c) * amount);
  return `#${((1 << 24) | (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255)).toString(16).slice(1)}`;
}

/** Couleur d'une branche de 1er niveau (par index), pour une légende hors composant. */
export function sunburstTopColor(index: number): string {
  return HUES[index % HUES.length] ?? '#64748b';
}

type Node = HierarchyRectangularNode<SunburstDatum>;

/**
 * **Sunburst** rendu en **D3** (comme la courbe de Lorenz) — un rendu « chic » : arcs
 * avec padding + coins arrondis, dégradé par profondeur (les sous-branches héritent
 * d'une teinte plus claire de leur catégorie), labels **radiaux courbés** sur les
 * arcs assez larges, traits fins. Impératif (SVG hors change detection), thème-aware.
 */
@Component({
  selector: 'app-sunburst',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  styles: [':host { display:block; width:100%; }'],
})
export class Sunburst {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly data = input.required<readonly SunburstDatum[]>();
  readonly height = input('440px');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.host.nativeElement.style.height = this.height();
      this.render();
      const observer = new ResizeObserver(() => this.render());
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    effect(() => {
      this.data();
      if (this.host.nativeElement.clientWidth > 0) {
        this.render();
      }
    });
  }

  private render(): void {
    const el = this.host.nativeElement;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    const surface = getComputedStyle(el).getPropertyValue('--fold-color-surface-card').trim();
    const gap = surface === '' ? '#ffffff' : surface;
    const radius = Math.min(width, height) / 2;

    const root = hierarchy<SunburstDatum>({ name: '', value: 0, children: this.data() })
      .sum((d) => (d.children && d.children.length > 0 ? 0 : d.value))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    partition<SunburstDatum>().size([2 * Math.PI, radius])(root);
    const nodes = (root.descendants() as Node[]).filter((d) => d.depth > 0);
    const tops = (root.children ?? []) as Node[];

    // Rayons par profondeur : petit trou central + anneau catégories + anneau sous-raisons.
    const ring = (depth: number): [number, number] =>
      depth === 1 ? [radius * 0.32, radius * 0.62] : [radius * 0.64, radius * 0.98];
    const midR = (d: Node): number => (ring(d.depth)[0] + ring(d.depth)[1]) / 2;

    const arcGen = arc<Node>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.008))
      .padRadius(radius)
      .innerRadius((d) => ring(d.depth)[0])
      .outerRadius((d) => ring(d.depth)[1])
      .cornerRadius(3);

    select(el).selectAll('svg').remove();
    const svg = select(el)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`)
      .style('font', "12px var(--fold-font-sans, system-ui, sans-serif)");

    svg
      .append('g')
      .selectAll('path')
      .data(nodes)
      .join('path')
      .attr('d', arcGen)
      .attr('fill', (d) => colorOf(d, tops))
      .attr('stroke', gap)
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .append('title')
      .text((d) => `${d.data.name} : ${d.value ?? 0}`);

    svg
      .append('g')
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'middle')
      .selectAll('text')
      .data(nodes.filter((d) => (d.x1 - d.x0) * midR(d) > 34))
      .join('text')
      .attr('transform', (d) => labelTransform(d, midR(d)))
      .attr('dy', '0.32em')
      .attr('fill', (d) => (d.depth === 1 ? '#ffffff' : '#334155'))
      .attr('font-weight', (d) => (d.depth === 1 ? 600 : 400))
      .attr('font-size', (d) => (d.depth === 1 ? 12 : 11))
      .text((d) => d.data.name);
  }
}

/** Teinte d'un nœud : catégorie de 1er niveau, enfants en dégradé clair par rang. */
function colorOf(d: Node, tops: readonly Node[]): string {
  let top = d;
  while (top.depth > 1 && top.parent !== null) {
    top = top.parent as Node;
  }
  const base = HUES[tops.indexOf(top) % HUES.length] ?? '#64748b';
  if (d.depth === 1) {
    return base;
  }
  const sibs = (d.parent?.children ?? []) as Node[];
  const j = Math.max(0, sibs.indexOf(d));
  const n = sibs.length;
  return lighten(base, n <= 1 ? 0.3 : 0.2 + (j / (n - 1)) * 0.34);
}

/** Transform D3 classique : place et oriente le label le long de l'arc. */
function labelTransform(d: Node, r: number): string {
  const angle = (((d.x0 + d.x1) / 2) * 180) / Math.PI - 90;
  return `rotate(${angle}) translate(${r},0) rotate(${angle < 90 ? 0 : 180})`;
}
