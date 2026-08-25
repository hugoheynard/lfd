import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { CompanyAddressReader } from "../domain/ports/company-address.reader.js";
import {
  AdminCompanyReader,
  type AdminCompanyDetailView,
  type AdminCompanyView,
} from "../domain/ports/admin-company.reader.js";
import { companyWarnings } from "../domain/services/company-warnings.js";
import { requiresVatNumber } from "../domain/value-objects/vat-liability.js";
import { projectContacts } from "./company-contacts.projection.js";

/** Colonnes lues pour une vue admin — partagées par la liste et la fiche. */
const COMPANY_SELECT = {
  id: true,
  reference: true,
  raisonSociale: true,
  enseigne: true,
  formeJuridique: true,
  siret: true,
  vatNumber: true,
  status: true,
  grantedTerms: true,
  requestedTerm: true,
  kbisFileName: true,
  kbisUploadedAt: true,
  kbisCertifiedAt: true,
  kbisCertifiedBySub: true,
  kbisCertifiedByName: true,
  kbisCertifiedByRole: true,
  contactPrenom: true,
  contactNom: true,
  contactFonction: true,
  contactEmail: true,
  contactTelephone: true,
  createdAt: true,
  activatedAt: true,
  activatedBySub: true,
  activatedByName: true,
  activatedByRole: true,
  suspensionCause: true,
  // Préférence d'acheminement : lue sur la fiche seulement, mais si peu coûteuse
  // (trois colonnes, aucune jointure) qu'un second select ne se justifierait pas.
  preferredFulfillmentMethod: true,
  preferredPickupAddressId: true,
  preferredDeliveryAddressId: true,
  // Une seule demande ouverte suffit à lever le drapeau ; `take: 1` évite
  // de charger l'historique juste pour un booléen.
  supportRequests: {
    where: { handledAt: null },
    select: { id: true },
    take: 1,
  },
  // Le propriétaire de l'espace : la personne qui l'administre. `take: 1` — une
  // société n'en a qu'un en pratique, et la liste n'a pas à charger l'annuaire
  // complet des membres pour afficher un nom. Le plus ancien fait foi : c'est
  // celui qui a ouvert l'espace.
  memberships: {
    where: { role: "owner" },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { firstName: true, lastName: true, email: true } } },
    take: 1,
  },
  // Deux EXISTENCES pour la galerie d'avertissements — pas deux jointures
  // complètes : `take: 1` et un seul champ. La liste doit rester une liste.
  addresses: {
    where: { kind: "billing", archivedAt: null },
    select: { id: true },
    take: 1,
  },
  mandates: {
    where: { status: "active" },
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
    /** L'échéance d'une invitation se juge à l'instant de la requête. */
    private readonly clock: Clock,
  ) {
    super();
  }

  async listAll(): Promise<readonly AdminCompanyView[]> {
    const rows = await this.prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      select: COMPANY_SELECT,
    });
    const now = this.clock.now();
    return rows.map((row) => toView(row, now));
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
    // Les accès sont lus À PART puis rapprochés par l'adresse : un contact du
    // carnet n'a pas de lien de base vers un compte, et c'est l'e-mail qui les
    // relie — la même clé humaine que le commercial a sous les yeux.
    const [addresses, book, access] = await Promise.all([
      this.addresses.read(companyId),
      this.prisma.companyContact.findMany({
        where: { companyId },
        select: {
          id: true,
          prenom: true,
          nom: true,
          fonction: true,
          email: true,
          telephone: true,
          role: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.membership.findMany({
        where: { companyId },
        // `createdAt` du MEMBERSHIP : c'est la date du rattachement à CETTE
        // société, donc le compteur de l'invitation. Celle du compte serait
        // fausse — la personne a pu être invitée ailleurs il y a un an.
        select: {
          createdAt: true,
          user: { select: { email: true, status: true, emailVerified: true } },
        },
      }),
    ]);
    return {
      ...toView(row, this.clock.now()),
      vatNumberRequired: requiresVatNumber(row.formeJuridique),
      addresses,
      contacts: projectContacts(
        row,
        book,
        access.map((membership) => ({ ...membership.user, attachedAt: membership.createdAt })),
        this.clock.now(),
      ),
      activation:
        row.activatedAt === null
          ? null
          : {
              at: row.activatedAt.toISOString(),
              by:
                row.activatedBySub === null
                  ? null
                  : {
                      sub: row.activatedBySub,
                      name: row.activatedByName ?? "",
                      role: row.activatedByRole ?? "",
                    },
            },
      suspensionCause: row.suspensionCause,
      fulfillmentPreference: {
        method: row.preferredFulfillmentMethod,
        pickupAddressId: row.preferredPickupAddressId,
        deliveryAddressId: row.preferredDeliveryAddressId,
      },
    };
  }
}

/** Mappe une ligne société vers la vue admin de liste (champs propres). */
function toView(company: CompanyRow, now: Date): AdminCompanyView {
  return {
    id: company.id,
    reference: company.reference,
    raisonSociale: company.raisonSociale,
    enseigne: company.enseigne,
    formeJuridique: company.formeJuridique,
    siret: company.siret,
    vatNumber: company.vatNumber,
    status: company.status,
    grantedTerms: company.grantedTerms,
    requestedTerm: company.requestedTerm,
    primaryContact: {
      id: null,
      role: null,
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
            certifiedAt: company.kbisCertifiedAt?.toISOString() ?? null,
            // La trace n'existe que si la certification existe : un nom sans
            // date ne voudrait rien dire.
            certifiedBy:
              company.kbisCertifiedAt === null
                ? null
                : {
                    sub: company.kbisCertifiedBySub ?? "",
                    name: company.kbisCertifiedByName ?? "",
                    role: company.kbisCertifiedByRole ?? "",
                  },
          }
        : null,
    owner: company.memberships[0]?.user ?? null,
    hasOpenSupportRequest: company.supportRequests.length > 0,
    createdAt: company.createdAt.toISOString(),
    warnings: companyWarnings(
      {
        status: company.status,
        createdAt: company.createdAt,
        hasLegalIdentity:
          company.raisonSociale.trim() !== "" &&
          company.formeJuridique.trim() !== "" &&
          company.siret.trim() !== "",
        hasHolder: company.contactEmail.trim() !== "",
        hasBillingAddress: company.addresses.length > 0,
        hasGrantedTerms: company.grantedTerms.length > 0,
        hasActiveMandate: company.mandates.length > 0,
        kbisUploadedAt: company.kbisUploadedAt,
        kbisCertifiedAt: company.kbisCertifiedAt,
      },
      now,
    ),
  };
}
