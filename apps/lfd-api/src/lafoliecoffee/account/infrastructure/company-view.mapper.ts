import type { Prisma } from "../../../platform/database/client/client.js";
import type { CustomerRole } from "../../../platform/database/client/client.js";
import type { CompanyView, ContactView } from "../domain/ports/account.reader.js";
import { isPublicFormeJuridique } from "../domain/value-objects/public-nature.js";
import { requiresVatNumber } from "../domain/value-objects/vat-liability.js";

/**
 * Ce qu'une `CompanyView` lit d'une société — UNE sélection pour les deux
 * listes de `GET /me` : les sociétés propres et les sites atteints par
 * héritage (S6, `documentation/comptes-client/plan-entrer-dans-ses-sites.md`
 * §6). Deux copies divergeraient, et la boutique lit les deux de la même façon.
 */
export const COMPANY_VIEW_SELECT = {
  id: true,
  reference: true,
  raisonSociale: true,
  enseigne: true,
  formeJuridique: true,
  siret: true,
  siren: true,
  vatNumber: true,
  status: true,
  grantedTerms: true,
  requestedTerm: true,
  directDebitBlockedAt: true,
  preferredFulfillmentMethod: true,
  preferredPickupAddressId: true,
  preferredDeliveryAddressId: true,
  deliverySignatureRequired: true,
  kbisFileName: true,
  kbisUploadedAt: true,
  kbisCertifiedAt: true,
  // Contact principal, aplati sur la société.
  contactPrenom: true,
  contactNom: true,
  contactFonction: true,
  contactEmail: true,
  contactTelephone: true,
  // Le principal suivi en `billing` (période ouverte) : c'est le PAYEUR. Sa
  // nature décide de la carte, et son crédit décide du « au compte » — la
  // passation lit le même payeur (`accountStanding`). Une période s'ouvre et
  // se ferme à l'instant du geste : ouverte veut dire en cours.
  follows: {
    where: { aspect: "billing", validTo: null },
    select: {
      parent: {
        select: { formeJuridique: true, grantedTerms: true, directDebitBlockedAt: true },
      },
    },
  },
  contacts: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      prenom: true,
      nom: true,
      fonction: true,
      email: true,
      telephone: true,
      role: true,
    },
  },
} as const satisfies Prisma.CompanySelect;

/** Une société telle que {@link COMPANY_VIEW_SELECT} la lit. */
export type CompanyViewRow = Prisma.CompanyGetPayload<{ select: typeof COMPANY_VIEW_SELECT }>;

/**
 * La ligne → la vue, avec le rôle que l'appelant a établi : celui de la
 * membership pour une société propre, le rôle EFFECTIF pour un site atteint.
 */
export function toCompanyView(role: CustomerRole, company: CompanyViewRow): CompanyView {
  // Un site facturé chez son principal règle selon le crédit du principal :
  // c'est lui qui reçoit la facture et le prélèvement.
  const payer = company.follows[0]?.parent ?? company;
  return {
    id: company.id,
    reference: company.reference,
    raisonSociale: company.raisonSociale,
    enseigne: company.enseigne,
    formeJuridique: company.formeJuridique,
    siret: company.siret,
    siren: company.siren,
    vatNumber: company.vatNumber,
    vatNumberRequired: requiresVatNumber(company.formeJuridique),
    status: company.status,
    grantedTerms: payer.grantedTerms,
    requestedTerm: company.requestedTerm,
    directDebitBlocked: payer.directDebitBlockedAt !== null,
    payerIsPublic: isPublicFormeJuridique(payer.formeJuridique),
    billedByParent: company.follows.length > 0,
    fulfillmentPreference: {
      method: company.preferredFulfillmentMethod,
      pickupAddressId: company.preferredPickupAddressId,
      deliveryAddressId: company.preferredDeliveryAddressId,
      signatureRequired: company.deliverySignatureRequired,
    },
    role,
    // Le contact principal EST le détenteur : son rôle n'est pas choisi, il
    // est constaté — d'où `null` ici plutôt qu'une valeur à maintenir.
    primaryContact: {
      id: null,
      role: null,
      firstName: company.contactPrenom,
      lastName: company.contactNom,
      fonction: company.contactFonction,
      email: company.contactEmail,
      phone: company.contactTelephone,
    },
    contacts: company.contacts.map(toContactView),
    // KBIS présent seulement si un fichier a été déposé ; certifié = ce
    // fichier a été validé par le staff (indépendant de status).
    kbis:
      company.kbisFileName !== null && company.kbisUploadedAt !== null
        ? {
            fileName: company.kbisFileName,
            uploadedAt: company.kbisUploadedAt.toISOString(),
            certified: company.kbisCertifiedAt !== null,
          }
        : null,
  };
}

/** Une ligne de contact additionnel → la vue (renommage prenom→firstName, etc.). */
function toContactView(row: CompanyViewRow["contacts"][number]): ContactView {
  return {
    id: row.id,
    firstName: row.prenom,
    lastName: row.nom,
    fonction: row.fonction,
    email: row.email,
    phone: row.telephone,
    role: row.role,
  };
}
