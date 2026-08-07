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
import type { AccountConcentration } from '@lfd/contracts';
import { area, line, scaleLinear, select } from 'd3';

/**
 * **Courbe de Lorenz** rendue en **D3** — le premier visuel sur-mesure de la data
 * viz v2. Montre la concentration du volume de commandes par compte : la diagonale
 * = égalité parfaite, la courbe s'en éloigne d'autant que quelques gros comptes
 * concentrent le volume ; l'aire entre les deux = l'inégalité (Gini). Impératif
 * (SVG hors change detection), donc indépendant du mode zone/zoneless.
 */
@Component({
  selector: 'app-lorenz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  styles: [':host { display:block; width:100%; }'],
})
export class Lorenz {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly data = input.required<AccountConcentration>();
  readonly height = input('280px');

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
    const styles = getComputedStyle(el);
    const accent = styles.getPropertyValue('--fold-color-accent').trim() || '#3b82f6';
    const muted = styles.getPropertyValue('--fold-color-text-muted').trim() || '#6b7280';
    const border = styles.getPropertyValue('--fold-color-border').trim() || 'rgba(0,0,0,0.1)';

    const m = { top: 12, right: 12, bottom: 28, left: 36 };
    const w = Math.max(1, width - m.left - m.right);
    const h = Math.max(1, height - m.top - m.bottom);
    const x = scaleLinear().domain([0, 1]).range([0, w]);
    const y = scaleLinear().domain([0, 1]).range([h, 0]);
    const pts = this.data().lorenz;

    const svg = select(el).selectAll('svg').data([null]);
    const svgEnter = svg.enter().append('svg');
    const root = svgEnter
      .merge(svg as never)
      .attr('width', width)
      .attr('height', height)
      .selectAll('g.root')
      .data([null]);
    const g = root
      .enter()
      .append('g')
      .attr('class', 'root')
      .merge(root as never)
      .attr('transform', `translate(${m.left},${m.top})`);
    g.selectAll('*').remove();

    // Cadre + axes minimalistes.
    g.append('rect').attr('width', w).attr('height', h).attr('fill', 'none').attr('stroke', border);
    g.append('text')
      .attr('x', w / 2)
      .attr('y', h + 22)
      .attr('text-anchor', 'middle')
      .attr('fill', muted)
      .attr('font-size', 11)
      .text('part cumulée des comptes');
    g.append('text')
      .attr('transform', `translate(-26,${h / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('fill', muted)
      .attr('font-size', 11)
      .text('part du volume');

    // Aire d'inégalité (entre la diagonale et la courbe).
    const gap = area<{ cumAccounts: number; cumVolume: number }>()
      .x((d) => x(d.cumAccounts))
      .y0((d) => y(d.cumAccounts))
      .y1((d) => y(d.cumVolume));
    g.append('path')
      .datum(pts as { cumAccounts: number; cumVolume: number }[])
      .attr('d', gap)
      .attr('fill', accent)
      .attr('opacity', 0.12);

    // Diagonale d'égalité.
    g.append('line')
      .attr('x1', x(0))
      .attr('y1', y(0))
      .attr('x2', x(1))
      .attr('y2', y(1))
      .attr('stroke', muted)
      .attr('stroke-dasharray', '4 4');

    // Courbe de Lorenz.
    const curve = line<{ cumAccounts: number; cumVolume: number }>()
      .x((d) => x(d.cumAccounts))
      .y((d) => y(d.cumVolume));
    g.append('path')
      .datum(pts as { cumAccounts: number; cumVolume: number }[])
      .attr('d', curve)
      .attr('fill', 'none')
      .attr('stroke', accent)
      .attr('stroke-width', 2);
  }
}
