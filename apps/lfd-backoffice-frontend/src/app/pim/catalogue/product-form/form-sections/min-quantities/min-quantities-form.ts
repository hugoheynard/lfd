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
import { SalesContextStore } from '../../../../sales-contexts/sales-context-store';
import { ProductHttpApi } from '../../../product-http-api';
import { PRO_CONTEXT_KEY, ProductFormStore } from '../../product-form-store';

/** Une ligne de la grille : la clientèle. */
type MinQuantityAudience = keyof VariantMinQuantities;

/** La saisie d'une ligne — `null` = case vide, pas de minimum. */
type DraftRow = Readonly<Record<string, number | null>>;

/** La grille en cours de saisie, une ligne par clientèle. */
type DraftGrid = Readonly<Record<MinQuantityAudience, DraftRow>>;

/** Un minimum de 1 ne dit rien : le plus petit minimum qui contraint. */
const SMALLEST_MINIMUM = 2;

/** Un groupe de la carte : une clientèle et SES contextes, rien de croisé. */
interface AudienceGroup {
  readonly key: MinQuantityAudience;
  readonly label: string;
  readonly fields: readonly { readonly key: string; readonly label: string }[];
}

const AUDIENCES: readonly MinQuantityAudience[] = ['pro', 'public'];

/**
 * **La quantité minimale d'une déclinaison** (`plan-quantite-minimale.md`, M3) :
 * une grille clientèle × contexte de vente, en pièces, pour la déclinaison
 * ouverte dans la barre.
 *
 * Elle écrit sur sa propre route, hors de « Tout enregistrer », comme
 * l'audience : un refus remet la grille dans l'état chargé, parce qu'une grille
 * qui affiche ce que le serveur a refusé mentirait sur ce qui se vend.
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
  protected readonly contexts = inject(SalesContextStore).items;

  /**
   * Chaque contexte rangé sous SA clientèle (Hugo, 2026-10-29) : le contexte
   * B2B est le pro — retrait comme livraison —, les autres sont le public. Ni
   * « pro × à emporter » ni « public × B2B » n'existent.
   */
  protected readonly groups = computed<readonly AudienceGroup[]>(() => {
    const contexts = this.contexts();
    return [
      {
        key: 'public',
        label: 'Particuliers (B2C)',
        fields: contexts
          .filter((context) => context.key !== PRO_CONTEXT_KEY)
          .map((context) => ({ key: context.key, label: context.label })),
      },
      {
        key: 'pro',
        label: 'Professionnels (B2B)',
        fields: contexts
          .filter((context) => context.key === PRO_CONTEXT_KEY)
          .map((context) => ({ key: context.key, label: 'Retrait et livraison' })),
      },
    ];
  });
  protected readonly busy = signal(false);

  protected readonly variant = computed(() => {
    const id = this.store.selectedVariantId();
    return this.store.variants().find((candidate) => candidate.id === id) ?? null;
  });

  protected readonly soldByWeight = computed(() => this.variant()?.saleUnit === 'weight');
  protected readonly isDefault = computed(() => this.variant()?.isDefault ?? true);

  /** L'état chargé, en forme de saisie : la référence du « modifié ? ». */
  private readonly loadedGrid = computed<DraftGrid>(() =>
    toDraft(this.variant()?.minQuantities ?? null, this.groups()),
  );
  private readonly loadedFollows = computed(
    () => this.variant()?.minQuantityFollowsDefault ?? false,
  );

  protected readonly grid = linkedSignal<DraftGrid>(() => this.loadedGrid());
  protected readonly follows = linkedSignal<boolean>(() => this.loadedFollows());

  /** Les cases saisies sous le minimum ou hors entier — le refus local. */
  protected readonly invalid = computed(
    () =>
      !this.follows() &&
      AUDIENCES.some((audience) =>
        Object.values(this.grid()[audience]).some(
          (value) => value !== null && (!Number.isInteger(value) || value < SMALLEST_MINIMUM),
        ),
      ),
  );

  protected readonly dirty = computed(
    () =>
      this.follows() !== this.loadedFollows() ||
      (!this.follows() && !sameGrid(this.grid(), this.loadedGrid())),
  );

  protected readonly canSave = computed(() => this.dirty() && !this.invalid() && !this.busy());

  /** Cochée, la grille montre celle du défaut — ce qui s'appliquera vraiment. */
  private readonly defaultGrid = computed(() =>
    toDraft(
      this.store.variants().find((candidate) => candidate.isDefault)?.minQuantities ?? null,
      this.groups(),
    ),
  );

  protected cell(audience: MinQuantityAudience, contextKey: string): number | null {
    const source = this.follows() ? this.defaultGrid() : this.grid();
    return source[audience][contextKey] ?? null;
  }

  protected setCell(audience: MinQuantityAudience, contextKey: string, value: number | null): void {
    this.grid.update((grid) => ({
      ...grid,
      [audience]: { ...grid[audience], [contextKey]: value },
    }));
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
        this.follows() ? 'follow' : toPayload(this.grid()),
      );
      this.notify.success(
        this.follows()
          ? 'La déclinaison suit le minimum de la déclinaison par défaut.'
          : 'Quantité minimale enregistrée.',
      );
      await this.store.reloadVariants();
    } catch (caught) {
      this.grid.set(this.loadedGrid());
      this.follows.set(this.loadedFollows());
      this.notify.error(caught, "La quantité minimale n'a pas pu être enregistrée.");
    } finally {
      this.busy.set(false);
    }
  }
}

function toDraft(source: VariantMinQuantities | null, groups: readonly AudienceGroup[]): DraftGrid {
  const row = (audience: MinQuantityAudience): DraftRow => {
    const fields = groups.find((group) => group.key === audience)?.fields ?? [];
    return Object.fromEntries(
      fields.map((field) => [field.key, source?.[audience][field.key] ?? null]),
    );
  };
  return { pro: row('pro'), public: row('public') };
}

function sameGrid(left: DraftGrid, right: DraftGrid): boolean {
  return AUDIENCES.every((audience) => {
    const keys = new Set([...Object.keys(left[audience]), ...Object.keys(right[audience])]);
    return [...keys].every(
      (key) => (left[audience][key] ?? null) === (right[audience][key] ?? null),
    );
  });
}

/** Les cases vides ne partent pas : absente = aucun minimum. */
function toPayload(grid: DraftGrid): VariantMinQuantities {
  const row = (values: DraftRow): Record<string, number> =>
    Object.fromEntries(
      Object.entries(values).filter((entry): entry is [string, number] => entry[1] !== null),
    );
  return { pro: row(grid.pro), public: row(grid.public) };
}
