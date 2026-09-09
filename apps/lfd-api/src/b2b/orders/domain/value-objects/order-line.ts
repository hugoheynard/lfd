import type { OrderLineAllergens, OrderLinePricingTrace } from "@lfd/contracts";
import { lineTotalCents } from "@lfd/money";

import { InvalidOrderLineError } from "../errors/order-errors.js";

/** Ce que le catalogue résout pour une ligne (déjà autoritaire côté serveur). */
export interface OrderLineInput {
  readonly sku: string;
  readonly productName: string;
  /**
   * Prix unitaire **HT**, en **millicentimes** (10⁻⁵ €).
   *
   * C'est le seul nombre de la ligne qui ait besoin de décimales, parce que
   * c'est le seul qu'une quantité multiplie.
   */
  readonly unitPriceMillicents: number;
  /** Taux de TVA du produit en %, ex. 5.5 ou 20. */
  readonly vatRate: number;
  readonly quantity: number;
  /**
   * **Pourquoi** ce prix — la trace de résolution, figée avec lui.
   *
   * `null` sur une ligne fabriquée sans passer par la résolution (un test, un
   * import). L'absence est représentée plutôt qu'inventée : une trace vide
   * affirmerait « aucun étage n'a joué », ce qui est une autre phrase.
   */
  readonly pricing?: OrderLinePricingTrace | null;
  /**
   * **Ce qui était déclaré** au moment de commander — codes ET libellés.
   *
   * Facultatif à l'entrée, comme `pricing` : une ligne fabriquée sans passer
   * par la résolution du catalogue (un test, un import) n'en sait rien, et
   * inventer une déclaration vaudrait mieux que rien seulement si « rien » était
   * inoffensif. Ici il ne l'est pas.
   */
  readonly allergens?: OrderLineAllergens | null;
}

/** Une ligne prête à persister (snapshots figés + total calculé). */
export interface OrderLineSnapshot extends OrderLineInput {
  /**
   * Total **HT** de la ligne, en **centimes** : prix unitaire × quantité,
   * arrondi **une seule fois**, ici. C'est un montant, pas un prix unitaire.
   */
  readonly lineTotalCents: number;
  /**
   * Requis ici alors qu'il est facultatif à l'entrée : l'appelant peut ne pas
   * savoir, l'adaptateur doit décider quoi écrire. `null` est un choix, pas un
   * oubli — et le type l'oblige à le poser.
   */
  readonly pricing: OrderLinePricingTrace | null;
  /**
   * Requis ici alors qu'il est facultatif à l'entrée, pour la même raison que
   * `pricing` : l'adaptateur doit décider quoi écrire, et `null` est un choix
   * — « on ne sait pas » — que le type l'oblige à poser.
   */
  readonly allergens: OrderLineAllergens | null;
}

/**
 * Une **ligne de commande** — snapshot du catalogue (nom, prix HT, taux) au
 * moment de commander, et son total. Value-object : la quantité est strictement
 * positive, le prix non négatif, et `lineTotalCents` **dérive** du reste (jamais
 * fourni par l'appelant, jamais désynchronisé).
 */
export class OrderLine {
  private constructor(
    readonly sku: string,
    readonly productName: string,
    readonly unitPriceMillicents: number,
    readonly vatRate: number,
    readonly quantity: number,
    readonly lineTotalCents: number,
    readonly pricing: OrderLinePricingTrace | null,
    readonly allergens: OrderLineAllergens | null,
  ) {}

  static create(input: OrderLineInput): OrderLine {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new InvalidOrderLineError(input.sku, "quantité entière strictement positive attendue");
    }
    if (!Number.isInteger(input.unitPriceMillicents) || input.unitPriceMillicents < 0) {
      // 🔴 « millicentimes » et non « centimes » : ce message est lu par du
      // personnel qui n'a pas le code sous les yeux, et le nombre qu'il verra
      // à côté est cent fois celui qu'il attendrait. Le vecteur de D10 était
      // exactement là — un commentaire qui dit centimes, et quelqu'un qui le
      // croit (R19, 2026-09-09).
      throw new InvalidOrderLineError(
        input.sku,
        "prix unitaire entier ≥ 0 attendu, en millicentimes (10⁻⁵ €)",
      );
    }
    return new OrderLine(
      input.sku,
      input.productName,
      input.unitPriceMillicents,
      input.vatRate,
      input.quantity,
      // **L'unique arrondi de la ligne.** Il est ici, et nulle part avant :
      // arrondir le prix unitaire d'abord revenait à multiplier l'erreur par la
      // quantité — douze articles à 9,00 € TTC facturaient 107,98 € au lieu de
      // 108,00. Le prix unitaire garde ses décimales jusqu'à ce point.
      lineTotalCents(input.unitPriceMillicents, input.quantity),
      assertConsistent(input),
      // `?? null` et jamais `?? { codes: [] }` : l'absence de déclaration reste
      // une absence. La fabriquer transformerait une ignorance en affirmation,
      // sur le seul champ dont une erreur ne se rattrape pas.
      input.allergens ?? null,
    );
  }

  toSnapshot(): OrderLineSnapshot {
    return {
      sku: this.sku,
      productName: this.productName,
      unitPriceMillicents: this.unitPriceMillicents,
      vatRate: this.vatRate,
      quantity: this.quantity,
      lineTotalCents: this.lineTotalCents,
      pricing: this.pricing,
      allergens: this.allergens,
    };
  }
}

/**
 * La trace doit **s'accorder** avec le prix qu'elle explique.
 *
 * Le dernier étage sort sur le prix unitaire, sauf deux fois — et ces deux
 * exceptions sont exactement les deux décisions que le moteur consigne au lieu
 * de les avaler :
 *
 * 1. **le plancher a relevé** le prix, et c'est lui qui a le dernier mot ;
 * 2. **la chaîne est passée sous zéro**, et le prix a été ramené à zéro.
 *
 * Une trace qui aboutirait ailleurs serait pire que pas de trace : elle
 * donnerait au service client une explication fausse, avec l'assurance d'un
 * chiffre écrit.
 *
 * ## 🔴 Le second cas manquait, et il tuait la commande
 *
 * `resolvePrice` ramène à zéro depuis toujours ; la trace figée ne portait pas
 * `clampedToZero`, si bien qu'une remise « −5 € » sur une baguette à 2,00 €
 * produisait un dernier étage à −300 000 et un prix facturé à 0 — écart que
 * rien n'expliquait, donc ligne refusée. Un **500** sur le chemin qui encaisse,
 * pour une remise qu'un commercial a le droit de saisir (défaut R1, corrigé le
 * 2026-09-09).
 *
 * ⚠️ **Le ramené-à-zéro n'éteint pas le contrôle, il le DÉPLACE.** Il autorise
 * un écart précis — la chaîne finit sous zéro, la ligne facture zéro — et rien
 * d'autre. Le rendre permissif aurait fait de ce champ la façon d'écrire
 * n'importe quel prix sans que la trace ait à s'accorder.
 */
function assertConsistent(input: OrderLineInput): OrderLinePricingTrace | null {
  const trace = input.pricing ?? null;
  if (trace === null) {
    return null;
  }
  const last = trace.steps.at(-1);
  const expected = last?.resultMillicents ?? trace.basePriceMillicents;

  if (trace.clampedToZero === true) {
    // Le contrôle est plus STRICT ici, pas plus lâche : on exige que la chaîne
    // soit réellement passée sous zéro et que la ligne facture bien zéro.
    if (expected >= 0 || input.unitPriceMillicents !== 0) {
      throw new InvalidOrderLineError(
        input.sku,
        `la trace dit un prix ramené à zéro, mais elle aboutit à ${String(expected)} et la ligne facture ${String(input.unitPriceMillicents)}`,
      );
    }
    return trace;
  }

  // `clampedToZero: null` — trace antérieure au 2026-09-09 — retombe ici, donc
  // sur le contrôle d'avant : une commande déjà passée ne devient pas illisible
  // parce qu'on a appris à consigner quelque chose de neuf.
  if (!trace.floored && expected !== input.unitPriceMillicents) {
    throw new InvalidOrderLineError(
      input.sku,
      `la trace aboutit à ${String(expected)} millicentimes, la ligne en facture ${String(input.unitPriceMillicents)}`,
    );
  }
  return trace;
}
