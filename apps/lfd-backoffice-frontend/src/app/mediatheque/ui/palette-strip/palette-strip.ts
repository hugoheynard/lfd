import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import type { MediaPaletteStripView, PaletteStripColumnView } from '@lfd/pim-contracts';

import {
  columnAt,
  columnLabel,
  columnsFor,
  rangeOf,
  stripSummary,
  type StripRange,
} from '../../rules/palette-strip-layout';
import { paintStrip } from '../../rules/palette-strip-paint';

/**
 * **La frise des couleurs** (`mediatheque.md` §9 bis) — des colonnes AGRÉGÉES par le serveur,
 * dessinées sur UN canvas : la frise ne dépend pas du nombre de photos.
 *
 * Elle annonce sa largeur en colonnes ({@link columnsChange}) ; la page relit
 * la frise à cette largeur. Survol : la plage, le compte, une vignette. Clic
 * (`mediatheque.md` §9 bis) : la plage de la colonne, en jours de Paris, que la page
 * pose en filtre de prise de vue — la date même par laquelle la frise range.
 */
@Component({
  selector: 'app-palette-strip',
  templateUrl: './palette-strip.html',
  styleUrl: './palette-strip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaletteStrip {
  /** `null` tant que la frise n'est pas lue : le canvas mesure quand même sa largeur. */
  readonly view = input<MediaPaletteStripView | null>(null);
  private readonly columns = computed(() => this.view()?.columns ?? []);
  /** Le nombre de colonnes qui tiennent dans la largeur, à chaque changement. */
  readonly columnsChange = output<number>();
  /** La plage de la colonne cliquée, en jours de Paris, bornes incluses. */
  readonly rangeChosen = output<StripRange>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly width = signal(0);
  private readonly hoveredIndex = signal<number | null>(null);

  protected readonly hovered = computed(() => {
    const index = this.hoveredIndex();
    return index === null ? null : (this.columns()[index] ?? null);
  });
  protected readonly label = columnLabel;

  protected readonly summary = computed(() => stripSummary(this.view()));

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.host.nativeElement;
      const measure = (): void => {
        const width = element.clientWidth;
        if (width !== this.width()) {
          this.width.set(width);
          this.columnsChange.emit(columnsFor(width));
        }
      };
      measure();
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        destroyRef.onDestroy(() => observer.disconnect());
      }
    });
    effect(() => this.draw(this.columns(), this.width()));
  }

  protected hover(event: MouseEvent): void {
    this.hoveredIndex.set(this.indexAt(event));
  }

  protected choose(event: MouseEvent): void {
    const index = this.indexAt(event);
    const column = index === null ? undefined : this.columns()[index];
    if (column !== undefined) {
      this.rangeChosen.emit(rangeOf(column));
    }
  }

  protected leave(): void {
    this.hoveredIndex.set(null);
  }

  private indexAt(event: MouseEvent): number | null {
    return columnAt(event.offsetX, this.width(), this.columns().length);
  }

  private draw(columns: readonly PaletteStripColumnView[], width: number): void {
    const canvas = this.canvas().nativeElement;
    const context = canvas.getContext?.('2d') ?? null;
    if (context === null || width === 0) {
      return;
    }
    const ratio = globalThis.devicePixelRatio || 1;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const style = getComputedStyle(this.host.nativeElement);
    const hatch = [
      style.getPropertyValue('--fold-color-surface-subtle'),
      style.getPropertyValue('--fold-color-border-subtle'),
    ];
    paintStrip(context, columns, { width, height, hatch });
  }
}
