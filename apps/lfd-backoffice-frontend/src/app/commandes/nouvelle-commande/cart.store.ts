import { computed, signal, type Signal } from '@angular/core';

import type { OfferedOptionGroupView, OrderLineInput, OrderSaleUnit } from '@lfd/contracts';
import { settleSaleQuantity } from '@lfd/b2b-ui/catalog';
import {
  offeredChoicesOnly,
  optionChoicesField,
  settleLineOptions,
  type LineOptionChoice,
} from '@lfd/b2b-ui/line-options';

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
  /**
   * Les options choisies (« dont 2 tranchés », `plan-options-de-commande.md`,
   * § 3.3) ; absentes = aucune. Elles partent avec la ligne, sans prix.
   */
  readonly optionChoices?: readonly LineOptionChoice[];
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
  const options = optionChoicesField(line.optionChoices);
  return line.saleUnit === 'weight'
    ? { sku: line.sku, quantity: line.quantity, saleUnit: 'weight', ...options }
    : { sku: line.sku, quantity: line.quantity, ...options };
}

/** Une ligne dont les options ont changé : `optionChoices` disparaît quand il n'y en a plus. */
function withOptions(line: CartLine, choices: readonly LineOptionChoice[]): CartLine {
  const { optionChoices: _dropped, ...rest } = line;
  return choices.length === 0 ? rest : { ...rest, optionChoices: choices };
}

/**
 * Le **panier en cours de saisie**, côté back-office.
 *
 * Une classe de signaux plutôt qu'un service injecté : ce panier ne survit pas à
 * l'écran, et deux onglets de saisie ouverts sur deux clients ne doivent surtout
 * pas le partager. Un singleton `providedIn: 'root'` aurait fait exactement
 * l'inverse.
 *
 * **Aucun montant n'est calculé ici**, pas même le sous-total : tous viennent
 * de l'estimation du serveur, le calcul même de la passation. Le sous-total
 * qu'on sommait ici était un second calcul à côté du sien (retiré le
 * 2026-11-04 — « une seule arithmétique »).
 */
/** Une ligne du panier, au prix que le serveur facturera. */
export interface PricedCartLine extends CartLine {
  /** Le tarif d'entrée en **millicentimes**, ou `null` si rien ne l'a fait bouger. */
  readonly canonicalPriceMillicents: number | null;
}

/**
 * La quantité qu'une ligne peut réellement porter : au plancher et sur le pas
 * de l'article (`settleSaleQuantity`, la règle même de la rangée). Une pièce
 * n'a de pas qu'en colis, choix d'écran que la ligne ne garde pas : son pas au
 * panier est 1.
 */
export function settledLineQuantity(
  line: Pick<CartLine, 'minimum' | 'step'>,
  quantity: number,
): number {
  return settleSaleQuantity(quantity, line.minimum, line.step ?? 1);
}

export class CartStore {
  private readonly lines$ = signal<readonly CartLine[]>([]);

  /** Les lignes, dans l'ordre où elles ont été ajoutées. */
  readonly lines: Signal<readonly CartLine[]> = this.lines$.asReadonly();

  private readonly optionGroups$ = signal<ReadonlyMap<string, readonly OfferedOptionGroupView[]>>(
    new Map(),
  );

  /**
   * Les groupes d'options proposés à CE client, par SKU — servis avec les
   * prix de son rayon, à sa clientèle (jamais celle de l'équipe). Vide tant
   * que la table n'est pas lue, ou quand elle a échoué : rien à choisir.
   */
  optionGroupsOf(sku: string): readonly OfferedOptionGroupView[] {
    return this.optionGroups$().get(sku) ?? [];
  }

  /**
   * Pose les groupes du client, et retire des lignes les choix qu'il ne se
   * voit plus proposer : le serveur refuserait toute la ligne pour eux.
   */
  offerOptions(groups: ReadonlyMap<string, readonly OfferedOptionGroupView[]>): void {
    this.optionGroups$.set(groups);
    this.lines$.update((lines) =>
      lines.map((line) =>
        line.optionChoices === undefined
          ? line
          : withOptions(line, offeredChoicesOnly(line.optionChoices, groups.get(line.sku) ?? [])),
      ),
    );
  }

  /** Les options d'une ligne, déjà bornées par le sélecteur. */
  setOptionChoices(sku: string, choices: readonly LineOptionChoice[]): void {
    this.lines$.update((lines) =>
      lines.map((line) =>
        line.sku === sku ? withOptions(line, settleLineOptions(choices, line)) : line,
      ),
    );
  }

  /**
   * Les lignes **au prix du catalogue**, sans prix barré. Le prix de ce client
   * (mercuriale, palier, promotion du jour) n'est connu que par l'estimation,
   * qui le pose par-dessus (`estimatedLines`) ; il n'y a pas d'autre source
   * (le devis sans acheminement a quitté la saisie le 2026-11-04, É16).
   */
  readonly pricedLines = computed<readonly PricedCartLine[]>(() =>
    this.lines$().map((line) => ({ ...line, canonicalPriceMillicents: null })),
  );

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
      this.lines$.update((lines) => [
        ...lines,
        { ...item, quantity: settledLineQuantity(item, quantity) },
      ]);
      return;
    }
    this.setQuantity(item.sku, existing.quantity + quantity);
  }

  /**
   * Fixe la quantité d'une ligne, **ramenée au plancher et au pas** : le panier
   * ne peut pas porter une quantité que le serveur refuserait. Zéro ou moins la
   * retire — c'est le même geste.
   */
  setQuantity(sku: string, quantity: number): void {
    if (quantity <= 0) {
      this.remove(sku);
      return;
    }
    this.lines$.update((lines) =>
      lines.map((line) => {
        if (line.sku !== sku) {
          return line;
        }
        const settled = { ...line, quantity: settledLineQuantity(line, quantity) };
        // Diminuer réduit d'abord le « sans », puis les options (§ 3.3).
        return settled.optionChoices === undefined
          ? settled
          : withOptions(settled, settleLineOptions(settled.optionChoices, settled));
      }),
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
