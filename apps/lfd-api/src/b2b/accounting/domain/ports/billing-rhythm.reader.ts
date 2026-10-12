import type { RhythmTimeline } from "../services/invoicing-closures.js";

/**
 * ⚠️ **ADAPTATEUR DE TRANSITION (lot M1, plan `plan-rythme-de-facturation.md`,
 * §16)** — la suite des clôtures que lisent encore la facture, le lot, le
 * relevé, le dossier et la fiche, écrits pour le rythme UNIQUE de l'entité
 * (R2–R5b).
 *
 * Depuis M1, il n'y a plus de rythme unique : l'entité fixe les dates de trois
 * modes, chaque payeur en choisit un. En attendant que M2 (facture), M3 (lot)
 * et M4 (relevé, dossier) passent aux timelines des payeurs et au calendrier
 * d'union, ce port leur rend **la timeline du MODE MENSUEL** de l'entité —
 * mensuel au 1er par défaut, donc le comportement d'avant inchangé tant que
 * personne ne règle les dates du mensuel.
 *
 * À retirer quand plus aucun appelant ne le lit (fin de M4).
 */
export abstract class BillingRhythmReader {
  /** La timeline du mode mensuel de l'entité, ou `null` si elle n'existe pas. */
  abstract timelineOf(legalEntityId: string): Promise<EntityTimeline | null>;
}

/**
 * Une suite de clôtures qui se compare : le relevé refuse deux entités en
 * service à des suites différentes (`statementTimeline`). En production, une
 * `ModeDatesTimeline` ; en test, un `BillingRhythmSetting` suffit.
 */
export interface EntityTimeline extends RhythmTimeline {
  equals(other: EntityTimeline): boolean;
}
