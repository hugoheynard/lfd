import type { ActiveJournalFactType } from "@lfd/contracts/journal-facts";

import { PricingActNotJournaledError } from "./errors/shared-errors.js";

import type { RuleNames } from "./pricing-act-summary.js";
import type { PriceRule, PriceStage } from "./price-rule.js";

export {
  describeArticleCount,
  describeFloor,
  describeFloorPolicy,
  describeLadder,
  describeRule,
  describeScope,
  describeWindowOf,
  type RuleNames,
} from "./pricing-act-summary.js";

/**
 * **Un acte sur la tarification** — l'unité du journal.
 *
 * Sur un prix négocié, la question posée six mois plus tard n'est jamais « quelle
 * était la règle ? » : c'est **« qui a décidé ça, et qui l'a arrêté »**. La
 * réponse ne peut pas se déduire de l'état courant, puisque l'état courant est
 * précisément ce qui a remplacé la réponse. Il faut donc l'écrire au moment où
 * elle est encore vraie.
 *
 * Le journal est **strictement additif** : aucun port n'expose de modification
 * ni d'effacement. Un journal qu'on peut réécrire ne prouve rien — et le premier
 * jour où il servirait vraiment serait justement celui où quelqu'un aurait
 * intérêt à le corriger.
 */

export const PRICING_ACTS = [
  "posed",
  "paused",
  "resumed",
  "archived",
  "confirmed",
  "replaced",
  /**
   * **Renommé** — et rien d'autre.
   *
   * Un acte distinct de `replaced` parce qu'il ne change AUCUN prix : il corrige
   * la phrase que le client lira. Les confondre ferait chercher un changement
   * tarifaire là où il n'y en a pas eu, le jour où on relit le journal pour
   * comprendre une facture.
   */
  "renamed",
] as const;
export type PricingActKind = (typeof PRICING_ACTS)[number];

export type PricingSubjectType = "rule" | "floor" | "ladder" | "mercuriale";

export interface PricingAct {
  readonly subjectType: PricingSubjectType;
  readonly subjectId: string;
  readonly kind: PricingActKind;
  /**
   * L'id de la fiche du membre du staff (un `sub` Auth0 pour les actes écrits
   * avant le 2026-09-18). `system` pour un acte non humain.
   */
  readonly actor: string;
  readonly at: Date;
  /** Ce que l'auteur a écrit, quand l'écran le lui a demandé. */
  readonly reason: string | null;
  /**
   * **Ce que la décision disait**, en une phrase figée au moment de l'acte.
   *
   * Figée, et non recalculée à la lecture : la règle peut avoir changé, avoir
   * été archivée, ou avoir disparu du vocabulaire de l'écran. Un journal qui
   * rendrait la phrase d'aujourd'hui pour un acte d'hier raconterait l'histoire
   * à l'envers.
   */
  readonly summary: string;
  /**
   * **Le nom du sujet** au moment de l'acte (D6 du plan des phrases du
   * journal) : le libellé de la règle, du barème, de la mercuriale — la portée
   * nommée pour une limite, dont elle est le sujet. Il ne va qu'au journal
   * général : la table du domaine a déjà sa phrase figée.
   */
  readonly subjectLabel: string;
  /**
   * La société qu'une **règle** vise, nommée au moment de l'acte — absente
   * quand l'audience n'est pas une société, ou que l'annuaire ne la nomme pas.
   * Comme `subjectLabel`, elle ne va qu'au journal général (lot B du plan des
   * phrases, 2026-09-19).
   */
  readonly audience?: { readonly id: string; readonly name: string } | undefined;
  /**
   * **L'étage d'une règle** — présent sur un acte de règle, et seulement là.
   * Il ne va qu'au journal général, en donnée structurée : la table du domaine
   * le dit déjà au début de sa phrase figée, et c'est là qu'un écran devait
   * le découper (TODO des phrases du journal, 2026-09-19).
   */
  readonly stage?: PriceStage | undefined;
}

/**
 * Ce qu'un acte de **règle** cite d'elle en plus de sa phrase : son étage,
 * toujours, et la société qu'elle vise, nommée — ou rien pour celle-ci : une
 * audience qui n'est pas une société, ou une société que l'annuaire ne nomme
 * pas (la phrase garde alors son identifiant).
 *
 * Un seul point d'entrée pour les deux écrivains d'actes de règle (la pose et
 * le cycle de vie) : un acte de règle sans étage serait refusé par le
 * catalogue des faits en test, et passerait en production avec une erreur.
 */
export function ruleCitations(
  rule: PriceRule,
  names: RuleNames,
): {
  readonly stage: PriceStage;
  readonly audience?: { readonly id: string; readonly name: string };
} {
  const { audience, stage } = rule;
  if (audience.type !== "company" || audience.id === null || names.audienceName === null) {
    return { stage };
  }
  return { stage, audience: { id: audience.id, name: names.audienceName } };
}

/**
 * **Le fait générique** que porte un acte tarifaire.
 *
 * La tarification a son propre journal — plus riche que le général : il porte le
 * motif écrit par l'agent et la phrase figée de ce que la décision disait. On ne
 * le remplace pas. Mais un fait qui ne vit que dans la table d'un domaine reste
 * invisible de l'écran qui répond à « qui a fait quoi », et une remise consentie
 * sur un prix négocié est exactement ce qu'on y cherche.
 *
 * D'où le miroir : **un seul écrivain**, le dépôt, dans **une seule
 * transaction**, vers deux destinations qui ne répondent pas à la même question.
 * Deux lignes pour un acte, jamais deux vérités — elles ne peuvent pas diverger,
 * elles tombent ensemble.
 *
 * Le type est lu dans une **table sujet × geste**, et non composé à la volée
 * (`${préfixe}.${geste}`) : chaque case est typée par le catalogue des faits
 * (`@lfd/contracts/journal-facts`), donc un fait tarifaire qui n'y figure pas ne
 * compile pas, et une combinaison qu'aucun écran n'écrit se dit `null`
 * (inventaire du 2026-09-19 : seize combinaisons écrites sur vingt-huit).
 */
const FACT_TYPES: {
  readonly [S in PricingSubjectType]: Readonly<
    Record<PricingActKind, ActiveJournalFactType | null>
  >;
} = {
  rule: {
    posed: "price_rule.posed",
    paused: "price_rule.paused",
    resumed: "price_rule.resumed",
    archived: "price_rule.archived",
    confirmed: null,
    replaced: null,
    renamed: "price_rule.renamed",
  },
  floor: {
    posed: "price_floor.posed",
    paused: null,
    resumed: null,
    archived: "price_floor.archived",
    confirmed: "price_floor.confirmed",
    replaced: "price_floor.replaced",
    renamed: null,
  },
  ladder: {
    posed: "volume_ladder.posed",
    paused: "volume_ladder.paused",
    resumed: "volume_ladder.resumed",
    archived: "volume_ladder.archived",
    confirmed: null,
    replaced: null,
    renamed: null,
  },
  // Un sujet à part, et non `price_rule` : une mercuriale n'est plus une
  // collection de règles. Relire « pourquoi ce prix » six mois plus tard doit
  // rendre UN acte — « posée le 8 septembre » — et non les N que la pose
  // écrivait, dont aucun ne disait à quelle grille il appartenait.
  mercuriale: {
    posed: "company_mercuriale.posed",
    paused: null,
    resumed: null,
    archived: "company_mercuriale.archived",
    confirmed: null,
    replaced: null,
    renamed: "company_mercuriale.renamed",
  },
};

/** Le sujet du journal général, aligné sur le préfixe du fait. */
const FACT_SUBJECT: Readonly<Record<PricingSubjectType, string>> = {
  rule: "price_rule",
  floor: "price_floor",
  ladder: "volume_ladder",
  mercuriale: "company_mercuriale",
};

/**
 * @throws {PricingActNotJournaledError} un geste que ce sujet ne connaît pas
 *   (`null` dans la table) — un appelant neuf qui l'inventerait l'apprend ici.
 */
export function pricingFactOf(act: PricingAct): {
  readonly type: ActiveJournalFactType;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
} {
  const type = FACT_TYPES[act.subjectType][act.kind];
  if (type === null) {
    throw new PricingActNotJournaledError(act.subjectType, act.kind);
  }
  return {
    type,
    subjectType: FACT_SUBJECT[act.subjectType],
    subjectId: act.subjectId,
    // La phrase figée et le motif : c'est tout ce que le journal général a à
    // dire d'un acte tarifaire. Le détail de la règle vit dans sa table, et
    // l'y recopier ferait du journal une seconde base.
    payload: {
      subjectLabel: act.subjectLabel,
      summary: act.summary,
      reason: act.reason,
      ...(act.audience === undefined ? {} : { audience: { ...act.audience } }),
      ...(act.stage === undefined ? {} : { stage: act.stage }),
    },
    occurredAt: act.at,
  };
}
