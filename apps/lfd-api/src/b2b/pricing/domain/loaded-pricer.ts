import type { CommitmentDecisionView, VolumeTierPriceView } from "@lfd/contracts";

import { decideFloor } from "./floor-policy.js";
import { floorMillicentsFor, resolveScopedFloor } from "./resolve-floor.js";
import { resolvePrice } from "./resolve-price.js";
import { floorsFor, laddersFor, rulesFor } from "./pricing-materials.js";
import type { PricingEvidence, PricingMaterials } from "./pricing-materials.js";
import { commitmentFor, retainedQuantity } from "./volume-commitment.js";
import type {
  PriceFloor,
  PriceStep,
  PricingContext,
  RejectedRule,
  ResolvedPrice,
} from "./price-rule.js";
import type { CompanyMercuriale } from "./entities/company-mercuriale.js";
import { pricingContextFor } from "./pricing-context.js";
import { volumeTierPrices } from "./volume-tier-prices.js";

/** Ce que l'appelant sait du client au moment de tarifer. */
export interface PricingParties {
  readonly companyId: string | null;
}

/**
 * **Ce qu'il faut savoir d'un article pour le tarifer**, et rien de plus.
 *
 * Ni TVA, ni allergènes, ni limite de commande : ce sont des faits de
 * *commande*, pas de *prix*. Les faire entrer ici obligerait tout appelant qui
 * veut un prix à les fournir, et le premier qui ne les aurait pas les
 * inventerait.
 */
export interface PricedItem {
  readonly sku: string;
  readonly name: string;
  /** Sa famille — ce que vise une règle de portée `category`. */
  readonly category: string;
  /** Le tarif de liste, en millicentimes. */
  readonly canonicalMillicents: number;
}

/**
 * **Un prix, et tout ce qui l'explique.**
 *
 * 🔴 Le tarificateur ne rend **jamais** un nombre nu. Un prix sans sa trace est
 * un prix qu'on ne peut pas défendre six mois plus tard, quand la règle qui l'a
 * produit a été retirée.
 */
export interface PricedArticle {
  readonly sku: string;
  readonly name: string;
  /** Le tarif de liste, avant le moindre étage. */
  readonly canonicalMillicents: number;
  /** Ce que ce client paie, à cette quantité, à cet instant. */
  readonly finalMillicents: number;
  /** La quantité sur laquelle ce prix a été résolu. */
  readonly quantity: number;
  /** Les étages qui ont produit un effet, dans l'ordre. */
  readonly steps: readonly PriceStep[];
  /** La mercuriale qui a **scellé** la chaîne, ou `null`. */
  readonly sealedByRuleId: string | null;
  /** Les règles qui auraient agi sans ce scellement. */
  readonly sealedRuleIds: readonly string[];
  /** Le plancher a-t-il **relevé** ce prix ? */
  readonly floored: boolean;
  /** La chaîne est-elle passée sous zéro, et le prix ramené à zéro ? */
  readonly clampedToZero: boolean;
  /** La limite en vigueur, en millicentimes, ou `null` si aucune ne vise l'article. */
  readonly floorMillicents: number | null;
  /**
   * **La décision de plancher, figée avec le prix.**
   *
   * C'est ce qui rend le plancher dynamique tenable : sans la mesure consignée,
   * un prix qui dépend de l'historique cesse d'être explicable dès que
   * l'historique bouge. Elle ne se relit jamais.
   */
  readonly floorDecision: FrozenFloorDecision | null;
  /**
   * **Où en était le client sur son engagement**, cette commande comprise.
   *
   * `null` quand aucun engagement ne couvre l'article — le cas de l'immense
   * majorité des lignes.
   */
  readonly commitment: CommitmentDecisionView | null;
  /**
   * **Ce que le moteur a regardé sans l'appliquer**, avec la raison — évincée,
   * scellée, sous le seuil.
   *
   * Vide **affirme** qu'il n'a écarté personne : c'est la colonne persistée,
   * nullable, qui porte « on ne consignait pas encore » (R25).
   */
  readonly rejected: readonly RejectedRule[];
}

/** La décision de plancher, telle qu'elle part sur une commande. */
export interface FrozenFloorDecision {
  readonly tier: "hard" | "dynamic";
  readonly floorMillicents: number;
  readonly observedVolumeRatioBp: number | null;
  readonly quantityMet: boolean;
  readonly volumeMet: boolean;
}

/**
 * **LE tarificateur — matériaux en main.**
 *
 * ## Pourquoi cet objet existe
 *
 * `resolvePrice` est pure, et c'est sa force. Mais elle est **trop petite pour
 * être une porte** : avant de l'appeler il faut construire un contexte, trouver
 * quel engagement couvre l'article, en tirer la mesure retenue, trouver quel
 * plancher le vise, décider si sa porte s'ouvre — cinq gestes dans un ordre qui
 * compte. Chacun des cinq appelants les avait réécrits à la main, et **deux
 * s'étaient trompés** : l'écran de tarification avait oublié les barèmes
 * (1,83924 € contre 1,65532 € à la caisse), la projection avait oublié la
 * mercuriale (une courbe au tarif catalogue pour un client qui en avait un).
 *
 * Ces cinq gestes vivent ici, une fois. Un appelant donne un article et une
 * quantité ; **il ne construit plus rien**. C'est ce qui rend le prochain oubli
 * inexprimable plutôt que seulement improbable.
 *
 * ## 🔴 Le seul appelant de `resolvePrice`
 *
 * `lint:price-pipeline` le tient : la fonction qui facture n'a plus qu'une
 * porte, et la porte a un nom. Une sixième façon de fabriquer un prix demande
 * désormais de modifier une porte CI, ce qui se voit en relecture.
 *
 * ## Ce qu'il ne fait pas
 *
 * **Il ne lit rien.** Les matériaux lui sont donnés, chargés une fois pour tout
 * un lot, et les preuves mesurées en amont. C'est ce qui le rend éprouvable en
 * énumérant des cas plutôt qu'en montant un environnement — et c'est aussi ce
 * qui empêche la façade de devenir le N+1 qu'elle prétend éviter : quatre-vingt-
 * treize articles se tarifent sur un seul chargement.
 *
 * Il ne compose pas non plus un **panier** — acheminement, TVA, totaux
 * appartiennent à `OrderLinePricing`. Un panier n'est pas une somme de prix
 * d'articles.
 */
export class LoadedPricer {
  private constructor(
    private readonly materials: PricingMaterials,
    private readonly evidence: PricingEvidence,
    private readonly parties: PricingParties,
    /**
     * L'instant, **gelé pour tout le lot**.
     *
     * Deux articles résolus à quelques millisecondes d'écart pourraient sinon
     * tomber de part et d'autre du basculement d'une promotion.
     */
    private readonly at: Date,
  ) {}

  /**
   * Le tarificateur pour **ce client, à cet instant**, sur ces matériaux.
   *
   * `evidence` porte ce qu'il a fallu mesurer — le cumul d'un engagement, le
   * ratio de volume observé. `NO_EVIDENCE` est la réponse honnête de tout
   * appelant qui ne mesure rien : la porte d'un plancher dynamique reste alors
   * **fermée**, ce qui est la lecture prudente — un écran ne peut pas prouver
   * un volume, et l'ouvrir sur une hypothèse accorderait une remise que rien
   * n'a établie.
   *
   * ⚠️ Cette phrase a été **fausse d'un côté** jusqu'au 2026-09-09 : la porte
   * restait bien fermée sur une condition de volume, et s'ouvrait sur une
   * condition de quantité, faute pour `UnlockEvidence` de savoir dire « pas de
   * commande ». Il sait le dire depuis (R15).
   */
  static over(
    materials: PricingMaterials,
    evidence: PricingEvidence,
    parties: PricingParties,
    at: Date,
  ): LoadedPricer {
    return new LoadedPricer(materials, evidence, parties, at);
  }

  /**
   * **Le prix d'un article, à une quantité.**
   *
   * La question ordinaire, et celle que la caisse pose. L'engagement du client
   * est résolu ici : sous engagement, c'est le **volume annoncé** qui ouvre le
   * palier dès la première commande, et non le panier du jour.
   *
   * @throws {AmbiguousPriceRulesError} deux règles également spécifiques.
   * @throws {AmbiguousPriceFloorsError} deux planchers également spécifiques.
   */
  price(item: PricedItem, quantity: number): PricedArticle {
    const commitment = this.commitmentOf(item, quantity);
    return this.resolve(
      item,
      this.contextFor(item, quantity, commitment?.retainedQuantity ?? null),
      commitment,
      true,
    );
  }

  /** Le prix de plusieurs articles, chacun à **sa** quantité. */
  priceAll(items: readonly { item: PricedItem; quantity: number }[]): readonly PricedArticle[] {
    return items.map((entry) => this.price(entry.item, entry.quantity));
  }

  /**
   * **Le prix « si le cumul valait N ».**
   *
   * La question de la projection, et elle n'est pas celle de {@link price} : ici
   * la quantité de commande ET le cumul valent le même nombre. Les distinguer
   * supposerait un rythme de livraison que l'écran, lui, connaît — et applique
   * en choisissant les niveaux qu'il demande.
   *
   * Aucun engagement n'est consulté : la projection répond à « si ce niveau
   * était atteint », pas à « où en est ce client ». Les deux questions se
   * ressemblent et n'ont pas la même réponse.
   */
  priceAtCumulative(item: PricedItem, cumulative: number): PricedArticle {
    // 🔴 **Sans aucune preuve**, et c'est une décision : une projection ne peut
    // prouver ni un volume observé, ni une commande. `N` est un cumul de saison,
    // pas un panier — le passer à la porte d'un plancher dynamique l'ouvrirait
    // sur une hypothèse, et accorderait une remise que rien n'a établie.
    return this.resolve(item, this.contextFor(item, cumulative, cumulative), null, false);
  }

  /**
   * **Ce que le barème donne, palier par palier.**
   *
   * La grille que le commercial lit au téléphone — « à combien je lui fais les
   * 100 ? ». `null` quand aucun seuil n'existe nulle part : une grille à une
   * ligne dirait que le prix dépend de la quantité alors qu'il n'en dépend pas.
   *
   * Chaque ligne est une **résolution complète** à la quantité du palier, par ce
   * tarificateur : un prix « canonique × (1 − remise) » mentirait dès qu'une
   * promotion compose avec le palier, ou qu'un plancher le relève.
   */
  tiers(item: PricedItem, quantity: number): readonly VolumeTierPriceView[] | null {
    const commitment = this.commitmentOf(item, quantity);
    const context = this.contextFor(item, quantity, commitment?.retainedQuantity ?? null);
    const scoped = this.scopedFloorFor(context);
    return volumeTierPrices(
      item.canonicalMillicents,
      laddersFor(this.materials, context),
      // Les règles SANS la mercuriale : la grille la reconvertit elle-même à
      // chaque palier sondé, et la recevoir toute faite la figerait au premier.
      rulesFor(this.materials, context),
      context,
      scoped === null
        ? null
        : { policy: scoped.policy, observedVolumeRatioBp: this.observedRatioFor(item) },
      this.materials.mercuriale,
      // 🔴 La résolution est **passée**, pas importée : c'est ce qui garde une
      // seule porte sur `resolvePrice`. La grille sonde des quantités ; elle
      // n'a pas à savoir comment un prix se fabrique.
      (probe, applied) => this.resolveAt(item, probe, applied),
    );
  }

  /**
   * **Ce qu'une mercuriale accorde SEULE**, à un palier donné, chez un client.
   *
   * La question du comparatif de marché, et elle n'est pas celle de
   * {@link price} : ici on mesure ce qu'un tarif négocié vaut **sans barème ni
   * plancher**, parce qu'on le compare à celui d'un autre client qui n'a pas
   * les mêmes. Y ajouter un étage mesurerait autre chose.
   *
   * Statique, et sans matériaux : il n'y en a pas à charger — l'unique règle
   * est dérivée de la mercuriale elle-même. `null` quand elle ne porte pas
   * l'article, ou qu'aucun palier n'atteint cette quantité.
   *
   * 🔴 Elle passe quand même par le même `resolvePrice` que tout le reste :
   * deux façons de dériver un prix négocié finiraient par ne plus dire la même
   * chose, et c'est ici que ça se verrait le plus tard.
   */
  static mercurialeAlone(
    mercuriale: CompanyMercuriale,
    companyId: string,
    item: { readonly sku: string; readonly canonicalMillicents: number },
    minQuantity: number,
    at: Date,
  ): number | null {
    const context: PricingContext = {
      at,
      // Chaque palier est mesuré **à sa propre quantité** : l'évaluer à 1
      // l'écarterait dès qu'il s'ouvre plus haut, et le marché perdrait ses
      // prix de volume négociés.
      quantity: minQuantity,
      cumulativeQuantity: minQuantity,
      variantSku: item.sku,
      productSku: item.sku,
      // Aucune règle de famille n'est lue ici : la mercuriale vise l'article
      // nommément.
      categoryId: "",
      companyId,
      segmentId: null,
    };
    const rule = mercuriale.asRuleFor(context);
    if (rule === null) {
      return null;
    }
    // `ladders: []` et `mercuriale: null` sont DÉCLARÉS, pas omis.
    return resolvePrice(
      item.canonicalMillicents,
      { rules: [rule], ladders: [], mercuriale: null },
      context,
    ).finalMillicents;
  }

  /**
   * Le contexte de résolution — construit **ICI**, jamais par l'appelant.
   *
   * Il passe par `pricingContextFor`, qui centralise les trois écarts du
   * catalogue en place (un seul niveau de SKU, la famille en code de rayon,
   * l'absence de segment). Les recopier ici en ferait une quatrième copie, et
   * la bascule du PIM aurait deux endroits à corriger au lieu d'un.
   */
  private contextFor(
    item: PricedItem,
    quantity: number,
    cumulativeQuantity: number | null,
  ): PricingContext {
    return pricingContextFor(
      item.sku,
      item.category,
      quantity,
      this.parties,
      this.at,
      cumulativeQuantity,
    );
  }

  /** Le plancher qui **vise** l'article — une question de portée, pas de quantité. */
  private scopedFloorFor(context: PricingContext) {
    return resolveScopedFloor(floorsFor(this.materials, context), context);
  }

  /**
   * La mesure de volume observée pour cet article.
   *
   * Absente du relevé, elle vaut `null` — ce qui est exactement ce que la
   * lecture paresseuse rendait : la mesure n'a été prise que si un plancher la
   * réclamait.
   */
  private observedRatioFor(item: PricedItem): number | null {
    return this.evidence.volumeRatioBySku.get(item.sku) ?? null;
  }

  /**
   * **Où en est le client sur son engagement**, cette commande comprise.
   *
   * Le cumul inclut la commande en cours : sans cela, la première commande
   * d'une période partirait toujours d'un cumul nul et le palier arriverait avec
   * une commande de retard — un client qui commande ses 6 000 pièces en une fois
   * paierait le tarif d'entrée sur la totalité.
   *
   * Les trois nombres sont consignés, et pas seulement celui qui décide : une
   * ligne facturée au palier de 10 000 alors que 1 200 ont été livrés n'est
   * relisible que si la trace dit que c'est la PROMESSE qui a ouvert ce palier.
   */
  private commitmentOf(item: PricedItem, quantity: number): CommitmentDecisionView | null {
    const commitment = commitmentFor(
      this.materials.commitments,
      { categoryId: item.category, productSku: item.sku, variantSku: item.sku },
      this.at,
    );
    if (commitment === null) {
      return null;
    }
    const cumulativeQuantity = (this.evidence.orderedBySku.get(item.sku) ?? 0) + quantity;
    return {
      commitmentId: commitment.id,
      promisedQuantity: commitment.promisedQuantity,
      cumulativeQuantity,
      retainedQuantity: retainedQuantity(commitment, cumulativeQuantity),
    };
  }

  /** La résolution nue, à un contexte et un plancher déjà décidés. */
  private resolveAt(
    item: PricedItem,
    context: PricingContext,
    applied: PriceFloor | null,
  ): ResolvedPrice {
    // Les barèmes et la mercuriale partent en OBJET : `resolvePrice` les
    // présente elle-même, à la mesure de ce contexte. C'est ce qui rend
    // impossible d'en oublier un — deux écrans l'avaient fait.
    return resolvePrice(
      item.canonicalMillicents,
      {
        rules: rulesFor(this.materials, context),
        ladders: laddersFor(this.materials, context),
        mercuriale: this.materials.mercuriale,
      },
      context,
      applied,
    );
  }

  /** Le prix complet, trace et décisions comprises. */
  private resolve(
    item: PricedItem,
    context: PricingContext,
    commitment: CommitmentDecisionView | null,
    /**
     * Cette question dispose-t-elle de **mesures** — une commande réelle, un
     * historique ?
     *
     * `false` ferme la porte du plancher dynamique **par construction**, et non
     * par un cas particulier : la saisie refuse une porte dont les deux
     * conditions sont nulles, donc au moins une est posée, et aucune des deux
     * n'est prouvée ici (vérifié le 2026-09-09).
     */
    measured: boolean,
  ): PricedArticle {
    const scoped = this.scopedFloorFor(context);
    // Deux questions distinctes : quel plancher VISE l'article, puis lequel de
    // ses étages s'ouvre — la seconde dépendant de la commande et de
    // l'historique. La porte se juge sur la quantité de CETTE commande, et sur
    // rien d'autre : `context.quantity` n'en est une que si la question posée
    // en est une (R15).
    const decision =
      scoped === null
        ? null
        : decideFloor(scoped.policy, {
            quantity: measured ? context.quantity : null,
            observedVolumeRatioBp: measured ? this.observedRatioFor(item) : null,
          });
    const applied = decision?.applied ?? null;
    const resolved = this.resolveAt(item, context, applied);
    const floorMillicents =
      applied === null ? null : floorMillicentsFor(applied, item.canonicalMillicents);

    return {
      sku: item.sku,
      name: item.name,
      canonicalMillicents: item.canonicalMillicents,
      finalMillicents: resolved.finalMillicents,
      quantity: context.quantity,
      steps: resolved.steps,
      sealedByRuleId: resolved.sealedByRuleId,
      sealedRuleIds: resolved.sealedRuleIds,
      floored: resolved.floored,
      clampedToZero: resolved.clampedToZero,
      floorMillicents,
      floorDecision:
        decision === null
          ? null
          : {
              tier: decision.tier,
              floorMillicents: floorMillicentsFor(decision.applied, item.canonicalMillicents),
              observedVolumeRatioBp: decision.unlock?.observedVolumeRatioBp ?? null,
              quantityMet: decision.unlock?.quantityMet ?? true,
              volumeMet: decision.unlock?.volumeMet ?? true,
            },
      commitment,
      rejected: resolved.rejected,
    };
  }
}
