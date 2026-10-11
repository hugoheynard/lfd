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

import { photosWording } from '../media-wording';
import { parisDayLabel, parisDayOf } from '../paris-calendar';

/** La largeur minimale d'une colonne, en px CSS : en deçà, elle ne se lit plus. */
export const MIN_COLUMN_PX = 3;

/** Une plage de jours de Paris, `AAAA-MM-JJ`, bornes incluses. */
export interface StripRange {
  readonly from: string;
  readonly to: string;
}

/** La plage d'une colonne en jours de Paris. */
export function rangeOf(column: PaletteStripColumnView): StripRange {
  return {
    from: parisDayOf(column.from),
    to: parisDayOf(column.to),
  };
}

/** « 3 octobre 2026 · 1 photo », ou « 3 octobre 2026 – 9 octobre 2026 · 12 photos ». */
export function columnLabel(column: PaletteStripColumnView): string {
  const range = rangeOf(column);
  const from = parisDayLabel(column.from);
  const dates = range.from === range.to ? from : `${from} – ${parisDayLabel(column.to)}`;
  return `${dates} · ${photosWording(column.count)}`;
}

/** Combien de colonnes tiennent dans une largeur. */
export function columnsFor(width: number): number {
  return Math.max(1, Math.floor(width / MIN_COLUMN_PX));
}

/** Les fines bandes des écarts, en px CSS. */
const OUTLIER_PX = 2;
const HATCH_PX = 4;

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

  protected readonly summary = computed(() => {
    const view = this.view();
    if (view === null) {
      return '';
    }
    const { total, unpainted } = view;
    const photos = `${String(total)} photo${total > 1 ? 's' : ''}`;
    return unpainted === 0 ? photos : `${photos}, dont ${String(unpainted)} sans couleurs encore`;
  });

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
    const count = this.columns().length;
    const width = this.width();
    if (count === 0 || width === 0) {
      return null;
    }
    return Math.min(count - 1, Math.max(0, Math.floor((event.offsetX / width) * count)));
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
    const step = columns.length === 0 ? 0 : width / columns.length;
    columns.forEach((column, index) => {
      const x = index * step;
      const outliers = column.palette.filter((swatch) => swatch.outlier);
      const dominants = column.palette.filter((swatch) => !swatch.outlier);
      if (dominants.length === 0) {
        // Aucune palette connue sur la plage : une colonne hachurée.
        for (let y = 0; y < height; y += HATCH_PX) {
          context.fillStyle = hatch[(y / HATCH_PX) % 2] ?? '';
          context.fillRect(x, y, step, HATCH_PX);
        }
        return;
      }
      const bandsHeight = height - outliers.length * OUTLIER_PX;
      const total = dominants.reduce((sum, swatch) => sum + swatch.share, 0) || 1;
      let y = 0;
      for (const swatch of dominants) {
        const bandHeight = (swatch.share / total) * bandsHeight;
        context.fillStyle = swatch.hex;
        context.fillRect(x, y, step, bandHeight);
        y += bandHeight;
      }
      for (const swatch of outliers) {
        context.fillStyle = swatch.hex;
        context.fillRect(x, y, step, OUTLIER_PX);
        y += OUTLIER_PX;
      }
    });
  }
}
