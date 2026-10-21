import { companyDisplayName } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { effectiveRole } from "../../account/domain/services/effective-role.js";
import {
  CancellingMemberReader,
  type CancellingStanding,
} from "../domain/ports/cancelling-member.reader.js";

const ACTIVE = "active";

/**
 * Le mur pro de l'annulation par le client (C6.2, B2 ; lot C1 des
 * sous-comptes, §7.2) en UNE lecture : la société de la commande, le
 * rattachement ACCEPTÉ de la personne, et le principal ACTUEL avec le sien.
 * Le `where` porte la société de la commande et la personne du `Principal` —
 * jamais un id reçu du corps.
 */
@Injectable()
export class PrismaCancellingMemberReader extends CancellingMemberReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async standingOn(userId: string, companyId: string): Promise<CancellingStanding | null> {
    const accepted = { where: { userId, acceptedAt: { not: null } }, select: { role: true } };
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        status: true,
        memberships: accepted,
        parentCompany: {
          select: {
            id: true,
            status: true,
            enseigne: true,
            raisonSociale: true,
            memberships: accepted,
          },
        },
      },
    });
    if (company?.status !== ACTIVE) {
      return null;
    }
    const own = company.memberships[0]?.role ?? null;
    if (own !== null) {
      return { via: "own" };
    }
    const parent = company.parentCompany;
    if (parent === null || parent.status !== ACTIVE) {
      return null;
    }
    const inherited = effectiveRole(null, parent.memberships[0]?.role ?? null);
    if (inherited === null) {
      return null;
    }
    return {
      via: "principal",
      principal: { companyId: parent.id, name: companyDisplayName(parent) },
    };
  }
}
