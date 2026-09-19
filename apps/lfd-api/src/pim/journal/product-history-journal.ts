import { DomainError } from "../../platform/shared/errors/app-error.js";
import type { PimJournalFact } from "./pim-journal-reader.js";
import type { PimSubjectType } from "./pim-journal.js";

/**
 * Quels types de fait un fil retient.
 *
 * Par **préfixe** le plus souvent : un fait d'un autre bloc qui porterait le
 * même sujet ne doit jamais entrer dans un historique du référentiel (plan du
 * journal, lot 3). Par **liste exacte** quand le sujet lui-même ne suffit pas
 * à dire ce qu'on cherche — une révision prise et une révision poussée ne
 * s'adressent pas par le même identifiant.
 */
export type HistoryTypeMatch =
  { readonly prefix: string } | { readonly exactly: readonly string[] };

/**
 * **Un fil** de l'historique : des sujets d'une même sorte, et les types de
 * fait qu'on y lit. L'historique d'une fiche en tresse plusieurs.
 */
export interface HistoryThread {
  readonly subjectType: PimSubjectType;
  readonly subjectIds: readonly string[];
  readonly types: HistoryTypeMatch;
}

/** Un fait relu, avec son identifiant au journal — l'ancre en a besoin. */
export interface HistoryFact extends PimJournalFact {
  readonly id: string;
}

export interface HistoryPageRequest {
  readonly threads: readonly HistoryThread[];
  /** À partir de 1. */
  readonly page: number;
  readonly pageSize: number;
  /** `null` = un instantané neuf, ancré sur le fait le plus récent des fils. */
  readonly asOf: string | null;
}

export interface HistoryPage {
  readonly facts: readonly HistoryFact[];
  /** Les faits de l'instantané, toutes pages confondues. */
  readonly total: number;
  /** `null` quand aucun fil ne porte encore de fait. */
  readonly asOf: string | null;
}

/**
 * Port de **lecture paginée** du journal, pour l'historique d'une fiche.
 *
 * À côté de {@link PimJournalReader} et pas dedans : l'un rend un intervalle
 * pour l'attribution d'un diff, l'autre une page d'un instantané. Deux
 * consommateurs, deux questions — un lecteur qui porterait les deux ferait
 * dépendre chacun de ce qu'il n'appelle pas.
 *
 * Les identifiants arrivent **résolus** : c'est le référentiel qui sait ce
 * qu'une fiche porte (sa famille, ses taux, ses révisions), en lisant ses
 * propres tables. L'adaptateur, lui, ne lit que le journal — il ne joint
 * jamais le schéma `pim` au schéma `growth`.
 *
 * L'ordre est **total** : `occurred_at` décroissant, puis `id` décroissant.
 * L'ancre découpe l'instantané par ce même couple.
 */
export abstract class ProductHistoryJournal {
  /**
   * @throws {UnknownHistoryAnchorError} `asOf` ne désigne aucun fait des fils.
   */
  abstract page(request: HistoryPageRequest): Promise<HistoryPage>;
}

/**
 * **L'ancre ne désigne aucun fait de cet historique.** Un lien périmé, ou une
 * fiche qui a changé de famille entre deux pages : l'instantané que la page 1
 * avait fixé n'existe plus tel quel.
 */
export class UnknownHistoryAnchorError extends DomainError {
  constructor(readonly asOf: string) {
    super(
      "pim.history.anchor_unknown",
      `L'ancre « ${asOf} » ne désigne aucun fait de cet historique : rouvrez-le à la première page.`,
    );
  }
}
