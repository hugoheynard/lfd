import type { PricingAct, PricingSubjectType } from "../pricing-act.js";

/**
 * Un acte tel qu'il ressort du journal : ce qui a été écrit, plus son rang.
 *
 * Sans `subjectLabel` : il n'est versé qu'au journal général (plan des
 * phrases du journal, lot B) — la table du domaine a déjà sa phrase figée, et
 * lui ajouter une colonne demanderait une migration pour un gain nul.
 */
export interface JournalEntry extends Omit<PricingAct, "subjectLabel"> {
  readonly id: string;
}

/** La page demandée du journal d'un sujet. */
export interface JournalPageRequest {
  readonly subjectType: PricingSubjectType;
  readonly subjectId: string;
  /** À partir de 1. */
  readonly page: number;
  readonly pageSize: number;
  /**
   * L'`id` de l'acte le plus récent de l'**instantané** parcouru, ou `null`
   * pour en ouvrir un nouveau à partir de l'acte le plus récent du sujet.
   */
  readonly asOf: string | null;
}

/**
 * Une tranche du journal d'un sujet, dans un instantané.
 *
 * `total` compte les actes de l'instantané, pas ceux de la page ; `asOf` est
 * l'ancre effectivement lue — `null` quand le sujet n'a encore aucun acte.
 */
export interface JournalPage {
  readonly entries: readonly JournalEntry[];
  readonly total: number;
  readonly asOf: string | null;
}

/**
 * Port de **lecture** du journal — et il n'y a pas de port d'écriture.
 *
 * L'écriture n'existe pas séparément : elle est **exigée** par les ports
 * d'écriture des règles et des limites, qui prennent l'acte en même temps que la
 * mutation. C'est ce qui rend « aucun changement sans sa trace » structurel
 * plutôt que discipliné — un appelant ne peut pas oublier un argument
 * obligatoire, alors qu'il oublie très bien un second appel.
 *
 * Aucune méthode de modification ni d'effacement, ici ni ailleurs. Un journal
 * réinscriptible ne prouve rien.
 */
export abstract class PricingJournalReader {
  /** Ce qui est arrivé à cette règle ou à cette limite, du plus récent au plus ancien. */
  abstract forSubject(subjectType: string, subjectId: string): Promise<JournalEntry[]>;

  /**
   * Une page du journal d'un sujet, du plus récent au plus ancien, lue dans un
   * **instantané** : l'acte ancre et tout ce qui le suit dans cet ordre.
   *
   * L'ordre est **total** — `occurredAt`, puis l'`id` à la même milliseconde.
   * Sans lui, deux actes simultanés pourraient échanger leur rang d'une requête
   * à l'autre : l'un lu deux fois, l'autre jamais, à la frontière de deux pages.
   *
   * L'ancre est ce qui rend un NUMÉRO de page stable sur un fil append-only lu
   * par la tête : sans elle, un acte écrit entre la page 1 et la page 2 pousse
   * tout d'un rang, et le dernier acte de la page 1 réapparaît en tête de la 2.
   *
   * @throws {UnknownJournalAnchorError} `asOf` ne désigne aucun acte de ce sujet.
   */
  abstract pageForSubject(request: JournalPageRequest): Promise<JournalPage>;

  /** Les derniers actes, tous sujets confondus — la page « qui a touché aux prix ». */
  abstract recent(limit: number): Promise<JournalEntry[]>;
}
