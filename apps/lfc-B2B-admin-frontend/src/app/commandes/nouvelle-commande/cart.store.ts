import { computed, signal, type Signal } from '@angular/core';

import type { OrderLineInput } from '@lfd/contracts';

/** Une ligne du panier en cours de saisie. Le prix n'est là que pour l'écran. */
export interface CartLine {
  readonly sku: string;
  readonly name: string;
  /** Prix unitaire **HT** en centimes, tel que le catalogue le donne. */
  readonly unitPriceCents: number;
  readonly quantity: number;
}

/**
 * Le **panier en cours de saisie**, côté back-office.
 *
 * Une classe de signaux plutôt qu'un service injecté : ce panier ne survit pas à
 * l'écran, et deux onglets de saisie ouverts sur deux clients ne doivent surtout
 * pas le partager. Un singleton `providedIn: 'root'` aurait fait exactement
 * l'inverse.
 *
 * **Le seul montant calculé ici est le sous-total HT** — une multiplication et
 * une somme, que rien ne peut interpréter de travers. Remise de retrait, frais
 * de zone, TVA par taux et total TTC restent au serveur : les recopier ici
 * donnerait deux implémentations d'une même règle d'arrondi, donc deux résultats
 * à un centime près, et un client qui compare son écran à sa facture.
 */
export class CartStore {
  private readonly lines$ = signal<readonly CartLine[]>([]);

  /** Les lignes, dans l'ordre où elles ont été ajoutées. */
  readonly lines: Signal<readonly CartLine[]> = this.lines$.asReadonly();

  readonly isEmpty = computed(() => this.lines$().length === 0);

  /** Nombre d'articles, toutes lignes confondues — pas le nombre de lignes. */
  readonly itemCount = computed(() =>
    this.lines$().reduce((total, line) => total + line.quantity, 0),
  );

  /** Sous-total **HT** en centimes. Cf. l'avertissement de la classe. */
  readonly subtotalCents = computed(() =>
    this.lines$().reduce((total, line) => total + line.unitPriceCents * line.quantity, 0),
  );

  /** Quantité déjà au panier pour ce SKU — ce que les sources affichent en pastille. */
  quantityOf(sku: string): number {
    return this.lines$().find((line) => line.sku === sku)?.quantity ?? 0;
  }

  /**
   * Ajoute une quantité. Un SKU déjà présent **cumule** au lieu de créer une
   * seconde ligne : le serveur fusionne de toute façon par SKU, et deux lignes
   * du même produit à l'écran donneraient un panier qui ne ressemble pas à la
   * commande qui en sortira.
   */
  add(item: Omit<CartLine, 'quantity'>, quantity = 1): void {
    if (quantity <= 0) {
      return;
    }
    const existing = this.lines$().find((line) => line.sku === item.sku);
    if (existing === undefined) {
      this.lines$.update((lines) => [...lines, { ...item, quantity }]);
      return;
    }
    this.setQuantity(item.sku, existing.quantity + quantity);
  }

  /** Fixe la quantité d'une ligne. Zéro ou moins la retire — c'est le même geste. */
  setQuantity(sku: string, quantity: number): void {
    if (quantity <= 0) {
      this.remove(sku);
      return;
    }
    this.lines$.update((lines) =>
      lines.map((line) => (line.sku === sku ? { ...line, quantity: Math.floor(quantity) } : line)),
    );
  }

  remove(sku: string): void {
    this.lines$.update((lines) => lines.filter((line) => line.sku !== sku));
  }

  clear(): void {
    this.lines$.set([]);
  }

  /**
   * Ce qui part au serveur : des SKU et des quantités, **jamais de prix**. Le
   * nom et le montant affichés n'ont servi qu'à l'écran ; c'est le catalogue
   * serveur qui fait foi à la passation.
   */
  toPayloadLines(): readonly OrderLineInput[] {
    return this.lines$().map((line) => ({ sku: line.sku, quantity: line.quantity }));
  }
}
