import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/** Ce qu'une entité a émis, compté — ce qu'une bascule de schéma laisserait derrière elle. */
export interface IssuedMandatesUsage {
  /** Les mandats ACTIFS, par schéma figé à leur frappe. */
  readonly activeByScheme: Readonly<Record<SepaScheme, number>>;
  /** Les brouillons en cours — ceux qu'une bascule rend caducs. */
  readonly drafts: number;
}

/**
 * Port de **lecture** des mandats émis par une entité, déclaré par la
 * comptabilité et implémenté par `payments`, qui possède `payment_mandates`.
 *
 * Séparé de {@link IssuedDraftMandates} par ISP : l'écran qui prépare la
 * confirmation ne révoque rien, et le handler qui révoque ne compte rien.
 *
 * Des comptes et pas des listes : le dialogue dit « 3 brouillons deviendront
 * caducs », il ne les énumère pas.
 */
export abstract class IssuedMandatesReader {
  abstract usageOf(creditorId: string): Promise<IssuedMandatesUsage>;
}
