import {
  ChangeDetectionStrategy,
  Component,
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

import type { OrderSaleUnit } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

/** Une ligne de la commande : ce qu'on demande d'elle, borné de 0 à `max`. */
export interface PackingPiecesLine {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: OrderSaleUnit;
  /** La quantité commandée — la borne haute. */
  readonly max: number;
  /** La valeur de départ : « tout est là » pour « Problème », 0 pour « Pièces retrouvées ». */
  readonly initial: number;
}

/**
 * Ce que le poste confie au dialogue : les lignes et le geste à appeler. Le
 * dialogue ne se ferme que si le geste est accepté ; un refus se lit dedans.
 */
export interface PackingPiecesDialogData {
  readonly title: string;
  /** La phrase sous le titre : ce que la quantité veut dire. */
  readonly intro: string;
  readonly confirmLabel: string;
  /** `true` : au moins une ligne doit être au-dessus de 0 pour confirmer. */
  readonly needsOne: boolean;
  readonly lines: readonly PackingPiecesLine[];
  readonly busy: Signal<boolean>;
  readonly refusal: Signal<string | null>;
  readonly submit: (quantities: ReadonlyMap<string, number>) => Promise<boolean>;
}

/**
 * **Combien, par produit ?** — « Problème » (ce qui est vraiment là) et
 * « Pièces retrouvées » (ce qui revient à la réserve) au colisage simple.
 * Une ligne par produit, de 0 à la quantité commandée.
 */
@Component({
  selector: 'app-packing-pieces-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './packing-pieces-dialog.html',
  styleUrl: './packing-pieces-dialog.scss',
})
export class PackingPiecesDialog implements FoldPanelContent<PackingPiecesDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<PackingPiecesDialogData>();

  private readonly panel = inject(FoldPanelRef);

  /** Ce qui a été tapé, par SKU ; une ligne absente garde sa valeur de départ. */
  private readonly typed = signal<ReadonlyMap<string, number | null>>(new Map());
  /** Le refus ne se lit qu'après un essai d'ici. */
  private readonly tried = signal(false);

  protected readonly refusal = computed(() => (this.tried() ? this.data().refusal() : null));

  /** La quantité de chaque ligne, `null` si le champ est vide ou hors bornes. */
  protected readonly quantities = computed<ReadonlyMap<string, number | null>>(() => {
    const typed = this.typed();
    return new Map(
      this.data().lines.map((line) => {
        const value = typed.has(line.sku) ? (typed.get(line.sku) ?? null) : line.initial;
        const valid = value !== null && Number.isInteger(value) && value >= 0 && value <= line.max;
        return [line.sku, valid ? value : null];
      }),
    );
  });

  protected readonly confirmable = computed(() => {
    const values = [...this.quantities().values()];
    if (values.some((value) => value === null)) {
      return false;
    }
    return !this.data().needsOne || values.some((value) => (value ?? 0) > 0);
  });

  protected quantityOf(sku: string): number | null {
    return this.quantities().get(sku) ?? null;
  }

  protected hint(line: PackingPiecesLine): string {
    return `Commandé : ${saleQuantityLabel(line.max, line.saleUnit)}`;
  }

  protected setQuantity(sku: string, value: number | null): void {
    this.typed.update((typed) => new Map(typed).set(sku, value));
  }

  protected async confirm(): Promise<void> {
    const data = this.data();
    if (data.busy() || !this.confirmable()) {
      return;
    }
    const quantities = new Map<string, number>();
    for (const [sku, value] of this.quantities()) {
      quantities.set(sku, value ?? 0);
    }
    this.tried.set(true);
    if (await data.submit(quantities)) {
      this.panel.close();
    }
  }

  protected cancel(): void {
    this.panel.close();
  }
}
