import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { type ColumnWidthStep, twelfthsOf } from '@lfd/mail-blocks';
import { FoldBadgeComponent } from 'fold-ng';

import {
  boundaryAtFraction,
  boundaryPositions,
  boundaryRange,
  equalWidths,
  moveBoundary,
  placeBoundary,
  sameWidths,
  twelfthsPercent,
  widthsSpoken,
} from '../../rules/mail-column-boundaries';

const ROW_TWELFTHS = 12;

/** Une colonne dessinée : où elle commence et sa largeur, en pour cent de la ligne. */
interface GuideColumn {
  readonly start: number;
  readonly span: number;
  readonly step: ColumnWidthStep;
}

/** Une frontière dessinée, avec ce que sa poignée dit au lecteur d'écran. */
interface GuideBoundary {
  readonly index: number;
  readonly percent: number;
  /** La position dite au lecteur d'écran, en pour cent arrondi. */
  readonly now: number;
  readonly min: number;
  readonly max: number;
}

/**
 * **Les repères d'une mise en page en colonnes, dans le canevas** (demande de
 * Hugo du 2026-11-08 : voir la séparation, et tirer une poignée pour le ratio).
 *
 * Posés par-dessus le rendu du serveur, ils n'existent que dans l'éditeur :
 * un trait pointillé par frontière, le contour discret de chaque colonne, et
 * — quand on peut écrire — une poignée par frontière. Tirer la poignée
 * déplace la frontière entre ses DEUX colonnes voisines, aimantée au
 * douzième (règles de `mail-column-boundaries`) ; la frontière suit le
 * pointeur sur un brouillon local, et la répartition ne part qu'au lâcher —
 * un geste, une édition. Au clavier : flèches = un douzième, Début / Fin =
 * aux bornes ; double-clic = colonnes égales.
 */
@Component({
  selector: 'app-mail-column-guides',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
  templateUrl: './mail-column-guides.html',
  styleUrl: './mail-column-guides.scss',
  host: { '[class.emphasized]': 'emphasized()' },
})
export class MailColumnGuides {
  readonly widths = input.required<readonly ColumnWidthStep[]>();
  readonly canWrite = input(false);
  /** Le bloc est sélectionné : les repères se marquent. */
  readonly emphasized = input(false);
  readonly widthsChange = output<readonly ColumnWidthStep[]>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly announcer = inject(LiveAnnouncer);

  /** La répartition pendant un geste de pointeur ; `null` hors geste. */
  private readonly draft = signal<readonly ColumnWidthStep[] | null>(null);
  /** La frontière qu'on tire ; `null` hors geste. */
  protected readonly dragged = signal<number | null>(null);

  protected readonly shown = computed(() => this.draft() ?? this.widths());

  protected readonly columns = computed<readonly GuideColumn[]>(() => {
    let start = 0;
    return this.shown().map((step) => {
      const column = {
        start: (start / ROW_TWELFTHS) * 100,
        span: (twelfthsOf(step) / ROW_TWELFTHS) * 100,
        step,
      };
      start += twelfthsOf(step);
      return column;
    });
  });

  protected readonly boundaries = computed<readonly GuideBoundary[]>(() => {
    const widths = this.shown();
    return boundaryPositions(widths).map((position, index) => {
      const range = boundaryRange(widths, index);
      return {
        index,
        percent: (position / ROW_TWELFTHS) * 100,
        now: twelfthsPercent(position),
        min: twelfthsPercent(range.min),
        max: twelfthsPercent(range.max),
      };
    });
  });

  protected labelOf(index: number): string {
    return `Frontière entre la colonne ${index + 1} et la colonne ${index + 2}`;
  }

  protected valueTextOf(index: number): string {
    const widths = this.shown();
    return `Colonne ${index + 1} à ${widths[index] ?? 0} %, colonne ${index + 2} à ${widths[index + 1] ?? 0} %`;
  }

  protected onPointerDown(event: PointerEvent, index: number): void {
    if (!this.canWrite() || event.button !== 0) {
      return;
    }
    // Le bloc ne doit ni se glisser ni perdre la main : la poignée garde le pointeur.
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    if (handle instanceof HTMLElement) {
      handle.setPointerCapture(event.pointerId);
      handle.focus();
    }
    this.dragged.set(index);
    this.draft.set(this.widths());
  }

  protected onPointerMove(event: PointerEvent, index: number): void {
    const draft = this.draft();
    if (this.dragged() !== index || draft === null) {
      return;
    }
    const box = this.host.nativeElement.getBoundingClientRect();
    if (box.width <= 0) {
      return;
    }
    this.draft.set(boundaryAtFraction(draft, index, (event.clientX - box.left) / box.width));
  }

  protected onPointerUp(index: number): void {
    const draft = this.draft();
    if (this.dragged() !== index || draft === null) {
      return;
    }
    this.endGesture();
    this.commit(draft);
  }

  /** Un geste interrompu (le système reprend le pointeur) : rien n'est enregistré. */
  protected onPointerCancel(): void {
    this.endGesture();
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    if (!this.canWrite()) {
      return;
    }
    const widths = this.widths();
    const range = boundaryRange(widths, index);
    let next: readonly ColumnWidthStep[] | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      next = moveBoundary(widths, index, -1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      next = moveBoundary(widths, index, 1);
    } else if (event.key === 'Home') {
      next = placeBoundary(widths, index, range.min);
    } else if (event.key === 'End') {
      next = placeBoundary(widths, index, range.max);
    }
    if (next === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.commit(next);
  }

  /** Double-clic : colonnes égales. */
  protected onDoubleClick(event: MouseEvent): void {
    event.stopPropagation();
    const equal = equalWidths(this.widths().length);
    if (this.canWrite() && equal !== null) {
      this.commit(equal);
    }
  }

  private endGesture(): void {
    this.dragged.set(null);
    this.draft.set(null);
  }

  private commit(next: readonly ColumnWidthStep[]): void {
    if (sameWidths(next, this.widths())) {
      return;
    }
    this.widthsChange.emit(next);
    void this.announcer.announce(`Largeurs : ${widthsSpoken(next)}.`, 'polite');
  }
}
