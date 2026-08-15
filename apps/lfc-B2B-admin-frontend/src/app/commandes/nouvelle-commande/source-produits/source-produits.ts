import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  FoldEmptyStateComponent,
  FoldNavLayoutComponent,
  FoldSearchComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';
import type { CatalogItemView, CustomerSkuStat, OrderView } from '@lfd/contracts';
import {
  catalogShelves,
  ProductRow,
  toCatalogProduct,
  type CatalogOrder,
  type CatalogProduct,
  type CatalogShelf,
} from '@lfd/b2b-ui/catalog';
import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';

import { narrowViewport } from '../../../shared/viewport/narrow-viewport';
import type { CartStore } from '../cart.store';

/**
 * Une ligne proposée : le produit tel que la rangée partagée le rend, plus la
 * **raison** de sa présence — ce que cette source-là sait dire de lui.
 */
export interface ProposedLine {
  readonly product: CatalogProduct;
  /**
   * Prix unitaire HT en **centimes**. La rangée affiche `product.price`, déjà
   * formaté ; le panier, lui, a besoin du nombre pour sommer. Deux
   * représentations du même prix, et c'est assumé : formater dans le panier
   * puis reparser à l'addition serait pire.
   */
  readonly unitPriceCents: number;
  /** Une seconde ligne d'écran : « 12 commandes · 480 pcs », « ×24 ». */
  readonly hint: string;
  /** La quantité que la source suggère : 1 au catalogue, celle d'une commande. */
  readonly quantity: number;
  /** Faux = plus au catalogue : montré en lecture, pas proposable à l'ajout. */
  readonly available: boolean;
}

/** Les trois façons de regarder ce qu'on peut ajouter. */
export type SourceKind = 'habituels' | 'catalogue' | 'commande';

/**
 * La colonne du milieu : **d'où viennent les articles**.
 *
 * Trois sources, et l'ordre des onglets est la thèse de l'écran : ce qu'il
 * reprend d'habitude, puis le catalogue entier, puis une commande précise. Un
 * commercial au téléphone ne parcourt pas 92 produits, il reprend les trente
 * lignes de ce client-là. Le catalogue existe pour la nouveauté, pas pour le
 * quotidien.
 *
 * La troisième source n'a de contenu qu'après un clic dans la colonne de
 * gauche — c'est elle qui répond à « refais-moi la même que mardi ».
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
    FoldSearchComponent,
    FoldTabPanelComponent,
    FoldTabsComponent,
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
  /** Le panier, pour afficher ce qui y est déjà — lu, jamais muté ici. */
  readonly cart = input.required<CartStore>();

  readonly kindChange = output<SourceKind>();
  readonly add = output<ProposedLine>();
  /** « Tout reprendre » : les lignes d'une commande, d'un coup. */
  readonly addAll = output<readonly ProposedLine[]>();

  protected readonly search = signal('');

  /** Les rayons du catalogue, filtrés par la recherche. Un rayon vide disparaît. */
  protected readonly shelves = computed<readonly CatalogShelf<ProposedLine>[]>(() => {
    const needle = normalise(this.search());
    const kept = this.catalogue().filter((item) => matches(item, needle));
    return catalogShelves(kept, (item) => item.category).map((shelf) => ({
      ...shelf,
      items: shelf.items.map(fromCatalog),
    }));
  });

  /** Ce que ce client reprend, filtré par la même recherche. */
  protected readonly habitLines = computed<readonly ProposedLine[]>(() =>
    this.habits()
      .filter((stat) => normalise(stat.productName + stat.sku).includes(normalise(this.search())))
      .map(fromHabit),
  );

  /** Les lignes de la commande choisie — avec LEURS quantités, c'est tout l'intérêt. */
  protected readonly orderLines = computed<readonly ProposedLine[]>(() => {
    const order = this.order();
    return order === null ? [] : order.lines.map(fromOrderLine);
  });

  /** Le titre de l'onglet « commande » : son numéro, ou l'invitation à en choisir une. */
  protected readonly orderLabel = computed(() => this.order()?.orderNumber ?? 'Une commande');

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
   * L'onglet « commande » prend le numéro de celle qu'on a choisie à gauche :
   * l'écran doit dire de quelle commande il parle, pas seulement qu'il en montre
   * une.
   */
  protected readonly tabItems = computed<FoldTabItem[]>(() => [
    { key: 'habituels', label: 'Ses habitudes', icon: 'repeat', badge: this.habitLines().length },
    { key: 'catalogue', label: 'Catalogue', icon: 'grid' },
    { key: 'commande', label: this.orderLabel(), icon: 'receipt' },
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
  return {
    product: toCatalogProduct(item),
    unitPriceCents: item.unitPriceCents,
    hint: item.sku,
    quantity: 1,
    available: true,
  };
}

function fromHabit(stat: CustomerSkuStat): ProposedLine {
  const orders = stat.orderCount > 1 ? `${stat.orderCount} commandes` : '1 commande';
  return {
    product: {
      id: stat.sku,
      name: stat.productName,
      // Un SKU retiré n'a plus de tarif : afficher le dernier facturé
      // annoncerait un prix qu'on ne tiendra pas. `outOfStock` fait rendre à la
      // rangée son état « indisponible » plutôt qu'un bouton d'ajout.
      ...(stat.stillAvailable ? { price: formatCents(stat.unitPriceCents) } : {}),
      outOfStock: !stat.stillAvailable,
    },
    unitPriceCents: stat.unitPriceCents,
    hint: `${orders} · ${stat.totalQuantity} pcs · ${formatCents(stat.totalCents)}`,
    // La quantité MOYENNE par commande, arrondie : reprendre le cumul de l'année
    // remplirait le panier de 480 croissants.
    quantity: Math.max(1, Math.round(stat.totalQuantity / Math.max(1, stat.orderCount))),
    available: stat.stillAvailable,
  };
}

function fromOrderLine(line: OrderView['lines'][number]): ProposedLine {
  return {
    product: { id: line.sku, name: line.productName, price: formatCents(line.unitPriceCents) },
    unitPriceCents: line.unitPriceCents,
    hint: `×${line.quantity}`,
    quantity: line.quantity,
    available: true,
  };
}
