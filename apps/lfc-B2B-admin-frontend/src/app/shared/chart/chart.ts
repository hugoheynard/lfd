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
    this.instance.setOption(mergeTheme(this.themeBase(), this.option()), { notMerge: true });
  }

  /**
   * Socle de thème dérivé des variables CSS fold. Il fixe la **grammaire visuelle**
   * commune à tous les graphes du produit : axes discrets (pas de ligne d'axe Y, ticks
   * masqués), lignes de fond en pointillé très léger, chiffres tabulaires, tooltip en
   * carte flottante. Les options d'appel n'écrasent que ce qu'elles précisent.
   */
  private themeBase(): ChartOption {
    const styles = getComputedStyle(this.host.nativeElement);
    const read = (name: string, fallback: string): string =>
      styles.getPropertyValue(name).trim() || fallback;
    const text = read('--fold-color-text', '#1f2937');
    const muted = read('--fold-color-text-muted', '#6b7280');
    const border = read('--fold-color-border', 'rgba(0,0,0,0.1)');
    const surface = read('--fold-color-surface', '#ffffff');
    const axisLabel = { color: muted, fontSize: 11, fontFamily: 'inherit' };
    return {
      textStyle: { color: text, fontFamily: 'inherit' },
      animationDuration: 420,
      animationEasing: 'cubicOut',
      grid: { left: 4, right: 12, top: 32, bottom: 4, containLabel: true },
      legend: {
        top: 0,
        icon: 'roundRect',
        itemWidth: 9,
        itemHeight: 9,
        itemGap: 14,
        textStyle: { color: muted, fontSize: 11, fontFamily: 'inherit' },
      },
      xAxis: {
        axisLine: { lineStyle: { color: border } },
        axisTick: { show: false },
        axisLabel,
        splitLine: { show: false },
      },
      yAxis: {
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel,
        nameTextStyle: { color: muted, fontSize: 10, align: 'left' },
        splitLine: { lineStyle: { color: border, type: 'dashed', opacity: 0.7 } },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: surface,
        borderColor: border,
        borderWidth: 1,
        padding: [8, 10],
        extraCssText: 'border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,0.12);',
        textStyle: { color: text, fontSize: 12, fontFamily: 'inherit' },
      },
    };
  }
}

/** Clés d'option fusionnées en profondeur (1 niveau) plutôt qu'écrasées. */
const MERGED_KEYS = ['grid', 'legend', 'xAxis', 'yAxis', 'tooltip', 'textStyle'] as const;

/**
 * Fusionne le socle de thème et l'option d'appel. Un simple *spread* ne suffit pas :
 * dès qu'une option déclare `xAxis` (quasi tous les graphes), elle écraserait tout le
 * thème de cet axe. On fusionne donc les clés de présentation **par-dessous** l'option,
 * y compris quand l'axe est un tableau (axes multiples).
 */
function mergeTheme(base: ChartOption, option: ChartOption): ChartOption {
  const out: Record<string, unknown> = { ...base, ...option };
  const asRecord = (v: unknown): Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  for (const key of MERGED_KEYS) {
    const baseValue = (base as Record<string, unknown>)[key];
    const value = (option as Record<string, unknown>)[key];
    if (value === undefined) {
      continue;
    }
    out[key] = Array.isArray(value)
      ? value.map((entry) => ({ ...asRecord(baseValue), ...asRecord(entry) }))
      : { ...asRecord(baseValue), ...asRecord(value) };
  }
  return out as ChartOption;
}
