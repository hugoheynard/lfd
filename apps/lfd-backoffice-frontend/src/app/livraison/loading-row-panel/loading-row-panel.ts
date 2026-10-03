import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
} from 'fold-ng';

import { BinScanner } from '../bin-scanner/bin-scanner';
import { type BinLoader, type FloorRow, locateBin, outOfRowNotice } from '../delivery-loading-rows';

/** Ce que le dernier scan du panneau a donné : la phrase de l'écran, et l'aide de rangée. */
interface PanelOutcome {
  readonly variant: 'success' | 'alert';
  readonly text: string;
  readonly elsewhere: string | null;
}

/**
 * **« Quoi mettre ici »** — une rangée du plancher, ouverte d'un toucher sur
 * le dessin : ses piles de gauche à droite, et pour chacune ses bacs du bas
 * vers le haut, chargés ou à charger.
 *
 * Le scan du panneau est LE geste de l'écran, prêté par lui (`loader`) : il
 * charge le bac quelle que soit sa rangée. Un bac d'une autre rangée se dit
 * (« ce bac va rangée 3, pile 2 ») sans être refusé — le plan suggère, il
 * n'impose pas.
 */
@Component({
  selector: 'app-loading-row-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BinScanner,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
  ],
  templateUrl: './loading-row-panel.html',
  styleUrl: './loading-row-panel.scss',
})
export class LoadingRowPanel {
  readonly row = input.required<FloorRow>();
  /** Toutes les rangées : pour dire où va un bac scanné qui n'est pas d'ici. */
  readonly rows = input<readonly FloorRow[]>([]);
  /** Cette rangée est celle à charger maintenant. */
  readonly current = input(false);
  /** La pile touchée sur le dessin, mise en avant ; `null` : toute la rangée. */
  readonly selectedStack = input<number | null>(null);
  /** Le geste de chargement de l'écran ; `null` : on ne fait que lire. */
  readonly loader = input<BinLoader | null>(null);
  readonly busy = input(false);

  readonly closed = output();

  protected readonly typed = signal('');
  protected readonly outcome = signal<PanelOutcome | null>(null);

  protected readonly subtitle = computed(() => {
    const row = this.row();
    const where = row.row === 1 ? 'le fond, à charger d’abord' : 'après la rangée précédente';
    return `${where} — ${String(row.loadedCount)} / ${String(row.binCount)} bac(s) chargé(s). Piles de gauche à droite, vu des portes ; bacs du bas vers le haut.`;
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Sur téléphone, le panneau s'ouvre sous le dessin, hors de l'écran : on
    // l'amène en vue à chaque rangée ouverte, sans animation si on la refuse.
    afterRenderEffect(() => {
      const element = this.host.nativeElement;
      if (this.row().row < 1 || typeof element.scrollIntoView !== 'function') {
        return;
      }
      const reduced =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    });
  }

  protected onScanned(raw: string): Promise<void> {
    return this.load(raw);
  }

  protected loadTyped(): Promise<void> {
    return this.load(this.typed());
  }

  private async load(raw: string): Promise<void> {
    const loader = this.loader();
    if (loader === null) {
      return;
    }
    const attempt = await loader(raw);
    const location = attempt.payload === null ? null : locateBin(this.rows(), attempt.payload);
    if (attempt.accepted) {
      this.typed.set('');
    }
    this.outcome.set({
      variant: attempt.accepted ? 'success' : 'alert',
      text: attempt.message,
      elsewhere: outOfRowNotice(location, this.row().row),
    });
  }
}
