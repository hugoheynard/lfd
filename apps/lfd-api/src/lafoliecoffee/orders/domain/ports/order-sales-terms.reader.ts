import type { SalesTermsDocument } from "@lfd/contracts";

/** La version d'un texte de CGV en vigueur à un instant — ce qu'une commande fige. */
export interface SalesTermsInForce {
  /** La révision du texte en ligne, ou `null` s'il n'a jamais été rédigé. */
  readonly revision: number | null;
  /** Le PDF de référence en vigueur, ou `null` s'il n'y en a aucun. */
  readonly fileId: string | null;
}

/**
 * Port de **lecture** des CGV en vigueur, vu depuis la passation (plan
 * `documentation/legal/plan-cgv-par-audience.md`, C4, C4′). Implémenté par le
 * contexte du contenu, qui tient les textes et leurs PDF.
 *
 * Rend toujours une réponse : un texte jamais rédigé rend deux `null`, et la
 * commande l'enregistre tel quel — on n'invente pas de version.
 */
export abstract class OrderSalesTermsReader {
  abstract inForce(document: SalesTermsDocument): Promise<SalesTermsInForce>;
}
