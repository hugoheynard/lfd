import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  PendingStaffAccessReader,
  type PendingStaffAccessView,
  type PendingStaffSubject,
} from "./pending-staff-access.reader.js";

/** Les invités, du plus ancien au plus récent — l'attente la plus longue d'abord. */
@Injectable()
export class PrismaPendingStaffAccessReader extends PendingStaffAccessReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly PendingStaffAccessView[]> {
    // `auth0Id` non nul : sans identité chez le fournisseur, il n'y a aucun
    // lien à fabriquer. Une ligne qu'on ne peut pas servir n'a rien à faire
    // dans une file d'attente.
    const rows = await this.prisma.staffUser.findMany({
      where: { status: "invited", auth0Id: { not: null }, invitedAt: { not: null } },
      orderBy: { invitedAt: "asc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        invitedAt: true,
      },
    });

    return rows.flatMap((row) =>
      row.invitedAt === null
        ? []
        : [
            {
              staffUserId: row.id,
              email: row.email,
              firstName: row.firstName,
              lastName: row.lastName,
              jobTitle: row.jobTitle,
              invitedAt: row.invitedAt.toISOString(),
            },
          ],
    );
  }

  async pendingOf(staffUserId: string): Promise<PendingStaffSubject | null> {
    // Statut relu ici : entre l'affichage et le clic, la personne a pu entrer.
    // Lui fabriquer un lien reviendrait alors à offrir de quoi réinitialiser
    // son mot de passe sans qu'elle ait rien demandé.
    const row = await this.prisma.staffUser.findFirst({
      where: { id: staffUserId, status: "invited" },
      select: { auth0Id: true, firstName: true, lastName: true },
    });
    if (row === null || row.auth0Id === null) {
      return null;
    }
    return { subject: row.auth0Id, firstName: row.firstName, lastName: row.lastName };
  }
}
