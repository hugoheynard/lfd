import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { readCompanyStanding } from "../../shared/company-standing/infrastructure/read-company-standing.js";
import {
  CancellingMemberReader,
  type CancellingStanding,
} from "../domain/ports/cancelling-member.reader.js";

const ACTIVE = "active";

/**
 * Le mur pro de l'annulation par le client (C6.2, B2 ; lot C1 des
 * sous-comptes, §7.2) sur la requête partagée (S6, R1) : la société de la
 * commande `active`, puis le rattachement propre ACCEPTÉ, sinon l'héritage du
 * principal. La personne est celle du `Principal` — jamais un id reçu du corps.
 */
@Injectable()
export class PrismaCancellingMemberReader extends CancellingMemberReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async standingOn(userId: string, companyId: string): Promise<CancellingStanding | null> {
    const standing = await readCompanyStanding(this.prisma, this.clock.now(), userId, companyId);
    if (standing?.companyStatus !== ACTIVE) {
      return null;
    }
    if (standing.own !== null && standing.ownAccepted) {
      return { via: "own" };
    }
    const principal = standing.via;
    if (principal === null) {
      return null;
    }
    return {
      via: "principal",
      principal: { companyId: principal.companyId, name: principal.name },
    };
  }
}
