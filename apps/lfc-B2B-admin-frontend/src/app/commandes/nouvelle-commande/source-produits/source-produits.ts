import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FoldEmptyStateComponent, FoldSearchComponent } from 'fold-ng';
import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  type CatalogItemView,
  type CustomerSkuStat,
  type OrderView,
} from '@lfd/contracts';
import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';

import type { CartStore } from '../cart.store';

/** Ce qu'une ligne proposée sait dire d'elle, quelle que soit sa source. */
export interface ProposedLine {
  readonly sku: string;
  readonly name: string;
  readonly unitPriceCents: number;
  /** Ce que la source suggère d'ajouter : 1 au catalogue, la quantité d'une commande. */
  readonly quantity: number;
  /** Une seconde ligne d'écran : « 12 commandes · 480 pcs », « ×24 ». */
  readonly hint: string;
  /** Faux = plus au catalogue : proposable en lecture, pas en ajout. */
  readonly available: boolean;
}

/** Les trois façons de regarder ce qu'on peut ajouter. */
export type SourceKind = 'habituels' | 'catalogue' | 'commande';

/** Un rayon du catalogue, tel que la vue liste le sépare. */
interface Shelf {
  readonly label: string;
  readonly lines: readonly ProposedLine[];
}

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
 */
@Component({
  selector: 'app-source-produits',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldEmptyStateComponent, FoldSearchComponent, NgTemplateOutlet],
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
  protected readonly shelves = computed<readonly Shelf[]>(() => {
    const needle = normalise(this.search());
    return CATALOG_CATEGORY_ORDER.map((category) => ({
      label: CATALOG_CATEGORY_LABELS[category],
      lines: this.catalogue()
        .filter((item) => item.category === category && matches(item, needle))
        .map(fromCatalog),
    })).filter((shelf) => shelf.lines.length > 0);
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
  protected readonly orderLabel = computed(() => {
    const order = this.order();
    return order === null ? 'Une commande' : order.orderNumber;
  });

  protected readonly orderDate = computed(() => {
    const order = this.order();
    return order === null ? '' : formatOrderDate(order.placedAt);
  });

  protected readonly tabs: readonly { readonly kind: SourceKind; readonly label: string }[] = [
    { kind: 'habituels', label: 'Ses habitudes' },
    { kind: 'catalogue', label: 'Catalogue' },
    { kind: 'commande', label: 'Une commande' },
  ];

  protected price(line: ProposedLine): string {
    return formatCents(line.unitPriceCents);
  }

  /** Ce qui est déjà au panier pour ce SKU — la pastille sur la ligne. */
  protected inCart(sku: string): number {
    return this.cart().quantityOf(sku);
  }

  protected onSelect(kind: SourceKind): void {
    this.kindChange.emit(kind);
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
    sku: item.sku,
    name: item.name,
    unitPriceCents: item.unitPriceCents,
    quantity: 1,
    hint: item.sku,
    available: true,
  };
}

function fromHabit(stat: CustomerSkuStat): ProposedLine {
  const orders = stat.orderCount > 1 ? `${stat.orderCount} commandes` : '1 commande';
  return {
    sku: stat.sku,
    name: stat.productName,
    unitPriceCents: stat.unitPriceCents,
    // La quantité MOYENNE par commande, arrondie : reprendre le cumul de l'année
    // remplirait le panier de 480 croissants.
    quantity: Math.max(1, Math.round(stat.totalQuantity / Math.max(1, stat.orderCount))),
    hint: `${orders} · ${stat.totalQuantity} pcs · ${formatCents(stat.totalCents)}`,
    available: stat.stillAvailable,
  };
}

function fromOrderLine(line: OrderView['lines'][number]): ProposedLine {
  return {
    sku: line.sku,
    name: line.productName,
    unitPriceCents: line.unitPriceCents,
    quantity: line.quantity,
    hint: `×${line.quantity}`,
    available: true,
  };
}
