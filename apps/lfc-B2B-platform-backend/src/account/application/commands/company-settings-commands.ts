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

/**
 * Demande une condition de règlement (le client exprime un **souhait** ; le
 * terme convenu reste écrit par le staff). Enregistrée dans
 * `requested_payment_term` ; demander le terme déjà convenu retire la demande.
 */
export class RequestPaymentTermCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly paymentTerm: PaymentTerm,
  ) {}
}
