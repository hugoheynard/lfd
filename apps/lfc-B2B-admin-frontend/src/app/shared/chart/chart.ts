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
import * as echarts from 'echarts';

/** Option ECharts — typée par la lib. */
export type ChartOption = echarts.EChartsOption;

/**
 * Enveloppe **ECharts** réutilisable. Impérative (le canvas vit hors du change
 * detection Angular), donc indépendante du mode zone/zoneless. Elle instancie le
 * graphe sur son hôte, ré-applique l'option à chaque changement d'entrée, suit le
 * redimensionnement, et **hérite du thème** en lisant les tokens fold (couleurs de
 * texte/bordure) pour rester cohérente en clair comme en sombre.
 */
@Component({
  selector: 'app-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  styles: [':host { display:block; width:100%; }'],
})
export class Chart {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private instance: echarts.ECharts | null = null;

  /** Option ECharts (séries, axes, etc.). Les couleurs de base sont injectées ici. */
  readonly option = input.required<ChartOption>();
  /** Hauteur CSS du graphe (le canvas suit). */
  readonly height = input('320px');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.host.nativeElement.style.height = this.height();
      this.instance = echarts.init(this.host.nativeElement, undefined, { renderer: 'canvas' });
      this.render();
      const observer = new ResizeObserver(() => this.instance?.resize());
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        this.instance?.dispose();
        this.instance = null;
      });
    });
    // Ré-applique l'option quand l'entrée change (après l'init).
    effect(() => {
      this.option();
      if (this.instance !== null) {
        this.render();
      }
    });
  }

  /** Fusionne l'option de l'appelant avec un socle de thème lu sur les tokens fold. */
  private render(): void {
    if (this.instance === null) {
      return;
    }
    this.instance.setOption({ ...this.themeBase(), ...this.option() }, { notMerge: true });
  }

  /** Socle de thème dérivé des variables CSS fold (texte, bordure, ton discret). */
  private themeBase(): ChartOption {
    const styles = getComputedStyle(this.host.nativeElement);
    const read = (name: string, fallback: string): string =>
      styles.getPropertyValue(name).trim() || fallback;
    const text = read('--fold-color-text', '#1f2937');
    const muted = read('--fold-color-text-muted', '#6b7280');
    const border = read('--fold-color-border', 'rgba(0,0,0,0.1)');
    return {
      textStyle: { color: text, fontFamily: 'inherit' },
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        axisLine: { lineStyle: { color: border } },
        axisLabel: { color: muted },
        splitLine: { show: false },
      },
      yAxis: {
        axisLine: { show: false },
        axisLabel: { color: muted },
        splitLine: { lineStyle: { color: border, type: 'dashed' } },
      },
      tooltip: { trigger: 'item' },
    };
  }
}
