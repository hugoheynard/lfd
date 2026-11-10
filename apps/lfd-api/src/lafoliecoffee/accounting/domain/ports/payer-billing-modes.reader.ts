import type { PayerModeSegment } from "../services/payer-timeline.js";

/** Les segments vivants du mode d'un payeur. */
export interface PayerModeSegments {
  readonly payerCompanyId: string;
  readonly segments: readonly PayerModeSegment[];
}

/**
 * Port de LECTURE des modes des payeurs d'une entité (M1) : ceux qui ont au
 * moins un segment vivant. Un payeur absent est mensuel par défaut.
 */
export abstract class PayerBillingModesReader {
  /** Tous les payeurs de l'entité qui ont choisi un mode. */
  abstract segmentsOf(legalEntityId: string): Promise<readonly PayerModeSegments[]>;

  /** Les segments vivants d'un payeur ; vide s'il n'a rien choisi. */
  abstract segmentsOfPayer(
    legalEntityId: string,
    payerCompanyId: string,
  ): Promise<readonly PayerModeSegment[]>;
}
