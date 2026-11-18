/** Le payeur public qu'on ouvre : son identifiant et le nom que le journal affiche. */
export interface OpenedPublicPayer {
  readonly id: string;
  readonly name: string;
}

/**
 * **Activer un organisme public pose le virement** chez chaque entité
 * émettrice en service : il ne règle jamais par prélèvement, et ce moyen
 * s'écrit une fois plutôt que de se déduire à chaque lecture.
 *
 * Déclaré ici et implémenté par la comptabilité, qui possède les moyens
 * d'encaissement ; relié à la racine de composition, comme
 * `SiteMandateRevocation`. Appelé DANS la transaction de l'activation : le
 * compte s'ouvre avec son virement, ou rien ne bouge.
 */
export abstract class PublicPayerOpening {
  /**
   * Pose `bank_transfer` (motif « organisme public ») pour `payer` chez chaque
   * entité en service, au nom de `staffUserId`. Une entité où le virement est
   * déjà le moyen n'écrit rien.
   */
  abstract open(payer: OpenedPublicPayer, at: Date, staffUserId: string): Promise<void>;
}
