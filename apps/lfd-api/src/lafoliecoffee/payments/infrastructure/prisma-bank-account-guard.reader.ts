import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { readCompanyStanding } from "../../shared/company-standing/infrastructure/read-company-standing.js";
import {
  BankAccountGuardReader,
  type BankAccountRole,
} from "../domain/ports/bank-account-guard.reader.js";

/**
 * Adaptateur Prisma du mur des GESTES sur le RIB et le mandat : la membership
 * PROPRE seulement — la lecture a son propre port (`BankAccountReadingGuard`, Q1).
 *
 * 🔴 Jusqu'au 2026-10-27 il lisait le rôle effectif (S6, R2), où l'héritier
 * vaut `admin` plafonné, et l'`admin` était refusé. Hugo a ouvert le RIB et le
 * mandat à l'`admin` ce jour-là : lire encore le rôle effectif aurait donné au
 * responsable d'un principal la main sur le compte prélevé de chacun de ses
 * sites. L'héritage n'ouvrait aucun geste avant ; il n'en ouvre toujours aucun.
 */
@Injectable()
export class PrismaBankAccountGuardReader extends BankAccountGuardReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<BankAccountRole | null> {
    const standing = await readCompanyStanding(this.prisma, this.clock.now(), userId, companyId);
    if (standing === null) {
      return null;
    }
    if (standing.own !== null) {
      return standing.own;
    }
    return standing.via === null ? null : "inherited";
  }
}
