import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  CustomerAccessOverviewReader,
  type CustomerAccessRowView,
} from "../domain/ports/customer-access-overview.reader.js";
import { toCustomerAccessRow } from "./customer-access-row.projection.js";

/** Le contact aplati et les rattachements : de quoi désigner un détenteur et lire son accès. */
const HOLDER_SELECT = {
  contactPrenom: true,
  contactNom: true,
  contactEmail: true,
  contactTelephone: true,
  memberships: {
    select: {
      invitedAt: true,
      acceptedAt: true,
      user: {
        select: { email: true, status: true, emailVerified: true, firstLoginAt: true },
      },
    },
  },
} as const;

/**
 * Toutes les sociétés, **cross-tenant** comme la liste des comptes clients :
 * l'auth staff garde la route en amont, il n'y a pas de mur client ici.
 *
 * Une requête, une passe : le rapprochement détenteur ↔ rattachement se fait
 * en mémoire, sur l'adresse, par la même projection que la fiche. Le principal
 * vient avec ses rattachements : un site peut montrer son détenteur.
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
        parentCompany: {
          select: {
            id: true,
            enseigne: true,
            raisonSociale: true,
            ...HOLDER_SELECT,
          },
        },
        follows: { where: { aspect: "contacts", validTo: null }, select: { parentId: true } },
        ...HOLDER_SELECT,
      },
    });
    const now = this.clock.now();
    return rows.map(({ follows, ...row }) =>
      toCustomerAccessRow(
        { ...row, contactsFollowedFrom: follows.map((follow) => follow.parentId) },
        now,
      ),
    );
  }
}
