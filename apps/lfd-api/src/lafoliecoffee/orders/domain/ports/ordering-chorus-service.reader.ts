/** L'engagement en cours d'une société qui commande. */
export interface OrderingCurrentCommitment {
  readonly number: string;
  /** Le dernier jour de validité du bon, `AAAA-MM-JJ`. */
  readonly endsOn: string;
}

/** La fiche du service Chorus de la société qui commande. */
export interface OrderingChorusService {
  /** Le payeur au moment où la fiche a été posée. */
  readonly payerCompanyId: string;
  /** Vide : le code de la fiche Chorus du payeur s'applique. */
  readonly serviceCode: string;
  readonly currentCommitment: OrderingCurrentCommitment | null;
}

/**
 * **Ce que la société qui commande propose d'engagement** (plan
 * `plan-clients-publics-chorus.md`, § 6 octies) — son code service et
 * l'engagement en cours de son bon, pour préremplir l'écran de passation.
 * Port étroit, déclaré par la commande, implémenté par le compte client (qui
 * possède la fiche) ; `appBootstrap/payer-commitment-requirements.module.ts`
 * les relie. Il ne décide rien à la passation : il propose.
 */
export abstract class OrderingChorusServiceReader {
  /** La fiche de cette société, ou `null` : jamais posée. */
  abstract of(companyId: string): Promise<OrderingChorusService | null>;
}
