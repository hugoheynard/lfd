import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  CustomerAccessOverviewReader,
  type CustomerAccessRowView,
} from "../domain/ports/customer-access-overview.reader.js";
import { toCustomerAccessRow } from "./customer-access-row.projection.js";

/**
 * Toutes les sociétés, **cross-tenant** comme la liste des comptes clients :
 * l'auth staff garde la route en amont, il n'y a pas de mur client ici.
 *
 * Une requête, une passe : le rapprochement détenteur ↔ rattachement se fait
 * en mémoire, sur l'adresse, par la même projection que la fiche.
 */
@Injectable()
export class PrismaCustomerAccessOverviewReader extends CustomerAccessOverviewReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async list(): Promise<readonly CustomerAccessRowView[]> {
    const rows = await this.prisma.company.findMany({
      orderBy: { raisonSociale: "asc" },
      select: {
        id: true,
        enseigne: true,
        raisonSociale: true,
        contactPrenom: true,
        contactNom: true,
        contactEmail: true,
        contactTelephone: true,
        parentCompany: { select: { id: true, enseigne: true, raisonSociale: true } },
        memberships: {
          select: {
            invitedAt: true,
            acceptedAt: true,
            user: {
              select: { email: true, status: true, emailVerified: true, firstLoginAt: true },
            },
          },
        },
      },
    });
    const now = this.clock.now();
    return rows.map((row) => toCustomerAccessRow(row, now));
  }
}
