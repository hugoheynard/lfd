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
import { ProductSearch } from '@lfd/b2b-ui/catalog';
import { searchProducts, type ProductSearchKeys } from '@lfd/b2b-ui/search';
import type {
  OffCatalogArticleView,
  WorkstationProductView,
  WorkstationView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldPanelHostService,
  type FoldSelectOption,
  type FoldTableColumn,
} from 'fold-ng';

import { dialogSide } from '../../../b2b/reglages/delivery-zones-section/delivery-audiences';
import { GestureIntents, shownOnce } from '../../../shared/gesture-intents';
import { WorkstationsService } from '../../workstations.service';
import {
  ProductStationsDialog,
  type ProductStationsDialogData,
} from '../product-stations-dialog/product-stations-dialog';

/** Une puce de poste : son nom, et s'il finit le produit. */
export interface StationChip {
  readonly id: string;
  readonly name: string;
  readonly finishes: boolean;
}

const COLUMNS: readonly FoldTableColumn<WorkstationProductView>[] = [
  { key: 'product', label: 'Produit' },
  { key: 'workstation', label: 'Postes' },
  { key: 'shelf', label: 'Rayon' },
];

/** Le nom du produit ; à défaut, celui de sa première déclinaison. */
function productNameOf(product: WorkstationProductView): string {
  return product.productName ?? product.variants[0]?.variantName ?? product.productSku;
}

/** Un produit se cherche aussi par le nom et le SKU de ses déclinaisons. */
const PRODUCT_SEARCH: ProductSearchKeys<WorkstationProductView> = {
  nameOf: productNameOf,
  skuOf: (product) => [product.productSku, ...product.variants.map((variant) => variant.sku)],
  extraOf: (product) => product.variants.map((variant) => variant.variantName),
};

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
 * information, et ses postes en puces — celui qui finit marqué « finit »
 * (`un-produit-sur-plusieurs-postes.md`, § 2.9). Les régler ouvre un
 * dialogue, en feuille du bas au téléphone. Les déclinaisons en héritent.
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
    ProductSearch,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
  ],
  templateUrl: './workstation-products-card.html',
  styleUrl: './workstation-products-card.scss',
})
export class WorkstationProductsCard {
  private readonly api = inject(WorkstationsService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly intents = new GestureIntents();

  readonly products = input.required<readonly WorkstationProductView[]>();
  readonly offCatalog = input.required<readonly OffCatalogArticleView[]>();
  readonly workstations = input.required<readonly WorkstationView[]>();
  /** Le compte servi des produits sans poste. */
  readonly unplacedCount = input.required<number>();
  readonly canWrite = input.required<boolean>();
  /** Le filtre « à ranger » demandé par l'adresse (l'alerte du Prod manager). */
  readonly unplacedFirst = input(false);
  /** Le poste dont on veut les produits (« Produits du poste ») ; `null` : tous. */
  readonly station = input<string | null>(null);
  /** Après un placement accepté : le parent relit. */
  readonly changed = output();

  protected readonly columns = COLUMNS;
  protected readonly skuOf = (product: WorkstationProductView): string => product.productSku;
  protected readonly nothingFound = { title: 'Aucun produit ne correspond.' };

  /** Le filtre par poste, reparti de la demande de la page ; effaçable dans la carte. */
  protected readonly stationFilter = linkedSignal(() => this.station());
  /** « À ranger » n'a pas de sens avec un poste choisi : arriver sur un poste l'éteint. */
  protected readonly onlyUnplaced = linkedSignal(
    () => this.unplacedFirst() && this.station() === null,
  );
  protected readonly onlyOrdered = signal(false);
  protected readonly shelf = signal<string | null>(null);
  protected readonly query = signal('');
  /** Le poste choisi pour « tout ce rayon ». */
  protected readonly bulkTarget = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly unplacedLabel = computed(() => `À ranger (${String(this.unplacedCount())})`);

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
    const shelf = this.shelf();
    const station = this.stationFilter();
    return searchProducts(
      this.products().filter(
        (product) =>
          (!this.onlyUnplaced() || product.workstations.length === 0) &&
          (station === null ||
            product.workstations.some((placed) => placed.workstationId === station)) &&
          (!this.onlyOrdered() || product.ordered) &&
          (shelf === null || rootOf(product)?.id === shelf),
      ),
      this.query(),
      PRODUCT_SEARCH,
    );
  });

  /** Les produits du rayon choisi — tout le rayon, quels que soient les autres filtres. */
  protected readonly shelfProducts = computed(() => {
    const shelf = this.shelf();
    return shelf === null ? [] : this.products().filter((product) => rootOf(product)?.id === shelf);
  });

  /** Le nom du produit ; à défaut, celui de sa première déclinaison. */
  protected nameOf(product: WorkstationProductView): string {
    return productNameOf(product);
  }

  protected shelfNameOf(product: WorkstationProductView): string {
    return product.family?.name ?? 'Plus au catalogue';
  }

  /** Ses postes en puces, celui qui finit en premier ; un poste archivé n'en a pas. */
  protected chipsOf(product: WorkstationProductView): readonly StationChip[] {
    const names = new Map(this.workstations().map((station) => [station.id, station.name]));
    return product.workstations.flatMap((placed) => {
      const name = names.get(placed.workstationId);
      return name === undefined
        ? []
        : [{ id: placed.workstationId, name, finishes: placed.finishes }];
    });
  }

  /** La puce dit le poste, et « finit » pour celui qui compte les pièces. */
  protected chipLabel(chip: StationChip, alone: boolean): string {
    return chip.finishes && !alone ? `${chip.name} · finit` : chip.name;
  }

  /** Le dialogue des postes du produit ; la page relit s'il a changé quelque chose. */
  protected async editStations(product: WorkstationProductView): Promise<void> {
    if (!this.canWrite()) {
      return;
    }
    const changed = await this.panels.open<ProductStationsDialogData, boolean>(
      ProductStationsDialog,
      {
        data: {
          productSku: product.productSku,
          productName: productNameOf(product),
          stations: product.workstations,
          workstations: this.workstations(),
        },
        side: dialogSide(),
        width: 'sm',
        surface: 'solid',
      },
    ).closed;
    if (changed === true) {
      this.changed.emit();
    }
  }

  protected placeShelf(): Promise<void> {
    const target = this.bulkTarget();
    const skus = this.shelfProducts().map((product) => product.productSku);
    if (target === null || skus.length === 0) {
      return Promise.resolve();
    }
    return this.send(skus, target);
  }

  private async send(productSkus: readonly string[], workstationId: string): Promise<void> {
    if (!this.canWrite() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await shownOnce(this.intents, `place:${productSkus.join(',')}:${workstationId}`, (key) =>
        this.api.place({ productSkus: [...productSkus], workstationId }, key),
      );
      this.changed.emit();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le poste n’a pas pu être enregistré.'));
    } finally {
      this.busy.set(false);
    }
  }
}
