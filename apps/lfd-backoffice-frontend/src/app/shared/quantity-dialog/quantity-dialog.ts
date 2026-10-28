import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldNumberInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

/** Ce qu'on règle : le nom de l'article, et la quantité déjà saisie. */
export interface QuantityDialogData {
  readonly label: string;
  readonly quantity: number | null;
}

/** Les pas, de part et d'autre du chiffre — les mêmes que la table au bureau. */
const STEPS = [1, 10, 50, 100] as const;

/**
 * **La quantité d'un article, en mobile** (Hugo, 2026-10-28) : sur un
 * téléphone, la ligne ne montre que sa case ; la toucher ouvre ce dialogue,
 * qui porte le chiffre et les raccourcis que la largeur ne laisse pas sur la
 * ligne. Rend la quantité validée (`0` retire l'article), rien si l'on ferme.
 */
@Component({
  selector: 'app-quantity-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './quantity-dialog.html',
  styleUrl: './quantity-dialog.scss',
})
export class QuantityDialog {
  static readonly foldPanel: FoldPanelDefaults = { side: 'bottom' };

  private readonly ref = inject<FoldPanelRef<number>>(FoldPanelRef);
  readonly data = input.required<QuantityDialogData>();

  protected readonly steps = STEPS;
  protected readonly downSteps = [...STEPS].reverse();
  protected readonly draft = linkedSignal(() => this.data().quantity);
  protected readonly empty = computed(() => (this.draft() ?? 0) === 0);

  /** Un pas : positif ajoute, négatif retire, sans descendre sous zéro. */
  protected step(delta: number): void {
    this.draft.set(Math.max(0, (this.draft() ?? 0) + delta));
  }

  protected submit(): void {
    this.ref.close(Math.max(0, this.draft() ?? 0));
  }

  protected cancel(): void {
    this.ref.close();
  }
}
