/** Le compte ouvert au comptoir : son identifiant et le nom que le journal affiche. */
export interface OpenedCounterPayer {
  readonly id: string;
  readonly name: string;
}

/**
 * **Un compte ouvert au comptoir naît au virement** chez chaque entité
 * émettrice en service (`plan-comptes-du-comptoir.md`, § 3.2) : il n'a ni RIB
 * ni mandat, et la facture se lirait sinon « prélèvement sans mandat ».
 *
 * Déclaré ici et implémenté par la comptabilité, qui possède les moyens
 * d'encaissement ; relié à la racine de composition, comme
 * `PublicPayerOpening`. Appelé DANS la transaction de l'ouverture : le compte
 * s'ouvre avec son virement, ou rien ne s'écrit.
 */
export abstract class CounterPayerOpening {
  /** Pose `bank_transfer` (motif « ouvert au comptoir ») pour `payer`, au nom de `staffUserId`. */
  abstract open(payer: OpenedCounterPayer, at: Date, staffUserId: string): Promise<void>;
}
