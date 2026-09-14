import type { Buffer } from "node:buffer";

/**
 * Le client **renvoie son mandat signé**, scanné ou photographié.
 *
 * Le statut ne bouge pas : le client prouve, il ne s'active pas lui-même.
 * Activer autorise un débit, et reste le geste d'un commercial qui a relu la
 * pièce (plan `documentation/b2b/plan-mandat-client.md` §2).
 */
export class AttachMyCompanyMandateProofCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly fileName: string,
    readonly bytes: Buffer,
  ) {}
}
