import type { PriceFloorPolicy } from "./floor-policy.js";

/**
 * Le vocabulaire de la **résolution de prix** — cf.
 * `documentation/b2b/architecture-resolution-de-prix.md`.
 *
 * Ces types sont ceux du **domaine**, volontairement redéclarés ici plutôt
 * qu'importés de `@lfd/b2b-ui/pricing` : le domaine ne dépend pas d'un paquet de
 * présentation. La forme est la même (`bp` / `cents`, entiers, grandeur toujours
 * positive, sens porté par `direction`) — et elle doit le rester : deux
 * vocabulaires pour la même chose finiraient par se contredire.
 */

/**
 * Les **étages**, dans l'ordre où ils s'appliquent.
 *
 * L'ordre **est** la décision commerciale, pas un détail : −20 % puis −5 € ne
 * donne pas le même prix que −5 € puis −20 %. Le déclarer une fois, ici, évite
 * qu'un appelant en choisisse un autre sans le savoir.
 */
export const PRICE_STAGES = ["mercuriale", "volume", "promotion", "geste"] as const;
export type PriceStage = (typeof PRICE_STAGES)[number];

/**
 * Les étages qu'une **règle** peut porter — `volume` n'en est pas.
 *
 * Le volume appartient au **barème** : une échelle entière, posée d'un geste,
 * dont l'agrégat garantit qu'elle progresse. Une règle volume libre entrait dans
 * le même étage sans passer par aucun de ces refus, et l'emportait par
 * spécificité contre le barème de la même cible.
 *
 * L'étage reste dans {@link PRICE_STAGES} parce que le **calcul** en a besoin :
 * `ladderAsRule` y présente le barème, et toutes les traces déjà figées le
 * nomment. Ce qui disparaît est la façon de l'écrire, pas l'étage.
 */
export type AuthoredPriceStage = Exclude<PriceStage, "volume">;

/** Ce qu'une règle vise, du plus large au plus précis. */
export type PriceScopeType = "global" | "category" | "product" | "variant";

/** Qui la règle vise, du plus large au plus précis. */
export type PriceAudienceType = "all" | "segment" | "company";

export interface PriceScope {
  readonly type: PriceScopeType;
  /** `null` **si et seulement si** `type === 'global'`. */
  readonly id: string | null;
}

export interface PriceAudience {
  readonly type: PriceAudienceType;
  /** `null` **si et seulement si** `type === 'all'`. */
  readonly id: string | null;
}

export type PriceDirection = "increase" | "decrease";

/**
 * De combien, dans quelle unité, dans quel sens.
 *
 * La grandeur reste **toujours positive** : « −20 % » se dit par `direction`,
 * jamais par un signe. Deux façons d'exprimer la même chose finiraient par se
 * contredire.
 */
export type PriceAlteration =
  | { readonly direction: PriceDirection; readonly mode: "percent"; readonly bp: number }
  | { readonly direction: PriceDirection; readonly mode: "amount"; readonly cents: number };

/**
 * Le **plancher**, à deux formes (décision du 2026-08-17).
 *
 * `percent` : une fraction du prix canonique, en points de base — elle suit le
 * tarif quand le PIM augmente. `amount` : une limite absolue en centimes, pour
 * un article dont on connaît un coût fixe qu'un pourcentage n'exprimerait pas.
 *
 * C'est un **garde-fou** contre l'empilement accidentel, pas une règle de marge :
 * le prix de revient n'existe nulle part dans le modèle. Le jour où il existera,
 * il deviendra une troisième forme, sans rien défaire ici.
 */
export type PriceFloor =
  | { readonly mode: "percent"; readonly bp: number }
  | { readonly mode: "amount"; readonly cents: number };

/**
 * Un plancher **posé sur une portée** — la forme sous laquelle il se saisit et
 * se persiste.
 *
 * Trois choses qu'il n'a pas, et dont chacune est une décision :
 *
 * - **pas d'étage.** Un plancher n'est pas une couche de prix, c'est la limite
 *   que l'empilement des couches ne franchit pas. Lui donner un rang le ferait
 *   composer avec les autres, alors qu'il les arbitre ;
 * - **pas d'audience.** Il protège la maison contre son propre barème, pas un
 *   client contre un autre. Un plancher négociable ne plancherait rien ;
 * - **pas de fenêtre.** Un garde-fou daté est un garde-fou qui s'ouvre tout
 *   seul un matin, sans que personne ne l'ait décidé ce matin-là.
 *
 * Reste donc la **portée**, résolue exactement comme celle des règles : le plus
 * spécifique gagne, et il n'y a rien à réapprendre.
 */
export interface ScopedPriceFloor {
  readonly id: string;
  readonly scope: PriceScope;
  /**
   * Le mur et, s'il y en a une, la porte — cf. `PriceFloorPolicy`.
   *
   * Une **politique** et non un plancher nu : quel étage s'applique dépend de la
   * commande et de l'historique, donc la portée seule ne suffit plus à répondre.
   * Les deux questions restent séparées — « quel plancher me vise ? » puis
   * « lequel de ses étages s'ouvre ? ».
   */
  readonly policy: PriceFloorPolicy;
}

/**
 * Une règle tarifaire.
 *
 * `replace` **pose** un prix (un engagement en euros — la mercuriale) ; `alter`
 * **modifie** le prix entrant. La distinction n'est pas cosmétique : une
 * mercuriale saisie en pourcentage suivrait le tarif de liste, ce qui n'est pas
 * ce qu'on a promis au client.
 */
export type PriceRule = {
  readonly id: string;
  readonly stage: PriceStage;
  readonly scope: PriceScope;
  readonly audience: PriceAudience;
  /** Quantité minimale d'application. `null` = aucun seuil. */
  readonly minQuantity: number | null;
  /** Borne basse **incluse**. */
  readonly validFrom: Date;
  /** Borne haute **exclue**. `null` = ouverte. */
  readonly validTo: Date | null;
  /**
   * L'instant où la règle a **cessé d'agir**, indépendamment de sa fenêtre.
   * `null` = elle n'a jamais été interrompue.
   *
   * Un seul champ pour deux gestes pourtant très différents — la suspension et
   * l'archivage — parce que le **calcul** n'a aucune raison de les distinguer :
   * les deux disent « cette règle n'agit plus ». Ce qui les sépare — une pause
   * réserve son créneau, un archivage le rend — ne regarde que le staff et la
   * base. Cf. `rule-lifecycle.ts`.
   */
  readonly suspendedFrom: Date | null;
  /** Ce que la trace affichera. */
  readonly label: string;
} & (
  | { readonly nature: "replace"; readonly amountCents: number }
  | { readonly nature: "alter"; readonly alteration: PriceAlteration }
);

/** Ce sur quoi on résout : un article, une quantité, un client, un instant. */
export interface PricingContext {
  readonly at: Date;
  readonly quantity: number;
  /** Les identifiants de portée de l'article visé. */
  readonly variantSku: string;
  readonly productSku: string;
  readonly categoryId: string;
  /** `null` pour une commande sans entreprise (parcours zéro friction). */
  readonly companyId: string | null;
  readonly segmentId: string | null;
}

/** Un étage qui a produit un effet — l'unité de la trace. */
export interface PriceStep {
  readonly stage: PriceStage;
  readonly ruleId: string;
  readonly label: string;
  /** Le prix **au sortir** de cet étage, arrondi pour l'affichage. */
  readonly resultCents: number;
}

/**
 * Le résultat, avec **sa trace**.
 *
 * Un chiffre seul ne se défend pas : la trace permet au panier d'afficher
 * « pourquoi ce prix », au service client de répondre, et à une facture
 * contestée de se relire.
 */
export interface ResolvedPrice {
  readonly basePriceCents: number;
  readonly steps: readonly PriceStep[];
  /**
   * Le plancher a-t-il **relevé** le prix ?
   *
   * Consigné plutôt qu'avalé : un prix relevé est un prix dont une règle n'a pas
   * produit son effet, et il vaut mieux le voir avant qu'un client ne le
   * remarque.
   */
  readonly floored: boolean;
  /**
   * La chaîne est-elle **passée sous zéro**, et le prix ramené à zéro ?
   *
   * Consigné plutôt qu'avalé, pour la même raison que {@link floored} : c'est
   * le signe qu'une règle a produit autre chose que ce que son auteur croyait.
   * Une baisse en euros plus grande que le prix de l'article — « −5 € » sur un
   * croissant à 2 € — est la façon la plus banale d'y arriver, et elle ne se
   * refuse pas à la saisie puisque le canonique varie d'un article à l'autre.
   */
  readonly clampedToZero: boolean;
  readonly finalCents: number;
}
