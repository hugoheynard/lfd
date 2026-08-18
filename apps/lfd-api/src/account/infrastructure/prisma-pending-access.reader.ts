import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  PendingAccessReader,
  type PendingAccessView,
} from "../domain/ports/pending-access.reader.js";

/**
 * La file lue directement sur le statut des personnes — **cross-tenant**, comme
 * le reste de la surface staff : l'auth staff garde la route en amont.
 *
 * Le tri met les plus anciennes en tête : une attente de trois semaines passe
 * avant celle d'hier, et c'est l'ordre dans lequel on rattrape un canal muet.
 */
@Injectable()
export class PrismaPendingAccessReader extends PendingAccessReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly PendingAccessView[]> {
    // `invited` = l'identité existe, le mot de passe n'a jamais été posé. On
    // exige au moins un rattachement : une personne sans société n'a pas
    // d'espace où entrer, et remettre son lien n'ouvrirait rien.
    const rows = await this.prisma.user.findMany({
      where: { status: "invited", memberships: { some: {} } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        memberships: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            company: { select: { id: true, enseigne: true, raisonSociale: true } },
          },
        },
      },
    });

    return rows.flatMap((row) => {
      const company = row.memberships[0]?.company;
      if (company === undefined) {
        return [];
      }
      return [
        {
          userId: row.id,
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          companyId: company.id,
          // Le nom d'USAGE : celui sous lequel le commercial reconnaît la
          // société au téléphone, comme partout ailleurs.
          companyName: company.enseigne.trim() === "" ? company.raisonSociale : company.enseigne,
          invitedAt: row.createdAt.toISOString(),
        },
      ];
    });
  }

  async subjectOf(userId: string): Promise<string | null> {
    // Le statut est **relu ici**, et ce n'est pas une redondance : entre
    // l'affichage de la file et le clic, la personne a pu poser son mot de
    // passe. Fabriquer un lien pour un compte déjà actif serait fabriquer de
    // quoi le réinitialiser sans que personne l'ait demandé.
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: "invited" },
      select: { auth0Sub: true },
    });
    return user?.auth0Sub ?? null;
  }
}
