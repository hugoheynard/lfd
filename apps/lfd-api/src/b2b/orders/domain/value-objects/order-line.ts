import type { OrderClientele, OrderLineAllergens, OrderLinePricingTrace } from "@lfd/contracts";
import {
  GRAMS_PER_KILOGRAM,
  lineTotalCents,
  pieces,
  roundToCents,
  saleQuantity,
  ttcCentsFromHtMillicents,
  ttcCentsOf,
  type SaleQuantity,
  type SaleUnit,
} from "@lfd/money";

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
  /** Des pièces, ou des GRAMMES si `saleUnit = weight` — toujours un entier. */
  readonly quantity: number;
  /**
   * **L'unité de la quantité**, figée comme le prix (`vente-au-poids.md`,
   * P3). Au poids, `unitPriceMillicents` est un prix AU KILO. Obligatoire :
   * une ligne sans unité ne doit plus pouvoir s'écrire.
   */
  readonly saleUnit: SaleUnit;
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
  /**
   * **La ligne entre-t-elle dans l'assiette de la remise de retrait ?** Décidé
   * par la passation (`CartAdjustments.forPickup`) et figé ici (R2 du plan
   * `plan-remise-retrait-par-clientele-et-exclusions.md`) : l'agrégat recalcule
   * la remise à partir de ce drapeau, jamais d'une assiette reçue. Absent =
   * éligible, ce qu'était toute ligne avant les exclusions.
   */
  readonly pickupDiscountEligible?: boolean;
  /**
   * Le produit et la famille de l'article à la passation, en snapshot —
   * identifiants opaques du catalogue, qui disent POURQUOI une ligne était
   * exclue. Absent ou `null` = non classé (une ligne fabriquée à la main, un
   * SKU que le catalogue ne rangeait pas).
   */
  readonly productId?: string | null;
  readonly categoryId?: string | null;
}

/** Une ligne prête à persister (snapshots figés + total calculé). */
export interface OrderLineSnapshot extends OrderLineInput {
  /**
   * Total **HT** de la ligne, en **centimes** : prix unitaire × quantité,
   * arrondi **une seule fois**, ici. C'est un montant, pas un prix unitaire.
   */
  readonly lineTotalCents: number;
  /**
   * Le prix d'UNE pièce **taxe comprise**, en centimes — ou `null`.
   *
   * 🔴 **Scellé, jamais dérivé au rendu** (R3, 2026-09-21). Un bon de commande
   * est archivé sous une clé qui ne bouge pas : le recalculer à l'affichage
   * changerait une pièce déjà remise au client. Ce que la vitrine a montré est
   * donc figé ici, au moment où c'est encore vrai.
   *
   * `null` dit **deux** choses — une commande professionnelle, ou une commande
   * antérieure à R3 —, et les deux se rendent pareil : en hors taxe. Le
   * document n'a qu'une question à poser, « ai-je un TTC à montrer ? ».
   */
  readonly unitPriceTtcCents: number | null;
  /** Le total de la ligne taxe comprise, `null` aux mêmes deux conditions. */
  readonly lineTotalTtcCents: number | null;
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
  /** Requis ici, décidé une fois : l'adaptateur écrit ce que l'agrégat a vu. */
  readonly pickupDiscountEligible: boolean;
  readonly productId: string | null;
  readonly categoryId: string | null;
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
    readonly saleUnit: SaleUnit,
    readonly lineTotalCents: number,
    readonly unitPriceTtcCents: number | null,
    readonly lineTotalTtcCents: number | null,
    readonly pricing: OrderLinePricingTrace | null,
    readonly allergens: OrderLineAllergens | null,
    readonly pickupDiscountEligible: boolean,
    readonly productId: string | null,
    readonly categoryId: string | null,
  ) {}

  /**
   * @param clientele **qui achète**, et donc dans quelle assiette la ligne sera
   * lue. `"public"` scelle le taxe compris ; `"pro"` ne le scelle pas, parce
   * qu'un professionnel récupère la taxe et ne lit jamais que le hors taxe.
   *
   * Il est **obligatoire** plutôt que défaillant à `"pro"` : un défaut se
   * trompe en silence, et il se tromperait exactement sur le cas neuf.
   */
  static create(input: OrderLineInput, clientele: OrderClientele): OrderLine {
    ensureQuantityAndPrice(input);
    // **L'unique arrondi de la ligne**, nommé ici pour que le taxe compris s'en
    // dérive plutôt que de refaire sa propre multiplication.
    const htCents = lineTotalCents(input.unitPriceMillicents, quantityOf(input));
    // Le prix d'une pièce passe par le MÊME chemin que la vitrine —
    // `ttcCentsOf(lineTotalCents(prix, pieces(1)), taux)` — et rend donc le nombre que
    // le client a lu sur la vignette, au centime près. Un second arrondi a lieu
    // ici, sur la pièce, et c'est voulu : c'est celui de l'étiquette. Au poids,
    // l'étiquette est celle d'UN KILO.
    const seals = clientele === "public";
    return new OrderLine(
      input.sku,
      input.productName,
      input.unitPriceMillicents,
      input.vatRate,
      input.quantity,
      input.saleUnit,
      // Il est calculé plus haut, et nulle part avant : arrondir le prix
      // unitaire d'abord revenait à multiplier l'erreur par la quantité — douze
      // articles à 9,00 € TTC facturaient 107,98 € au lieu de 108,00. Le prix
      // unitaire garde ses décimales jusqu'à ce point.
      htCents,
      seals
        ? ttcCentsOf(
            lineTotalCents(input.unitPriceMillicents, labelQuantityOf(input)),
            input.vatRate,
          )
        : null,
      seals ? ttcCentsOf(htCents, input.vatRate) : null,
      assertConsistent(input),
      // `?? null` et jamais `?? { codes: [] }` : l'absence de déclaration reste
      // une absence. La fabriquer transformerait une ignorance en affirmation,
      // sur le seul champ dont une erreur ne se rattrape pas.
      input.allergens ?? null,
      input.pickupDiscountEligible ?? true,
      input.productId ?? null,
      input.categoryId ?? null,
    );
  }

  /**
   * **Une ligne d'une commande composée en TTC** (`exact_ht`, plan
   * `documentation/pricing/plan-centime-particuliers.md`, § 4) : son HT est
   * REÇU de la composition (`composeTtcOrder`), pas dérivé du prix.
   *
   * 🔴 L'invariant de {@link create} — « le HT de ligne dérive du prix, jamais
   * fourni » — se lève ICI, et ici seulement. Pour un particulier, ce que la
   * ligne vaut est quantité × étiquette TTC, et la TVA du taux se répartit sur
   * tous les termes de la commande (lignes, remise, bon, port) : le HT d'une
   * ligne dépend donc de ses voisines, et la ligne seule ne peut pas le
   * calculer. Ce qu'elle garde, elle : l'étiquette est celle de la vignette
   * (`ttcCentsFromHtMillicents`), le TTC reçu est bien quantité × étiquette,
   * et son HT ne dépasse pas ce TTC — une composition qui dirait autre chose
   * est refusée. Le pro garde `create`, inchangée.
   *
   * Les TTC scellés sont l'étiquette (`unitPriceTtcCents`) et quantité ×
   * étiquette (`lineTotalTtcCents`) — ce que le client a lu et paie.
   *
   * @throws {InvalidOrderLineError} quantité, prix ou composition incohérents.
   */
  static ofTtc(input: OrderLineInput, composed: ComposedTtcLine): OrderLine {
    ensureQuantityAndPrice(input);
    if (
      composed.vatRate !== input.vatRate ||
      composed.labelCents !== ttcCentsFromHtMillicents(input.unitPriceMillicents, input.vatRate) ||
      composed.ttcCents !== labelTimesQuantity(composed.labelCents, input) ||
      composed.htCents < 0 ||
      composed.htCents > composed.ttcCents
    ) {
      throw new InvalidOrderLineError(
        input.sku,
        "la composition taxe comprise ne correspond pas à la ligne (étiquette, quantité ou taux)",
      );
    }
    return new OrderLine(
      input.sku,
      input.productName,
      input.unitPriceMillicents,
      input.vatRate,
      input.quantity,
      input.saleUnit,
      composed.htCents,
      composed.labelCents,
      composed.ttcCents,
      assertConsistent(input),
      input.allergens ?? null,
      input.pickupDiscountEligible ?? true,
      input.productId ?? null,
      input.categoryId ?? null,
    );
  }

  toSnapshot(): OrderLineSnapshot {
    return {
      sku: this.sku,
      productName: this.productName,
      unitPriceMillicents: this.unitPriceMillicents,
      vatRate: this.vatRate,
      quantity: this.quantity,
      saleUnit: this.saleUnit,
      lineTotalCents: this.lineTotalCents,
      unitPriceTtcCents: this.unitPriceTtcCents,
      lineTotalTtcCents: this.lineTotalTtcCents,
      pricing: this.pricing,
      allergens: this.allergens,
      pickupDiscountEligible: this.pickupDiscountEligible,
      productId: this.productId,
      categoryId: this.categoryId,
    };
  }
}

/** Ce que la composition TTC rend pour une ligne — la forme de `TtcComposedLine`. */
export interface ComposedTtcLine {
  readonly vatRate: number;
  readonly labelCents: number;
  readonly ttcCents: number;
  readonly htCents: number;
}

/**
 * La quantité de la ligne **avec son unité** — le seul argument que les calculs
 * de ligne acceptent (`@lfd/money`, `lineTotalCents`).
 */
export function quantityOf(line: Pick<OrderLineInput, "quantity" | "saleUnit">): SaleQuantity {
  return saleQuantity(line.quantity, line.saleUnit);
}

/** Ce que dit l'étiquette : une pièce, ou un kilo. */
function labelQuantityOf(line: Pick<OrderLineInput, "saleUnit">): SaleQuantity {
  return line.saleUnit === "weight" ? saleQuantity(GRAMS_PER_KILOGRAM, "weight") : pieces(1);
}

/**
 * L'étiquette × la quantité, en centimes — la règle de `composeTtcOrder` : à la
 * pièce, un produit exact ; au poids, l'étiquette au kilo × grammes / 1000,
 * arrondie une fois, la moitié vers le haut (`plan-centime-particuliers.md`, §4).
 */
function labelTimesQuantity(
  labelCents: number,
  line: Pick<OrderLineInput, "quantity" | "saleUnit">,
): number {
  if (line.saleUnit === "piece") {
    return labelCents * line.quantity;
  }
  return roundToCents({
    num: BigInt(labelCents) * BigInt(line.quantity),
    den: BigInt(GRAMS_PER_KILOGRAM),
  });
}

/** Les deux refus communs aux deux factories. */
function ensureQuantityAndPrice(input: OrderLineInput): void {
  if (input.saleUnit !== "piece" && input.saleUnit !== "weight") {
    throw new InvalidOrderLineError(input.sku, "unité de vente « piece » ou « weight » attendue");
  }
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
