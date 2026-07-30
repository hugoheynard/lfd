import type { PaymentTerm, UpdateIdentityPayload } from "@lfd/contracts";

/**
 * Réglages d'entreprise éditables pendant l'onboarding. `actorUserId` accompagne
 * `companyId` : le mur (gestionnaire) se vérifie contre l'acteur, jamais le corps.
 */

/** Édite l'identité souple (enseigne + n° de TVA). */
export class UpdateCompanyIdentityCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly payload: UpdateIdentityPayload,
  ) {}
}

/** Enregistre la condition de règlement **souhaitée** (validée ensuite par le commercial). */
export class UpdatePaymentTermCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly paymentTerm: PaymentTerm,
  ) {}
}
