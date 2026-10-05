import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  type Signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldNumberInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

/** Le geste demandé — il donne au dialogue ses `data-*` et son bouton. */
export type PackingQuantityGesture = 'drop' | 'withdrawal';

/**
 * Ce que le tableau des contenants confie au dialogue. Le geste serveur reste
 * au tableau : le dialogue ne fait qu'appeler `submit`, et ne se ferme que
 * s'il a été accepté — un refus reste lisible au-dessus de la quantité.
 */
export interface PackingQuantityDialogData {
  readonly gesture: PackingQuantityGesture;
  /** « Mettre des Croissants dans B7Q ». */
  readonly title: string;
  readonly confirmLabel: string;
  /** La borne haute, et le défaut : « tout ». */
  readonly max: number;
  readonly busy: Signal<boolean>;
  /** Le refus du dernier geste, tel que le serveur l'a dit. */
  readonly refusal: Signal<string | null>;
  readonly submit: (quantity: number) => Promise<boolean>;
}

/**
 * **Combien ?** — au dépôt, au déplacement et au retrait d'une répartition.
 *
 * Un dialogue centré plutôt qu'une question en ligne : sur iPad, la colonne
 * des contenants défile, et la question s'ouvrait hors de la vue. Entrée
 * confirme, Échap annule (le panneau de fold), la quantité a le focus.
 */
@Component({
  selector: 'app-packing-quantity-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './packing-quantity-dialog.html',
  styleUrl: './packing-quantity-dialog.scss',
})
export class PackingQuantityDialog implements FoldPanelContent<PackingQuantityDialogData> {
  /** Un dialogue centré : la quantité suspend l'écran. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'sm', surface: 'solid' };

  readonly data = input.required<PackingQuantityDialogData>();

  private readonly panel = inject(FoldPanelRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** `undefined` : pas encore touchée, donc « tout ». */
  private readonly typed = signal<number | null | undefined>(undefined);
  /** Le refus ne se lit qu'après un essai d'ici : celui d'avant appartient à un autre geste. */
  private readonly tried = signal(false);
  protected readonly refusal = computed(() => (this.tried() ? this.data().refusal() : null));
  protected readonly quantity = computed(() => {
    const typed = this.typed();
    return typed === undefined ? this.data().max : typed;
  });

  constructor() {
    afterNextRender(() => {
      const field = this.host.nativeElement.querySelector('input');
      field?.focus();
      field?.select();
    });
  }

  protected setQuantity(value: number | null): void {
    this.typed.set(value);
  }

  protected async confirm(): Promise<void> {
    const data = this.data();
    const quantity = this.quantity();
    if (data.busy() || quantity === null || !Number.isInteger(quantity) || quantity <= 0) {
      return;
    }
    this.tried.set(true);
    if (await data.submit(quantity)) {
      this.panel.close();
    }
  }

  protected cancel(): void {
    this.panel.close();
  }
}
