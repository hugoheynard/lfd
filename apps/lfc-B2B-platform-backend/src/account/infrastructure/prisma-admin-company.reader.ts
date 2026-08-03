import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../infra/database/client/client.js";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { CompanyAddressReader } from "../domain/ports/company-address.reader.js";
import {
  AdminCompanyReader,
  type AdminCompanyDetailView,
  type AdminCompanyView,
} from "../domain/ports/admin-company.reader.js";
import { requiresVatNumber } from "../domain/value-objects/vat-liability.js";

/** Colonnes lues pour une vue admin — partagées par la liste et la fiche. */
const COMPANY_SELECT = {
  id: true,
  reference: true,
  raisonSociale: true,
  enseigne: true,
  formeJuridique: true,
  siret: true,
  tvaIntracom: true,
  status: true,
  paymentTerm: true,
  requestedPaymentTerm: true,
  kbisFileName: true,
  kbisUploadedAt: true,
  kbisCertifiedAt: true,
  contactPrenom: true,
  contactNom: true,
  contactFonction: true,
  contactEmail: true,
  contactTelephone: true,
  createdAt: true,
  // Une seule demande ouverte suffit à lever le drapeau ; `take: 1` évite
  // de charger l'historique juste pour un booléen.
  supportRequests: {
    where: { handledAt: null },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.CompanySelect;

type CompanyRow = Prisma.CompanyGetPayload<{ select: typeof COMPANY_SELECT }>;

/**
 * Lecture admin des sociétés — **cross-tenant** : `company.findMany` / `findUnique`
 * direct, **sans** partir de l'utilisateur ni de ses `memberships`. C'est le bypass
 * assumé du mur `company_id` : l'accès est gardé par l'auth staff en amont.
 *
 * Tri par ancienneté décroissante — les comptes récents (souvent en attente
 * d'activation) remontent en tête, là où le commercial agit.
 */
@Injectable()
export class PrismaAdminCompanyReader extends AdminCompanyReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addresses: CompanyAddressReader,
  ) {
    super();
  }

  async listAll(): Promise<readonly AdminCompanyView[]> {
    const rows = await this.prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      select: COMPANY_SELECT,
    });
    return rows.map((row) => toView(row));
  }

  async byId(companyId: string): Promise<AdminCompanyDetailView | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: COMPANY_SELECT,
    });
    if (row === null) {
      return null;
    }
    // Les adresses passent par le reader dédié : la projection (créneaux
    // discriminés, défaut en tête, archivées exclues) n'est écrite qu'une fois.
    const addresses = await this.addresses.read(companyId);
    return {
      ...toView(row),
      vatNumberRequired: requiresVatNumber(row.formeJuridique),
      addresses,
    };
  }
}

/** Mappe une ligne société vers la vue admin de liste (champs propres). */
function toView(company: CompanyRow): AdminCompanyView {
  return {
    id: company.id,
    reference: company.reference,
    raisonSociale: company.raisonSociale,
    enseigne: company.enseigne,
    formeJuridique: company.formeJuridique,
    siret: company.siret,
    tvaIntracom: company.tvaIntracom,
    status: company.status,
    paymentTerm: company.paymentTerm,
    requestedPaymentTerm: company.requestedPaymentTerm,
    primaryContact: {
      id: null,
      firstName: company.contactPrenom,
      lastName: company.contactNom,
      fonction: company.contactFonction,
      email: company.contactEmail,
      phone: company.contactTelephone,
    },
    kbis:
      company.kbisFileName !== null && company.kbisUploadedAt !== null
        ? {
            fileName: company.kbisFileName,
            uploadedAt: company.kbisUploadedAt.toISOString(),
            certified: company.kbisCertifiedAt !== null,
          }
        : null,
    hasOpenSupportRequest: company.supportRequests.length > 0,
    createdAt: company.createdAt.toISOString(),
  };
}
