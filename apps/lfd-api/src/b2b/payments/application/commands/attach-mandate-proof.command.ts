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
