import { fromCents, roundToCents, scaleByBasisPoints } from "./exact-money.js";
import { PRICE_STAGES, type PriceRule, type PriceStage } from "./price-rule.js";
import { compareSpecificity } from "./specificity.js";

/**
 * **Deux décisions qui se recouvrent dans le temps.**
 *
 * Une promotion de rentrée du 1er au 20, un geste de fin de mois du 15 au 30 :
 * du 15 au 20, les deux jouent. Personne ne l'a décidé — chacune a été posée
 * pour de bonnes raisons, à des semaines d'intervalle — et le client, lui, paie
 * le cumul.
 *
 * **Le cumul n'est pas une somme.** −20 % puis −10 % font −28 %, parce que la
 * seconde s'applique au prix sortant de la première. C'est la loi du pipeline
 * (cf. `resolve-price.ts`), et ce module la réutilise plutôt que de la
 * réécrire : deux arithmétiques du même cumul finiraient par afficher un chiffre
 * que la caisse ne facture pas.
 *
 * **Et tout recouvrement n'est pas un cumul.** Dans un MÊME étage, la règle la
 * plus spécifique évince l'autre — elles ne s'additionnent pas, l'une gagne.
 * Confondre les deux ferait crier au cumul là où il n'y a qu'une relève, et
 * c'est la distinction que ce module porte.
 */

/** Ce qui se passe quand plusieurs règles couvrent le même instant. */
export type OverlapKind =
  /** Plusieurs étages survivent : elles se composent, le client paie le produit. */
  | "compose"
  /** Une seule survit : les autres sont évincées dans leur étage. */
  | "supersede";

export interface OverlapSegment {
  /** Borne basse **incluse**. */
  readonly from: Date;
  /** Borne haute **exclue**. `null` = le recouvrement ne se referme jamais. */
  readonly to: Date | null;
  /** Toutes les règles en vigueur sur la tranche, gagnantes comprises. */
  readonly ruleIds: readonly string[];
  /**
   * Celles qu'une **plus spécifique évince** dans leur propre étage.
   *
   * C'est le cas dominant dès qu'on regarde une lignée : une promotion famille
   * et une promotion catalogue se recouvrent en permanence, et la famille gagne.
   * Le tableau montrait déjà la barrée ; il ne disait pas **à partir de quand**,
   * ni **jusqu'à quand** — la seule chose qu'on veut savoir devant deux dates.
   */
  readonly evictedIds: readonly string[];
  readonly kind: OverlapKind;
  /**
   * L'effet cumulé des **gagnantes**, en points de base d'une baisse
   * (`2800` = −28 %).
   *
   * Des gagnantes seulement, et c'est tout l'intérêt de le calculer ici : une
   * règle évincée ne produit rien, et la compter ferait afficher un cumul que la
   * caisse ne facture pas.
   *
   * `null` dès qu'une gagnante n'est pas une altération en pourcentage : un
   * montant en euros ou un prix posé ne se cumulent pas en fraction sans
   * connaître l'article, et cette vue n'en connaît aucun. Afficher un chiffre là
   * serait inventer une réponse à une question mal posée.
   */
  readonly composedBp: number | null;
  /**
   * Le même cumul, mais **au palier le plus haut** du barème en jeu.
   *
   * Égal à {@link composedBp} tant qu'aucun barème n'entre dans la tranche — un
   * cumul de règles ne dépend pas de la quantité. Dès qu'un barème compose, il en
   * dépend : l'écran annonce alors une fourchette plutôt qu'un chiffre unique,
   * qui serait faux pour toutes les quantités sauf une.
   */
  readonly composedTopBp: number | null;
}

/**
 * Les tranches de temps où **plusieurs** règles sont en vigueur à la fois.
 *
 * Découpe l'axe du temps sur les bornes des règles, garde les tranches à deux
 * règles ou plus, et fusionne les tranches voisines qui portent le même jeu de
 * règles — sans quoi une borne partagée par trois règles produirait deux
 * segments identiques à la suite.
 *
 * Les règles **suspendues ou archivées** sont exclues en amont par les lecteurs :
 * un recouvrement avec une règle qui n'agit plus n'existe pas.
 */
export function overlapSegments(rules: readonly PriceRule[]): OverlapSegment[] {
  const bounds = boundariesOf(rules);
  const segments: OverlapSegment[] = [];

  for (let index = 0; index < bounds.length - 1; index += 1) {
    const from = bounds[index];
    const to = bounds[index + 1];
    if (from === undefined) {
      continue;
    }
    const active = rules.filter((rule) => coversStart(rule, from));
    if (active.length < 2) {
      continue;
    }
    segments.push(segmentOf(from, to ?? null, active));
  }

  return merge(segments);
}

/**
 * Toutes les bornes, dédoublonnées et triées — plus la fin ouverte, portée par
 * `undefined` en queue de liste.
 */
function boundariesOf(rules: readonly PriceRule[]): (Date | undefined)[] {
  const times = new Set<number>();
  let hasOpenEnd = false;
  for (const rule of rules) {
    times.add(rule.validFrom.getTime());
    if (rule.validTo === null) {
      hasOpenEnd = true;
    } else {
      times.add(rule.validTo.getTime());
    }
  }
  const sorted = [...times].sort((left, right) => left - right).map((time) => new Date(time));
  return hasOpenEnd ? [...sorted, undefined] : sorted;
}

/** Borne basse incluse, borne haute exclue — la convention de tout le module. */
function coversStart(rule: PriceRule, at: Date): boolean {
  if (rule.validFrom.getTime() > at.getTime()) {
    return false;
  }
  return rule.validTo === null || rule.validTo.getTime() > at.getTime();
}

function segmentOf(from: Date, to: Date | null, active: readonly PriceRule[]): OverlapSegment {
  const winners = winnersOf(active);
  const winnerIds = new Set(winners.map((rule) => rule.id));
  return {
    from,
    to,
    ruleIds: active.map((rule) => rule.id),
    evictedIds: active.filter((rule) => !winnerIds.has(rule.id)).map((rule) => rule.id),
    kind: winners.length > 1 ? "compose" : "supersede",
    composedBp: composedBp(winners),
    // Sans barème, le cumul ne dépend pas de la quantité : les deux bouts de la
    // fourchette sont le même chiffre, et l'écran n'en affiche qu'un.
    composedTopBp: composedBp(winners),
  };
}

/**
 * **Une gagnante par étage** — la plus spécifique, avec l'ordre qui facture.
 *
 * C'est la loi du pipeline appliquée à une tranche de temps : dans un étage une
 * seule règle agit, entre étages elles s'empilent. Deux règles strictement aussi
 * spécifiques ne peuvent pas coexister (contrainte d'exclusion en base) ; si
 * l'impossible arrivait, la première rencontrée gagne — cette vue **décrit**,
 * elle ne facture pas, et lever ici ferait tomber tout un écran de lecture pour
 * une donnée abîmée.
 */
function winnersOf(active: readonly PriceRule[]): readonly PriceRule[] {
  const best = new Map<PriceStage, PriceRule>();
  for (const rule of active) {
    const held = best.get(rule.stage);
    if (held === undefined || compareSpecificity(rule, held) > 0) {
      best.set(rule.stage, rule);
    }
  }
  return [...best.values()];
}

/**
 * **Ce que le cumul fait vraiment au prix**, en points de base d'une baisse.
 *
 * Composé et non additionné, dans l'ordre des étages et avec l'arithmétique
 * exacte du pipeline : c'est la même opération que celle qui facture, donc le
 * chiffre affiché est celui que le client paiera.
 *
 * Le calcul part de 100,00 € fictifs : la fraction ne dépend pas du prix de
 * départ, donc n'importe quelle base donne le même ratio — et une base ronde
 * évite un arrondi parasite.
 */
function composedBp(active: readonly PriceRule[]): number | null {
  const percents = active.map(percentAlterationOf);
  if (percents.some((alteration) => alteration === null)) {
    return null;
  }
  const ordered = [...active].sort(
    (left, right) => PRICE_STAGES.indexOf(left.stage) - PRICE_STAGES.indexOf(right.stage),
  );

  const base = 10_000;
  let running = fromCents(base);
  for (const rule of ordered) {
    const alteration = percentAlterationOf(rule);
    if (alteration === null) {
      return null;
    }
    running = scaleByBasisPoints(running, alteration.bp, alteration.direction);
  }
  return base - roundToCents(running);
}

/**
 * L'altération en pourcentage d'une règle, ou `null` — la seule forme qui se
 * cumule sans connaître l'article.
 *
 * Rend le SENS déjà traduit en facteur (`-1` / `1`) : le reste du module n'a
 * alors plus à connaître le vocabulaire des directions.
 */
function percentAlterationOf(rule: PriceRule): { bp: number; direction: 1 | -1 } | null {
  if (rule.nature !== "alter" || rule.alteration.mode !== "percent") {
    return null;
  }
  return {
    bp: rule.alteration.bp,
    direction: rule.alteration.direction === "decrease" ? -1 : 1,
  };
}

/**
 * Fusionne les tranches voisines qui portent le **même** jeu de règles.
 *
 * Sans ça, une borne partagée — deux règles qui commencent le même jour —
 * couperait un recouvrement continu en deux segments identiques, et l'écran
 * afficherait deux fois la même information sur deux lignes.
 */
function merge(segments: readonly OverlapSegment[]): OverlapSegment[] {
  const merged: OverlapSegment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && sameRules(previous, segment)) {
      merged[merged.length - 1] = { ...previous, to: segment.to };
      continue;
    }
    merged.push(segment);
  }
  return merged;
}

function sameRules(left: OverlapSegment, right: OverlapSegment): boolean {
  return (
    left.ruleIds.length === right.ruleIds.length &&
    left.ruleIds.every((id, index) => id === right.ruleIds[index])
  );
}
