import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import type { VariantMinQuantities } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldFieldsetComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';

/** Une clientèle : un champ de la carte. */
type MinQuantityAudience = keyof VariantMinQuantities;

/** Un minimum de 1 ne dit rien : le plus petit minimum qui contraint. */
const SMALLEST_MINIMUM = 2;

/** Aucun minimum, pour personne : ce que montre une déclinaison absente. */
const NO_MINIMUMS: VariantMinQuantities = { pro: null, public: null };

/**
 * Les deux champs, par audience seulement (Hugo, 2026-10-29) : le catalogue
 * ne sait pas distinguer d'office à emporter et sur place.
 */
const FIELDS: readonly { readonly key: MinQuantityAudience; readonly label: string }[] = [
  { key: 'public', label: 'Particuliers' },
  { key: 'pro', label: 'Professionnels' },
];

/**
 * **La quantité minimale d'une déclinaison** (`plan-quantite-minimale.md`, M3) :
 * un minimum pour les particuliers, un pour les professionnels, en pièces, pour
 * la déclinaison ouverte dans la barre.
 *
 * Elle écrit sur sa propre route, hors de « Tout enregistrer », comme
 * l'audience : un refus remet les champs dans l'état chargé, parce qu'une
 * carte qui affiche ce que le serveur a refusé mentirait sur ce qui se vend.
 */
@Component({
  selector: 'app-min-quantities-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldFieldsetComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './min-quantities-form.html',
  styleUrl: './min-quantities-form.scss',
})
export class MinQuantitiesForm {
  private readonly products = inject(ProductHttpApi);
  private readonly notify = inject(NotifyService);
  private readonly store = inject(ProductFormStore);

  protected readonly fields = FIELDS;
  protected readonly busy = signal(false);

  protected readonly variant = computed(() => {
    const id = this.store.selectedVariantId();
    return this.store.variants().find((candidate) => candidate.id === id) ?? null;
  });

  protected readonly soldByWeight = computed(() => this.variant()?.saleUnit === 'weight');
  protected readonly isDefault = computed(() => this.variant()?.isDefault ?? true);

  /** L'état chargé : la référence du « modifié ? ». */
  private readonly loaded = computed<VariantMinQuantities>(
    () => this.variant()?.minQuantities ?? NO_MINIMUMS,
  );
  private readonly loadedFollows = computed(
    () => this.variant()?.minQuantityFollowsDefault ?? false,
  );

  protected readonly draft = linkedSignal<VariantMinQuantities>(() => this.loaded());
  protected readonly follows = linkedSignal<boolean>(() => this.loadedFollows());

  /** Un champ saisi sous le minimum ou hors entier — le refus local. */
  protected readonly invalid = computed(
    () =>
      !this.follows() &&
      FIELDS.some(({ key }) => {
        const value = this.draft()[key];
        return value !== null && (!Number.isInteger(value) || value < SMALLEST_MINIMUM);
      }),
  );

  protected readonly dirty = computed(
    () =>
      this.follows() !== this.loadedFollows() ||
      (!this.follows() && !sameMinimums(this.draft(), this.loaded())),
  );

  protected readonly canSave = computed(() => this.dirty() && !this.invalid() && !this.busy());

  /** Cochée, la carte montre les minimums du défaut — ce qui s'appliquera vraiment. */
  private readonly defaultMinimums = computed(
    () =>
      this.store.variants().find((candidate) => candidate.isDefault)?.minQuantities ?? NO_MINIMUMS,
  );

  protected valueOf(audience: MinQuantityAudience): number | null {
    return (this.follows() ? this.defaultMinimums() : this.draft())[audience];
  }

  protected setValue(audience: MinQuantityAudience, value: number | null): void {
    this.draft.update((draft) => ({ ...draft, [audience]: value }));
  }

  protected async save(): Promise<void> {
    const variant = this.variant();
    if (variant === null || !this.canSave()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.products.setVariantMinQuantities(
        this.store.productId(),
        variant.id,
        this.follows() ? 'follow' : this.draft(),
      );
      this.notify.success(
        this.follows()
          ? 'La déclinaison suit le minimum de la déclinaison par défaut.'
          : 'Quantité minimale enregistrée.',
      );
      await this.store.reloadVariants();
    } catch (caught) {
      this.draft.set(this.loaded());
      this.follows.set(this.loadedFollows());
      this.notify.error(caught, "La quantité minimale n'a pas pu être enregistrée.");
    } finally {
      this.busy.set(false);
    }
  }
}

function sameMinimums(left: VariantMinQuantities, right: VariantMinQuantities): boolean {
  return left.pro === right.pro && left.public === right.public;
}
