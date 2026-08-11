/**
 * Enregistre un **mandat de prélèvement SEPA** pour une société (geste staff).
 *
 * `paymentMethodId` vient de l'IBAN Element : le navigateur a envoyé l'IBAN
 * directement à Stripe et ne nous rend qu'un identifiant. `acceptedAt` est la
 * date du **papier signé** — `null` quand le commercial ne la précise pas, et
 * l'instant courant fait alors foi.
 */
export class RegisterMandateCommand {
  constructor(
    readonly companyId: string,
    readonly paymentMethodId: string,
    readonly acceptedAt: Date | null,
  ) {}
}

/** Retire l'autorisation de prélever — chez nous **et** chez le prestataire. */
export class RevokeMandateCommand {
  constructor(readonly companyId: string) {}
}

/**
 * Dépose le **mandat signé scanné** — la seule pièce qui prouve le consentement.
 * Le RIB, lui, ne prouve rien : il donne des coordonnées, pas une autorisation.
 */
export class AttachMandateProofCommand {
  constructor(
    readonly companyId: string,
    readonly fileName: string,
    readonly bytes: Buffer,
  ) {}
}
