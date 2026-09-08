import type { PriceRule, PricingContext, ScopedPriceFloor } from "./price-rule.js";
import { candidatesIn, indexByScope, type ScopeIndex } from "./scope-index.js";
import type { VolumeCommitment } from "./volume-commitment.js";
import type { VolumeLadder } from "./volume-ladder.js";
import type { CompanyMercuriale } from "./entities/company-mercuriale.js";

/**
 * **Tout ce qu'il faut pour tarifer un panier**, chargé une fois et rangé.
 *
 * ## Ce que cette valeur change
 *
 * Les trois matériaux se lisaient **par article** : `resolveOne` posait trois
 * requêtes par ligne, chacune avec le même `WHERE` à un identifiant près. Un
 * panier de vingt lignes en faisait soixante, sur le chemin qui facture.
 *
 * Ils sont désormais lus **une fois pour le panier** et rangés par portée. Ce
 * que chaque article en tire est exactement ce que sa requête lui rendait — ni
 * plus, ni moins : `matchesScope` ne connaît que quatre formes, un article n'a
 * donc que quatre clés, et piocher ces quatre seaux rend ce que le prédicat
 * retenait. C'est cette équivalence, éprouvée contre `matchesScope` lui-même
 * dans `scope-index.spec.ts`, qui autorise le hissage.
 *
 * ## 🔴 Ce n'est PAS une accélération
 *
 * Le travail par article reste proportionnel aux matériaux qui visent CET
 * article. L'index ne fait pas gagner de temps de calcul : il **empêche** le
 * hissage d'échanger des lectures contre un produit `articles × règles`, ce qui
 * aurait été le remède pire que le mal. Ce qui est gagné, ce sont des lectures
 * — donc des opérations facturées, cf. `optimisation-resolution-de-prix.md` §2.
 *
 * ## Une valeur, pas un service
 *
 * Elle est **passée** de la méthode qui charge à celle qui résout, jamais
 * rangée dans un contexte ambiant : les matériaux vivent le temps d'un APPEL,
 * la requête vit plus longtemps, et les deux ne coïncident aujourd'hui que par
 * accident. Un CLS cacherait la dépendance en plus de rendre la résolution
 * intestable sans contexte.
 */
export interface PricingMaterials {
  readonly rules: ScopeIndex<PriceRule>;
  readonly floors: ScopeIndex<ScopedPriceFloor>;
  readonly ladders: ScopeIndex<VolumeLadder>;
  /**
   * Les engagements **vivants du client**, lus une fois.
   *
   * Ils ne se rangent pas par portée : un engagement vise une cible par ses
   * trois champs à la fois (`categoryId`, `productSku`, `variantSku`), et
   * `commitmentFor` arbitre déjà entre eux. Les indexer aurait dupliqué cette
   * décision dans une clé.
   */
  readonly commitments: readonly VolumeCommitment[];
  /**
   * **La mercuriale en cours de ce client**, ou `null`.
   *
   * Au plus une : la base n'en laisse pas deux se recouvrir chez un même
   * client. Elle n'est **pas** rangée par portée comme les règles — elle porte
   * sa propre grille, et c'est elle qui sait quel article elle vise.
   *
   * 🔴 **Elle est ici en OBJET, jamais convertie.** Trois appelants font varier
   * la quantité sur les mêmes matériaux — la projection, la colonne des paliers,
   * la caisse quand elle sonde (vérifié le 2026-09-08) — et une règle dérivée
   * trop tôt y serait figée au premier palier. Cf.
   * `CompanyMercuriale.asRuleFor`.
   */
  readonly mercuriale: CompanyMercuriale | null;
}

/** Range les matériaux d'un panier. Chacun sait où lire sa portée. */
export function materialsOf(loaded: {
  readonly rules: readonly PriceRule[];
  readonly floors: readonly ScopedPriceFloor[];
  readonly ladders: readonly VolumeLadder[];
  readonly commitments: readonly VolumeCommitment[];
  readonly mercuriale: CompanyMercuriale | null;
}): PricingMaterials {
  return {
    rules: indexByScope(loaded.rules, (rule) => rule.scope),
    floors: indexByScope(loaded.floors, (floor) => floor.scope),
    ladders: indexByScope(loaded.ladders, (ladder) => ladder.scope),
    commitments: loaded.commitments,
    mercuriale: loaded.mercuriale,
  };
}

/** Les règles qui visent cet article — la concaténation de ses quatre seaux. */
export function rulesFor(materials: PricingMaterials, context: PricingContext): PriceRule[] {
  return candidatesIn(materials.rules, context);
}

/**
 * **La mercuriale de ce client, vue comme une règle pour cet article.**
 *
 * `null` si le client n'en a pas, si elle ne porte pas l'article, ou si la
 * mesure n'atteint aucun palier.
 *
 * 🔴 **Elle n'est PAS jointe par `rulesFor`, et c'est délibéré.** `price-line`
 * passe à `volumeTierPrices` les règles **sans** les barèmes, parce que
 * celui-ci les reconvertit à chaque palier qu'il sonde — deux règles de même
 * identifiant à un étage rendaient la résolution ambiguë, et c'était un 400 sur
 * une commande de 20. Une mercuriale pré-jointe y reproduirait le même défaut.
 * Chaque appelant la demande donc explicitement, au moment où il sait à quelle
 * mesure il résout.
 */
export function mercurialeFor(
  materials: PricingMaterials,
  context: PricingContext,
): PriceRule | null {
  return materials.mercuriale?.asRuleFor(context) ?? null;
}

/** Les planchers qui visent cet article. */
export function floorsFor(
  materials: PricingMaterials,
  context: PricingContext,
): ScopedPriceFloor[] {
  return candidatesIn(materials.floors, context);
}

/** Les barèmes qui visent cet article. */
export function laddersFor(materials: PricingMaterials, context: PricingContext): VolumeLadder[] {
  return candidatesIn(materials.ladders, context);
}

/**
 * **Ce qu'il a fallu mesurer** pour tarifer ce panier — lu en amont, par lot.
 *
 * Deux mesures, et toutes deux dépendent de l'historique plutôt que du panier :
 * le cumul d'un engagement, et le ratio de volume observé d'un article.
 *
 * Elles étaient lues **dans** la boucle, chacune derrière un prédicat pur. La
 * paresse était bonne — aucune requête si le plancher n'a pas de porte, aucune
 * si aucun engagement ne couvre l'article — et elle est **conservée** : les
 * mêmes prédicats décident, ils décident simplement avant, sur des matériaux
 * déjà chargés. Ce qui change est qu'une mesure demandée pour dix articles
 * coûte une lecture au lieu de dix.
 */
export interface PricingEvidence {
  /**
   * Le volume déjà commandé par le client sur la fenêtre de son engagement,
   * par SKU. **Absent** = aucun engagement ne couvre ce SKU, ou rien commandé.
   */
  readonly orderedBySku: ReadonlyMap<string, number>;
  /**
   * Le ratio de volume observé, en points de base, par SKU. **Absent** = aucun
   * plancher de cet article ne demande cette mesure ; `null` = elle a été
   * demandée et il n'y a pas de référence.
   *
   * La distinction porte : « pas mesuré » et « mesuré sans référence » ouvrent
   * la porte différemment — le second protège, le premier ne se pose pas.
   */
  readonly volumeRatioBySku: ReadonlyMap<string, number | null>;
}

/** Aucune mesure — un panier qu'aucun engagement ni plancher dynamique ne touche. */
export const NO_EVIDENCE: PricingEvidence = {
  orderedBySku: new Map(),
  volumeRatioBySku: new Map(),
};
