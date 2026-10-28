import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type { OrderSaleUnit, ProductionContainerView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDangerZoneComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { ProductionContainersService } from '../production-containers.service';

/** La borne du serveur sur le nom du contenant (`productionContainerSchema`). */
const NAME_MAX = 40;

/** Ce que le dialogue règle : le contenant principal d'un produit. */
export interface ProductionContainerDialogData {
  readonly sku: string;
  readonly productName: string;
  /**
   * `weight` : le nombre se règle en GRAMMES, l'unité des fournées de
   * l'article (P6 de `plan-vente-au-poids.md`). Absente = des pièces.
   */
  readonly saleUnit?: OrderSaleUnit;
  /** `null` : aucun contenant réglé, les champs partent vides. */
  readonly container: ProductionContainerView | null;
  /** `production_settings:write` ? Sans lui, le dialogue se lit et se ferme. */
  readonly canWrite: boolean;
}

/**
 * **Le dialogue du contenant principal** d'un produit (plan
 * `documentation/fournil/plan-fournee-v3.md`, §5) : singulier, pluriel,
 * pièces ; s'il est réglé, une `fold-danger-zone` pour le retirer. Même forme
 * que le dialogue d'un raccourci, dont il partage la page.
 *
 * Il écrit lui-même et dit le refus du serveur sur place : fermé, il rend
 * `true` si quelque chose a changé, rien sinon.
 */
@Component({
  selector: 'app-production-container-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDangerZoneComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './production-container-dialog.html',
  styleUrl: './production-container-dialog.scss',
})
export class ProductionContainerDialog {
  private readonly api = inject(ProductionContainersService);
  private readonly ref = inject<FoldPanelRef<boolean>>(FoldPanelRef);

  readonly data = input.required<ProductionContainerDialogData>();

  protected readonly posed = computed(() => this.data().container !== null);
  protected readonly canWrite = computed(() => this.data().canWrite);
  protected readonly byWeight = computed(() => this.data().saleUnit === 'weight');

  protected readonly singular = linkedSignal(() => this.data().container?.singular ?? '');
  protected readonly plural = linkedSignal(() => this.data().container?.plural ?? '');
  protected readonly units = linkedSignal<number | null>(
    () => this.data().container?.unitsPerContainer ?? null,
  );
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** La forme qui peut partir ; le serveur juge le reste et le dit. */
  protected readonly canSubmit = computed(() => {
    const units = this.units();
    return (
      this.canWrite() &&
      !this.saving() &&
      named(this.singular()) &&
      named(this.plural()) &&
      units !== null &&
      Number.isInteger(units) &&
      units >= 1
    );
  });

  protected async submit(): Promise<void> {
    const units = this.units();
    if (!this.canSubmit() || units === null) {
      return;
    }
    const rule = {
      unitsPerContainer: units,
      singular: this.singular().trim(),
      plural: this.plural().trim(),
    };
    await this.gesture(
      () => this.api.set(this.data().sku, rule),
      "Le contenant n'a pas pu être enregistré.",
    );
  }

  protected async remove(): Promise<void> {
    if (!this.posed() || !this.canWrite() || this.saving()) {
      return;
    }
    await this.gesture(
      () => this.api.remove(this.data().sku),
      "Le contenant n'a pas pu être retiré.",
    );
  }

  protected cancel(): void {
    this.ref.close();
  }

  /** Un geste vers le serveur : fermé sur un succès, le refus dit sur place. */
  private async gesture(run: () => Promise<void>, fallback: string): Promise<void> {
    this.saving.set(true);
    this.failure.set(null);
    try {
      await run();
      this.ref.close(true);
    } catch (error) {
      this.failure.set(httpErrorMessage(error, fallback));
    } finally {
      this.saving.set(false);
    }
  }
}

function named(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= NAME_MAX;
}
