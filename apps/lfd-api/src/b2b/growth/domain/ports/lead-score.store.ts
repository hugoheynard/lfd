import type { LeadScoreView } from "@lfd/contracts";

/**
 * Port d'**écriture** du read-model `lead_score` (surface séparée de la lecture,
 * cf. `LeadScoreReader` — ISP). Le recompute **remplace intégralement** la table :
 * une projection recalculée d'un bloc, pas une mutation incrémentale. Sémantique
 * tout-ou-rien (wipe + insert dans une transaction) → jamais de queue à moitié
 * remplacée servie au cockpit.
 */
export abstract class LeadScoreStore {
  abstract replaceAll(rows: readonly LeadScoreView[]): Promise<void>;
}
