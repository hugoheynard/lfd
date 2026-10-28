import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import {
  FoldEmptyStateComponent,
  FoldNavLayoutComponent,
  FoldPaginatorComponent,
  FoldSearchComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';
import type { AdminOrderRow, CatalogItemView, CustomerSkuStat, OrderView } from '@lfd/contracts';
import {
  catalogShelves,
  firstSaleQuantityOf,
  ProductRow,
  saleQuantityLabel,
  saleStepOf,
  toCatalogProduct,
  type CatalogOrder,
  type CatalogProduct,
  type CatalogShelf,
} from '@lfd/b2b-ui/catalog';
import { formatCents, formatMillicents, formatOrderDate } from '@lfd/b2b-ui/order';

import { narrowViewport } from '../../../shared/viewport/narrow-viewport';
import type { CartStore } from '../cart.store';
import { HistoriqueCommandes } from '../historique-commandes/historique-commandes';

/**
 * Une ligne proposée : le produit tel que la rangée partagée le rend, plus la
 * **raison** de sa présence — ce que cette source-là sait dire de lui.
 */
export interface ProposedLine {
  readonly product: CatalogProduct;
  /**
   * Prix unitaire HT en **millicentimes**. La rangée affiche `product.price`, déjà
   * formaté ; le panier, lui, a besoin du nombre pour sommer. Deux
   * représentations du même prix, et c'est assumé : formater dans le panier
   * puis reparser à l'addition serait pire.
   */
  readonly unitPriceMillicents: number;
  /** Une seconde ligne d'écran : « 12 commandes · 480 pcs », « ×24 ». */
  readonly hint: string;
  /** La quantité que la source suggère : 1 au catalogue, celle d'une commande. */
  readonly quantity: number;
  /** Faux = plus au catalogue : montré en lecture, pas proposable à l'ajout. */
  readonly available: boolean;
}

/**
 * Combien de produits par page de catalogue. Assez pour qu'un rayon entier tienne
 * le plus souvent d'un bloc, assez peu pour que le défilement reste court au
 * pouce.
 */
const CATALOGUE_PAGE_SIZE = 24;

/** Les trois façons de regarder ce qu'on peut ajouter. */
export type SourceKind = 'habituels' | 'catalogue' | 'commande';

/**
 * La colonne de gauche : **d'où viennent les articles**.
 *
 * Trois sources en onglets — le catalogue, ses commandes, ses habitudes — et
 * c'est tout ce que l'écran contient avec le panier. L'historique occupait une
 * troisième colonne ; elle restait là, à prendre un tiers de la largeur, pendant
 * qu'on parcourait le catalogue ou les habitudes, c'est-à-dire les deux tiers du
 * temps.
 *
 * **L'onglet « Ses commandes » se dédouble** : la liste à gauche, la commande
 * choisie à droite avec ses lignes et leurs quantités. Le geste — cliquer une
 * commande, en voir le détail, tout reprendre — se joue alors dans un seul
 * onglet, au lieu de traverser l'écran.
 *
 * Les rangées viennent de `@lfd/b2b-ui/catalog`, comme celles du catalogue
 * client : cet écran avait commencé par les réécrire, et les avait réécrites en
 * moins bien — sans colisage, et avec sa propre idée de la mise en page.
 */
@Component({
  selector: 'app-source-produits',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldEmptyStateComponent,
    FoldNavLayoutComponent,
    FoldPaginatorComponent,
    FoldSearchComponent,
    FoldTabPanelComponent,
    FoldTabsComponent,
    HistoriqueCommandes,
    NgTemplateOutlet,
    ProductRow,
  ],
  templateUrl: './source-produits.html',
  styleUrl: './source-produits.scss',
})
export class SourceProduits {
  readonly kind = input.required<SourceKind>();
  readonly catalogue = input.required<readonly CatalogItemView[]>();
  readonly habits = input.required<readonly CustomerSkuStat[]>();
  /** La commande choisie à gauche, ou `null` tant qu'aucune ne l'est. */
  readonly order = input<OrderView | null>(null);
  /** L'historique du compte : le volet gauche de l'onglet « Ses commandes ». */
  readonly orders = input.required<readonly AdminOrderRow[]>();
  readonly selectedOrderId = input<string | null>(null);
  /** Le panier, pour afficher ce qui y est déjà — lu, jamais muté ici. */
  readonly cart = input.required<CartStore>();

  readonly kindChange = output<SourceKind>();
  /** Une commande choisie dans le volet gauche — la page va la relire en détail. */
  readonly selectOrder = output<string>();
  readonly add = output<ProposedLine>();
  /** « Tout reprendre » : les lignes d'une commande, d'un coup. */
  readonly addAll = output<readonly ProposedLine[]>();

  protected readonly search = signal('');

  /** Le catalogue filtré par la recherche, à plat — ce que le paginateur compte. */
  protected readonly matching = computed(() => {
    const needle = normalise(this.search());
    return this.catalogue().filter((item) => matches(item, needle));
  });

  /** La page de catalogue courante. Une recherche rejoue la liste, donc page 1. */
  protected readonly page = linkedSignal<string, number>({
    source: this.search,
    computation: () => 1,
  });

  protected readonly pageSize = CATALOGUE_PAGE_SIZE;

  /**
   * Les rayons de la page courante. On **découpe puis regroupe**, et pas
   * l'inverse : paginer les rayons donnerait des pages de tailles très
   * différentes — 40 viennoiseries d'un côté, 3 chocolats de l'autre. Un rayon
   * peut donc s'étaler sur deux pages, et son titre reparaît en tête de la
   * seconde.
   */
  protected readonly shelves = computed<readonly CatalogShelf<ProposedLine>[]>(() => {
    const start = (this.page() - 1) * CATALOGUE_PAGE_SIZE;
    const slice = this.matching().slice(start, start + CATALOGUE_PAGE_SIZE);
    return catalogShelves(slice, (item) => item.family).map((shelf) => ({
      ...shelf,
      items: shelf.items.map(fromCatalog),
    }));
  });

  /**
   * Le catalogue par SKU : l'unité de vente, le pas et le minimum d'un article
   * se lisent là (P5) — une habitude ou une vieille commande ne les portent pas.
   */
  private readonly bySku = computed(
    () => new Map(this.catalogue().map((item) => [item.sku, item] as const)),
  );

  /** Ce que ce client reprend, filtré par la même recherche. */
  protected readonly habitLines = computed<readonly ProposedLine[]>(() =>
    this.habits()
      .filter((stat) => normalise(stat.productName + stat.sku).includes(normalise(this.search())))
      .map((stat) => fromHabit(stat, this.bySku().get(stat.sku))),
  );

  /** Les lignes de la commande choisie — avec LEURS quantités, c'est tout l'intérêt. */
  protected readonly orderLines = computed<readonly ProposedLine[]>(() => {
    const order = this.order();
    return order === null
      ? []
      : order.lines.map((line) => fromOrderLine(line, this.bySku().get(line.sku)));
  });

  protected readonly orderDate = computed(() => {
    const order = this.order();
    return order === null ? '' : formatOrderDate(order.placedAt);
  });

  /**
   * L'écran est-il étroit ? La barre s'y replie en icônes — `collapsed` est une
   * **entrée** du composant, pas du CSS : l'encapsulation de vue met ses
   * paddings hors de portée d'une feuille d'app, donc le TypeScript doit savoir
   * la largeur.
   */
  private readonly narrow = narrowViewport();
  protected readonly collapsed = this.narrow;

  /**
   * Les trois sources, en onglets ARIA (`fold-tabs`) et non en nav routée : on
   * change de **vue sur la même page**, l'adresse ne bouge pas. Chacun porte une
   * icône — c'est elle qui reste quand la barre se replie sur mobile.
   *
   * Le catalogue ouvre le bal : c'est la source qui a toujours quelque chose à
   * montrer, y compris pour un compte qui n'a jamais rien commandé.
   */
  protected readonly tabItems = computed<FoldTabItem[]>(() => [
    { key: 'catalogue', label: 'Catalogue', icon: 'grid' },
    { key: 'commande', label: 'Ses commandes', icon: 'receipt', badge: this.orders().length },
    { key: 'habituels', label: 'Ses habitudes', icon: 'repeat', badge: this.habitLines().length },
  ]);

  /** Ce qui est déjà au panier pour ce SKU — la pastille de la rangée. */
  protected inCart(sku: string): number {
    return this.cart().quantityOf(sku);
  }

  /** La barre écrit une clé ; on la relaie telle quelle au parent, qui décide. */
  protected onTab(key: string): void {
    this.kindChange.emit(key as SourceKind);
  }

  /**
   * La rangée rend le produit **et la quantité réglée à l'écran** : on renvoie la
   * ligne d'origine avec cette quantité-là. Reprendre celle de la source
   * ignorerait le pas-à-pas que le commercial vient de tourner.
   */
  protected onRowAction(line: ProposedLine, chosen: CatalogOrder): void {
    this.add.emit({ ...line, quantity: chosen.quantity });
  }
}

/** Minuscule et sans accents, pour que « pâté » se trouve en tapant « pate ». */
function normalise(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/gu, '');
}

function matches(item: CatalogItemView, needle: string): boolean {
  return needle === '' || normalise(`${item.name} ${item.sku}`).includes(needle);
}

function fromCatalog(item: CatalogItemView): ProposedLine {
  const product = toCatalogProduct(item);
  return {
    product,
    unitPriceMillicents: item.unitPriceMillicents,
    hint: item.sku,
    quantity: product.minimum ?? 1,
    available: true,
  };
}

/**
 * Ce que la rangée doit savoir d'un article au poids — l'unité, le pas, le
 * minimum, « / kg » —, repris du catalogue (P5). Rien pour une pièce, ni pour
 * un SKU que le catalogue ne connaît plus.
 */
function weightTermsOf(item: CatalogItemView | undefined): Partial<CatalogProduct> {
  if (item === undefined) {
    return {};
  }
  const { saleUnit, step, minimum, unit, outOfStock } = toCatalogProduct(item);
  if (saleUnit !== 'weight') {
    return {};
  }
  return {
    saleUnit,
    unit: unit ?? '/ kg',
    ...(step === undefined ? {} : { step }),
    ...(minimum === undefined ? {} : { minimum }),
    ...(outOfStock === undefined ? {} : { outOfStock }),
  };
}

/**
 * La quantité moyenne par commande, ramenée sur ce que l'article accepte :
 * une pièce au moins, ou au poids un multiple du pas qui atteint le minimum —
 * le serveur refuserait une moyenne de 437 g sur un pas de 100 g.
 */
function averageQuantityOf(stat: CustomerSkuStat, item: CatalogItemView | undefined): number {
  const average = stat.totalQuantity / Math.max(1, stat.orderCount);
  const step = item === undefined ? 1 : (saleStepOf(item) ?? 1);
  const first = item === undefined ? 1 : (firstSaleQuantityOf(item) ?? step);
  return Math.max(first, Math.round(average / step) * step);
}

function fromHabit(stat: CustomerSkuStat, item: CatalogItemView | undefined): ProposedLine {
  const orders = stat.orderCount > 1 ? `${stat.orderCount} commandes` : '1 commande';
  const terms = weightTermsOf(item);
  // Une ligne au poids se cumule en grammes : « 3,5 kg », pas « 3500 pcs ».
  const total =
    terms.saleUnit === 'weight'
      ? saleQuantityLabel(stat.totalQuantity, 'weight')
      : `${stat.totalQuantity} pcs`;
  return {
    product: {
      id: stat.sku,
      name: stat.productName,
      // Un SKU retiré n'a plus de tarif : afficher le dernier facturé
      // annoncerait un prix qu'on ne tiendra pas. `outOfStock` fait rendre à la
      // rangée son état « indisponible » plutôt qu'un bouton d'ajout.
      ...(stat.stillAvailable ? { price: formatMillicents(stat.unitPriceMillicents) } : {}),
      outOfStock: !stat.stillAvailable,
      ...terms,
    },
    unitPriceMillicents: stat.unitPriceMillicents,
    hint: `${orders} · ${total} · ${formatCents(stat.totalCents)}`,
    // La quantité MOYENNE par commande, arrondie : reprendre le cumul de l'année
    // remplirait le panier de 480 croissants.
    quantity: averageQuantityOf(stat, item),
    available: stat.stillAvailable,
  };
}

function fromOrderLine(
  line: OrderView['lines'][number],
  item: CatalogItemView | undefined,
): ProposedLine {
  return {
    product: {
      id: line.sku,
      name: line.productName,
      price: formatMillicents(line.unitPriceMillicents),
      ...weightTermsOf(item),
      // L'unité figée sur la ligne fait foi, même si l'article a quitté le catalogue.
      ...(line.saleUnit === 'weight' ? { saleUnit: 'weight' as const, unit: '/ kg' } : {}),
    },
    unitPriceMillicents: line.unitPriceMillicents,
    hint: `×${saleQuantityLabel(line.quantity, line.saleUnit)}`,
    quantity: line.quantity,
    available: true,
  };
}
