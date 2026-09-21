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
import {
  arc,
  hierarchy,
  type HierarchyRectangularNode,
  interpolate,
  interpolateRainbow,
  partition,
  quantize,
  select,
} from 'd3';

/** Un nœud du sunburst : un nom, une valeur (feuilles), d'éventuels enfants. */
export interface SunburstDatum {
  readonly name: string;
  readonly value: number;
  readonly children?: readonly SunburstDatum[];
}

/** Rectangle polaire (angles + rayons normalisés) — l'état animable d'un arc. */
interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

type ANode = HierarchyRectangularNode<SunburstDatum> & { current: Rect; target?: Rect };

/**
 * Couleurs des branches de 1er niveau — `interpolateRainbow` quantifié (n+1 pour
 * éviter le repli), comme l'exemple Observable `@d3/sunburst/2`. Réutilisé par la
 * légende hors composant pour garder la correspondance couleur ↔ catégorie.
 */
export function sunburstColors(count: number): string[] {
  return quantize(interpolateRainbow, count + 1);
}

/**
 * **Sunburst zoomable** en **D3**, port fidèle de l'exemple `@d3/sunburst/2` : trois
 * anneaux visibles à la fois, **clic sur un arc = zoom** (transitions animées des
 * arcs et labels), **clic au centre = dézoom**. Couleurs `interpolateRainbow` par
 * catégorie, arcs translucides (0.6 branches / 0.4 feuilles), labels radiaux.
 * Impératif (SVG hors change detection), comme la courbe de Lorenz.
 */
@Component({
  selector: 'app-sunburst',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  styles: [':host { display:block; width:100%; overflow:hidden; }'],
})
export class Sunburst {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly data = input.required<readonly SunburstDatum[]>();
  readonly height = input('440px');
  /**
   * Couleur par **nom de nœud de 1er niveau** (la couleur suit la catégorie, pas son
   * rang). Absent → dégradé positionnel `interpolateRainbow` de l'exemple d'origine.
   */
  readonly nodeColors = input<ReadonlyMap<string, string> | null>(null);

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
      this.nodeColors();
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
    // Petite marge (0.94) pour que l'anneau extérieur et ses labels ne touchent pas le bord.
    const radius = ((Math.min(width, height) / 2) * 0.94) / 3;
    const ink = getComputedStyle(el).getPropertyValue('--fold-color-text').trim() || '#0b0b0b';

    const tree = hierarchy<SunburstDatum>({ name: 'Résiliations', value: 0, children: this.data() })
      .sum((d) => d.value)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const root = partition<SunburstDatum>().size([2 * Math.PI, tree.height + 1])(tree) as ANode;
    root.each((d) => ((d as ANode).current = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 }));
    const colors = sunburstColors((root.children ?? []).length);

    const arcGen = arc<Rect>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
      .padRadius(radius * 1.5)
      .innerRadius((d) => d.y0 * radius)
      .outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1));

    select(el).selectAll('svg').remove();
    const svg = select(el)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`)
      // Le SVG hérite de la police de la page : fold n'expose pas de token de
      // famille, et en nommer un ici aurait figé une famille de plus.
      .style('font-size', '11px');

    const rows = root.descendants().slice(1) as ANode[];
    const named = this.nodeColors();
    const colorOf = (d: ANode): string => {
      let n = d;
      while (n.depth > 1 && n.parent !== null) {
        n = n.parent as ANode;
      }
      return (
        named?.get(n.data.name) ??
        colors[(root.children ?? []).indexOf(n) % colors.length] ??
        '#888'
      );
    };

    const path = svg
      .append('g')
      .selectAll<SVGPathElement, ANode>('path')
      .data(rows)
      .join('path')
      .attr('fill', colorOf)
      .attr('fill-opacity', (d) => (arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0))
      .attr('pointer-events', (d) => (arcVisible(d.current) ? 'auto' : 'none'))
      .attr('d', (d) => arcGen(d.current));
    path.append('title').text((d) => `${d.data.name} : ${d.value ?? 0}`);

    const label = svg
      .append('g')
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'middle')
      .attr('fill', ink)
      .style('user-select', 'none')
      .selectAll<SVGTextElement, ANode>('text')
      .data(rows)
      .join('text')
      .attr('dy', '0.35em')
      .attr('fill-opacity', (d) => (labelVisible(d.current) ? 1 : 0))
      .attr('transform', (d) => labelTransform(d.current, radius))
      .text((d) => truncate(d.data.name, d.depth === 1 ? 20 : 14));

    const parent = svg
      .append('circle')
      .datum(root)
      .attr('r', radius)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .style('cursor', 'pointer');

    const clicked = (_event: unknown, p: ANode): void => {
      parent.datum((p.parent ?? root) as ANode);
      root.each(
        (d) =>
          ((d as ANode).target = {
            x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            y0: Math.max(0, d.y0 - p.depth),
            y1: Math.max(0, d.y1 - p.depth),
          }),
      );
      // Transitions par sélection (même durée) : le partage d'instance bute sur le
      // typage d3 croisé, et l'effet visuel est identique sur 750 ms.
      path
        .transition()
        .duration(750)
        .tween('data', (d) => {
          const i = interpolate(d.current, d.target ?? d.current);
          return (time) => (d.current = i(time));
        })
        .attr('fill-opacity', (d) =>
          arcVisible(d.target ?? d.current) ? (d.children ? 0.6 : 0.4) : 0,
        )
        .attr('pointer-events', (d) => (arcVisible(d.target ?? d.current) ? 'auto' : 'none'))
        .attrTween('d', (d) => () => arcGen(d.current) ?? '');
      label
        .transition()
        .duration(750)
        .attr('fill-opacity', (d) => (labelVisible(d.target ?? d.current) ? 1 : 0))
        .attrTween('transform', (d) => () => labelTransform(d.current, radius));
    };

    parent.on('click', clicked);
    path
      .filter((d) => Boolean(d.children))
      .style('cursor', 'pointer')
      .on('click', clicked);
  }
}

/** Un arc est visible s'il est dans les 3 anneaux courants (hors racine). */
function arcVisible(d: Rect): boolean {
  return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
}

/** Un label est visible si son arc est dans les 3 anneaux et assez large (évite les débordements). */
function labelVisible(d: Rect): boolean {
  return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.06;
}

/** Tronque à `n` caractères avec une ellipse — les labels ne débordent pas de l'arc. */
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Transform D3 : place et oriente le label le long de l'arc. */
function labelTransform(d: Rect, radius: number): string {
  const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI;
  const y = ((d.y0 + d.y1) / 2) * radius;
  return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
}
