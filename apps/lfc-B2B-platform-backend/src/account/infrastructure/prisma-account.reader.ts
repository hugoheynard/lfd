import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  AccountReader,
  type AccountView,
  type CompanyView,
} from "../domain/ports/account.reader.js";

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
                raisonSociale: true,
                enseigne: true,
                formeJuridique: true,
                siret: true,
                tvaIntracom: true,
                status: true,
              },
            },
          },
        },
      },
    });
    if (row === null) {
      return null;
    }

    const companies: CompanyView[] = row.memberships.map((membership) => ({
      ...membership.company,
      role: membership.role,
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
