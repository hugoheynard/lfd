import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  AccountReader,
  type AccountView,
  type CompanyView,
  type ContactView,
} from "../domain/ports/account.reader.js";
import { requiresVatNumber } from "../domain/value-objects/vat-liability.js";

/** Une ligne de contact additionnel telle que Prisma la sélectionne. */
interface ContactRow {
  readonly id: string;
  readonly prenom: string;
  readonly nom: string;
  readonly fonction: string;
  readonly email: string;
  readonly telephone: string;
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
                tvaIntracom: true,
                status: true,
                paymentTerm: true,
                kbisFileName: true,
                kbisUploadedAt: true,
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
      tvaIntracom: company.tvaIntracom,
      vatNumberRequired: requiresVatNumber(company.formeJuridique),
      status: company.status,
      paymentTerm: company.paymentTerm,
      role,
      primaryContact: {
        id: null,
        firstName: company.contactPrenom,
        lastName: company.contactNom,
        fonction: company.contactFonction,
        email: company.contactEmail,
        phone: company.contactTelephone,
      },
      contacts: company.contacts.map(toContactView),
      // KBIS présent seulement si un fichier a été déposé ; certifié = validé.
      kbis:
        company.kbisFileName !== null && company.kbisUploadedAt !== null
          ? {
              fileName: company.kbisFileName,
              uploadedAt: company.kbisUploadedAt.toISOString(),
              certified: company.status === "active",
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
  };
}
