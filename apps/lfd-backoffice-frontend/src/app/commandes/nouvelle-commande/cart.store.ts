import { computed, signal, type Signal } from '@angular/core';

import type { OrderLineInput, OrderQuoteView, OrderSaleUnit } from '@lfd/contracts';
import { lineSaleQuantity } from '@lfd/b2b-ui/catalog';
import { lineTotalCents } from '@lfd/money';

/** Une ligne du panier en cours de saisie. Le prix n'est là que pour l'écran. */
export interface CartLine {
  readonly sku: string;
  readonly name: string;
  /** Prix unitaire **HT** en **millicentimes**, tel que le catalogue le donne — au kilo au poids. */
  readonly unitPriceMillicents: number;
  /** Des pièces, ou des GRAMMES si `saleUnit = weight`. */
  readonly quantity: number;
  /**
   * L'unité de l'article (`vente-au-poids.md`, P5) ; absente = à la
   * pièce. Elle part avec la ligne : le serveur refuse une unité discordante.
   */
  readonly saleUnit?: OrderSaleUnit;
  /** Le pas du stepper : le pas de l'article au poids ; absent = 1. */
  readonly step?: number;
  /**
   * Le plancher du stepper : le minimum de l'article au poids, ou son minimum
   * de pièces (plan quantité minimale, Q6) ; absent = 1.
   */
  readonly minimum?: number;
}

/**
 * L'unité, le pas et le minimum d'un article au poids, tels que la ligne du
 * panier les garde (P5) ; pour une pièce, son seul minimum de pièces quand il
 * en a un (plan quantité minimale, Q6).
 */
export function saleLineOf(product: {
  readonly saleUnit?: OrderSaleUnit | undefined;
  readonly step?: number | undefined;
  readonly minimum?: number | undefined;
}): Pick<CartLine, 'saleUnit' | 'step' | 'minimum'> {
  if (product.saleUnit !== 'weight') {
    return product.minimum !== undefined && product.minimum > 1 ? { minimum: product.minimum } : {};
  }
  return {
    saleUnit: 'weight',
    ...(product.step === undefined ? {} : { step: product.step }),
    ...(product.minimum === undefined ? {} : { minimum: product.minimum }),
  };
}

/** La ligne telle qu'elle part : `saleUnit` n'est écrit que pour le poids. */
export function requestedLineOf(line: CartLine): OrderLineInput {
  return line.saleUnit === 'weight'
    ? { sku: line.sku, quantity: line.quantity, saleUnit: 'weight' }
    : { sku: line.sku, quantity: line.quantity };
}

/**
 * Le **panier en cours de saisie**, côté back-office.
 *
 * Une classe de signaux plutôt qu'un service injecté : ce panier ne survit pas à
 * l'écran, et deux onglets de saisie ouverts sur deux clients ne doivent surtout
 * pas le partager. Un singleton `providedIn: 'root'` aurait fait exactement
 * l'inverse.
 *
 * **Le seul montant calculé ici est le sous-total HT.** Remise de retrait, frais
 * de zone, TVA par taux et total TTC restent au serveur : les recopier ici
 * donnerait deux implémentations d'une même règle d'arrondi, donc deux résultats
 * à un centime près, et un client qui compare son écran à sa facture.
 *
 * 🔴 **Et même celui-là passe par `lineTotalCents`, jamais par une
 * multiplication écrite ici.** Ce paragraphe promettait « une multiplication et
 * une somme, que rien ne peut interpréter de travers » : elle sommait des
 * **millicentimes** sous un nom en centimes, et l'écran en affichait mille fois
 * le prix (corrigé le 2026-09-06). Une arithmétique d'argent n'est jamais assez
 * simple pour être écrite en clair — c'est précisément quand elle en a l'air
 * qu'on cesse de la relire.
 */
/** Une ligne du panier, au prix que le serveur facturera. */
export interface PricedCartLine extends CartLine {
  /** Le tarif d'entrée en **millicentimes**, ou `null` si rien ne l'a fait bouger. */
  readonly canonicalPriceMillicents: number | null;
}

export class CartStore {
  private readonly lines$ = signal<readonly CartLine[]>([]);

  /**
   * **Ce que le serveur a répondu**, par SKU — le prix qu'il facturera.
   *
   * Vide tant qu'aucune estimation n'est revenue : la ligne affiche alors le
   * tarif du catalogue, qui est tout ce qu'on sait d'elle. Elle ne PRÉTEND pas
   * pour autant que c'est le prix final — c'est l'estimation qui le dit, et
   * l'écran attend qu'elle arrive plutôt que d'inventer.
   */
  private readonly quoted$ = signal<ReadonlyMap<string, number>>(new Map());

  /** Les lignes, dans l'ordre où elles ont été ajoutées. */
  readonly lines: Signal<readonly CartLine[]> = this.lines$.asReadonly();

  /**
   * Les lignes **au prix facturé**, tarif d'entrée à côté quand il diffère.
   *
   * Le prix vient du serveur et de lui seul : il dépend du client (sa
   * mercuriale) et de la quantité (le palier atteint), donc aucune des deux
   * données n'est calculable ici. Le recalculer donnerait une seconde règle
   * d'arrondi — et un écart d'un centime découvert devant le client.
   */
  readonly pricedLines = computed<readonly PricedCartLine[]>(() => {
    const quoted = this.quoted$();
    return this.lines$().map((line) => {
      const billed = quoted.get(line.sku);
      return billed === undefined || billed === line.unitPriceMillicents
        ? { ...line, canonicalPriceMillicents: null }
        : {
            ...line,
            unitPriceMillicents: billed,
            canonicalPriceMillicents: line.unitPriceMillicents,
          };
    });
  });

  /**
   * Le devis du serveur, tel qu'il revient.
   *
   * Les SKU absents du devis **retombent** sur le tarif du catalogue plutôt que
   * de disparaître : une estimation partielle ne doit pas faire s'évanouir une
   * ligne du panier.
   */
  applyQuote(quote: OrderQuoteView): void {
    this.quoted$.set(new Map(quote.lines.map((line) => [line.sku, line.unitPriceMillicents])));
  }

  /** Le devis ne vaut plus rien : le panier ou le client a changé. */
  forgetQuote(): void {
    this.quoted$.set(new Map());
  }

  readonly isEmpty = computed(() => this.lines$().length === 0);

  /**
   * Nombre d'articles, toutes lignes confondues — pas le nombre de lignes. Une
   * ligne au poids compte pour UN article, jamais pour ses grammes (P5).
   */
  readonly itemCount = computed(() =>
    this.lines$().reduce(
      (total, line) => total + (line.saleUnit === 'weight' ? 1 : line.quantity),
      0,
    ),
  );

  /**
   * Sous-total **HT** en centimes, **au prix facturé**. Cf. l'avertissement de
   * la classe pour ce qu'il ne contient pas (remise de retrait, zone, TVA).
   *
   * L'arrondi a lieu **une fois par ligne**, par la fonction même dont le
   * serveur se sert (`OrderLine.lineTotalCents`). Arrondir la somme à la place
   * donnerait un centime d'écart sur certains paniers — c'est-à-dire l'écart
   * qu'on ne découvre que devant le client.
   */
  readonly subtotalCents = computed(() =>
    this.pricedLines().reduce(
      (total, line) =>
        total +
        lineTotalCents(line.unitPriceMillicents, lineSaleQuantity(line.quantity, line.saleUnit)),
      0,
    ),
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

  /** Repose des lignes entières — la reprise d'un brouillon mis de côté. */
  restore(lines: readonly CartLine[]): void {
    this.lines$.set([...lines]);
  }

  /**
   * Ce qui part au serveur : des SKU et des quantités, **jamais de prix**. Le
   * nom et le montant affichés n'ont servi qu'à l'écran ; c'est le catalogue
   * serveur qui fait foi à la passation.
   */
  toPayloadLines(): readonly OrderLineInput[] {
    return this.lines$().map(requestedLineOf);
  }
}
