import type { PricingAct } from "../pricing-act.js";

/** Un acte tel qu'il ressort du journal : ce qui a été écrit, plus son rang. */
export interface JournalEntry extends PricingAct {
  readonly id: string;
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

  /** Les derniers actes, tous sujets confondus — la page « qui a touché aux prix ». */
  abstract recent(limit: number): Promise<JournalEntry[]>;
}
