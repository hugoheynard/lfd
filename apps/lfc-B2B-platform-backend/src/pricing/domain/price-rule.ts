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
  /**
   * **Cette règle agit-elle malgré une mercuriale ?**
   *
   * Une mercuriale **scelle** la chaîne : elle pose un prix négocié, et les
   * étages suivants sont transparents (cf. `resolvePrice`). Sans ce scellement,
   * un client au tarif négocié cumulait sa remise déjà accordée avec l'offre
   * publique — personne ne l'avait décidé, c'était une conséquence de la
   * composition, et rien à l'écran ne le montrait.
   *
   * Le drapeau est la porte de sortie, et elle est **explicite** : `true` dit
   * « oui, cette promotion vise aussi les comptes sous mercuriale ». Le défaut
   * est `false`, parce qu'un cumul non voulu coûte de la marge en silence,
   * tandis qu'un cumul manquant se remarque tout de suite.
   *
   * Toujours `false` sur une règle d'étage `mercuriale` : une mercuriale qui
   * s'empilerait sur elle-même n'a pas de lecture.
   */
  readonly stacksOverMercuriale: boolean;
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
  /**
   * **Le volume cumulé sur la période d'engagement**, cette commande comprise.
   * `null` = aucun engagement ne couvre cet article pour ce client.
   *
   * C'est la seule mesure sur laquelle l'étage **volume** se juge quand elle
   * existe : un client qui a promis 6 000 sur l'année prend son palier dès la
   * première commande de 500, parce que c'est le cumul qui compte et non le
   * panier du jour. Les autres étages continuent de lire `quantity` — le seuil
   * d'une promotion parle bien de CETTE commande.
   *
   * Elle inclut la commande en cours : sans cela, la première commande d'une
   * période partirait toujours d'un cumul nul, et le palier arriverait avec une
   * commande de retard.
   */
  readonly cumulativeQuantity: number | null;
}

/**
 * **La quantité sur laquelle l'étage volume se juge.**
 *
 * Le cumul d'un engagement s'il y en a un, la quantité de la commande sinon.
 * Écrit une fois : la résolution, l'arbitrage de spécificité et la grille des
 * paliers doivent lire le MÊME nombre, sans quoi l'écran annoncerait un palier
 * que la caisse n'appliquerait pas.
 */
export function volumeQuantityOf(context: PricingContext): number {
  return context.cumulativeQuantity ?? context.quantity;
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
  /**
   * La **mercuriale qui a scellé** la chaîne, ou `null` si aucune n'agissait.
   *
   * Consigné pour la même raison que {@link floored} : c'est un prix qu'une
   * règle n'a pas produit. Sans ce champ, un commercial voyant sa promotion
   * absente de la trace ne saurait pas dire si elle a expiré, si elle a été
   * évincée par plus spécifique, ou si le tarif négocié du client l'a scellée.
   */
  readonly sealedByRuleId: string | null;
  /**
   * Les règles qui **auraient agi** si la mercuriale n'avait pas scellé.
   *
   * Une par étage au plus — celle qui avait déjà gagné son étage. Un scellement
   * ne fait pas remonter une règle moins spécifique : elle avait perdu son
   * étage avant que le scellement ne se pose, et la faire ressusciter
   * appliquerait une décision que l'éviction avait écartée.
   */
  readonly sealedRuleIds: readonly string[];
  readonly finalCents: number;
}
