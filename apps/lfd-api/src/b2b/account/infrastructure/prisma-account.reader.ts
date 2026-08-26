import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  AccountReader,
  type AccountView,
  type CompanyView,
  type ContactView,
} from "../domain/ports/account.reader.js";
import type { CustomerRole } from "../../../platform/database/client/client.js";
import { parseNavPreferences } from "../domain/value-objects/nav-preferences.js";
import { requiresVatNumber } from "../domain/value-objects/vat-liability.js";

/** Une ligne de contact additionnel telle que Prisma la sélectionne. */
interface ContactRow {
  readonly id: string;
  readonly prenom: string;
  readonly nom: string;
  readonly fonction: string;
  readonly email: string;
  readonly telephone: string;
  readonly role: CustomerRole | null;
}

/**
 * Lecture du compte en **une** requête : la personne, ses rattachements, et la
 * société de chacun.
 *
 * Les onglets de « Mes entreprises » sont ordonnés par ancienneté du
 * rattachement — un ordre stable, donc des onglets qui ne sautent pas d'un
 * chargement à l'autre. Un tri sur la raison sociale ferait bouger le premier
 * onglet à chaque société ajoutée.
 */
@Injectable()
export class PrismaAccountReader extends AccountReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(userId: string): Promise<AccountView | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        auth0Sub: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        navPrefs: true,
        memberships: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            company: {
              select: {
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
              },
            },
          },
        },
      },
    });
    if (row === null) {
      return null;
    }

    const companies: CompanyView[] = row.memberships.map(({ role, company }) => ({
      id: company.id,
      reference: company.reference,
      raisonSociale: company.raisonSociale,
      enseigne: company.enseigne,
      formeJuridique: company.formeJuridique,
      siret: company.siret,
      vatNumber: company.vatNumber,
      vatNumberRequired: requiresVatNumber(company.formeJuridique),
      status: company.status,
      grantedTerms: company.grantedTerms,
      requestedTerm: company.requestedTerm,
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
    }));

    return {
      profile: {
        userId: row.id,
        subject: row.auth0Sub,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
      },
      companies,
      navPrefs: parseNavPreferences(row.navPrefs),
    };
  }
}

/** Une ligne de contact additionnel → la vue (renommage prenom→firstName, etc.). */
function toContactView(row: ContactRow): ContactView {
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
