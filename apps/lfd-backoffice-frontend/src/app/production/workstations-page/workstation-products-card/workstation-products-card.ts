import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import type {
  OffCatalogArticleView,
  WorkstationProductView,
  WorkstationView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldSearchComponent,
  type FoldSelectOption,
  type FoldTableColumn,
} from 'fold-ng';

import { GestureIntents, shownOnce } from '../../../shared/gesture-intents';
import { WorkstationsService } from '../../workstations.service';

/** La valeur « à ranger » du choix de poste : hors de l'espace des identifiants. */
export const UNPLACED = '';

const COLUMNS: readonly FoldTableColumn<WorkstationProductView>[] = [
  { key: 'shelf', label: 'Rayon' },
  { key: 'product', label: 'Produit' },
  { key: 'workstation', label: 'Poste' },
];

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Le rayon racine d'un produit : la clé du filtre par rayon. */
function rootOf(
  product: WorkstationProductView,
): { id: string; name: string; position: number } | null {
  const family = product.family;
  if (family === null) {
    return null;
  }
  return family.root ?? { id: family.id, name: family.name, position: family.position };
}

/**
 * **Les produits et leur poste** (`documentation/fournil/les-postes-du-fournil.md`,
 * § 3.8) : chaque produit avec son rayon, ses déclinaisons dessous pour
 * information, et le choix de son poste. Les déclinaisons en héritent.
 *
 * Filtres : « à ranger » (avec son compte), « commandé ces jours-ci », un
 * rayon, et la recherche. Un rayon choisi ouvre « tout ce rayon → ce poste »,
 * qui place ses produits d'un geste (`PlaceProducts`) sans laisser de règle :
 * un produit ajouté demain au rayon arrive « à ranger ».
 */
@Component({
  selector: 'app-workstation-products-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldSearchComponent,
  ],
  templateUrl: './workstation-products-card.html',
  styleUrl: './workstation-products-card.scss',
})
export class WorkstationProductsCard {
  private readonly api = inject(WorkstationsService);
  private readonly intents = new GestureIntents();

  readonly products = input.required<readonly WorkstationProductView[]>();
  readonly offCatalog = input.required<readonly OffCatalogArticleView[]>();
  readonly workstations = input.required<readonly WorkstationView[]>();
  /** Le compte servi des produits sans poste. */
  readonly unplacedCount = input.required<number>();
  readonly canWrite = input.required<boolean>();
  /** Le filtre « à ranger » demandé par l'adresse (l'alerte du Prod manager). */
  readonly unplacedFirst = input(false);
  /** Après un placement accepté : le parent relit. */
  readonly changed = output();

  protected readonly columns = COLUMNS;
  protected readonly skuOf = (product: WorkstationProductView): string => product.productSku;
  protected readonly nothingFound = { title: 'Aucun produit ne correspond.' };

  protected readonly onlyUnplaced = linkedSignal(() => this.unplacedFirst());
  protected readonly onlyOrdered = signal(false);
  protected readonly shelf = signal<string | null>(null);
  protected readonly query = signal('');
  /** Le poste choisi pour « tout ce rayon ». */
  protected readonly bulkTarget = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly unplacedLabel = computed(() => `À ranger (${String(this.unplacedCount())})`);

  /** « À ranger », puis les postes dans l'ordre des fiches. */
  protected readonly workstationOptions = computed<readonly FoldSelectOption<string>[]>(() => [
    { value: UNPLACED, label: 'À ranger' },
    ...this.workstations().map((station) => ({ value: station.id, label: station.name })),
  ]);

  /** Les postes seuls : la cible de « tout ce rayon ». */
  protected readonly targetOptions = computed<readonly FoldSelectOption<string>[]>(() =>
    this.workstations().map((station) => ({ value: station.id, label: station.name })),
  );

  /** Les rayons racine des produits, dans l'ordre du référentiel. */
  protected readonly shelfOptions = computed<readonly FoldSelectOption<string>[]>(() => {
    const roots = new Map<string, { name: string; position: number }>();
    for (const product of this.products()) {
      const root = rootOf(product);
      if (root !== null && !roots.has(root.id)) {
        roots.set(root.id, root);
      }
    }
    return [...roots]
      .sort(([, left], [, right]) => left.position - right.position)
      .map(([value, root]) => ({ value, label: root.name }));
  });

  protected readonly visibleProducts = computed(() => {
    const needle = normalize(this.query().trim());
    const shelf = this.shelf();
    return this.products().filter(
      (product) =>
        (!this.onlyUnplaced() || product.workstationId === null) &&
        (!this.onlyOrdered() || product.ordered) &&
        (shelf === null || rootOf(product)?.id === shelf) &&
        (needle === '' ||
          normalize(
            `${this.nameOf(product)} ${product.productSku} ${product.variants
              .map((variant) => `${variant.variantName} ${variant.sku}`)
              .join(' ')}`,
          ).includes(needle)),
    );
  });

  /** Les produits du rayon choisi — tout le rayon, quels que soient les autres filtres. */
  protected readonly shelfProducts = computed(() => {
    const shelf = this.shelf();
    return shelf === null ? [] : this.products().filter((product) => rootOf(product)?.id === shelf);
  });

  /** Le nom du produit ; à défaut, celui de sa première déclinaison. */
  protected nameOf(product: WorkstationProductView): string {
    return product.productName ?? product.variants[0]?.variantName ?? product.productSku;
  }

  protected shelfNameOf(product: WorkstationProductView): string {
    return product.family?.name ?? 'Plus au catalogue';
  }

  /** Le nom du poste d'un produit, pour qui ne peut pas le changer. */
  protected workstationNameOf(product: WorkstationProductView): string {
    const id = product.workstationId;
    return this.workstations().find((station) => station.id === id)?.name ?? 'À ranger';
  }

  protected placementOf(product: WorkstationProductView): string {
    return product.workstationId ?? UNPLACED;
  }

  protected place(product: WorkstationProductView, value: string): Promise<void> {
    const workstationId = value === UNPLACED ? null : value;
    if (workstationId === product.workstationId) {
      return Promise.resolve();
    }
    return this.send([product.productSku], workstationId);
  }

  protected placeShelf(): Promise<void> {
    const target = this.bulkTarget();
    const skus = this.shelfProducts().map((product) => product.productSku);
    if (target === null || skus.length === 0) {
      return Promise.resolve();
    }
    return this.send(skus, target);
  }

  private async send(productSkus: readonly string[], workstationId: string | null): Promise<void> {
    if (!this.canWrite() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await shownOnce(
        this.intents,
        `place:${productSkus.join(',')}:${workstationId ?? UNPLACED}`,
        (key) => this.api.place({ productSkus: [...productSkus], workstationId }, key),
      );
      this.changed.emit();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le poste n’a pas pu être enregistré.'));
    } finally {
      this.busy.set(false);
    }
  }
}
