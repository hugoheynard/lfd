import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderingChorusServiceReader,
  type OrderingChorusService,
} from "../../orders/domain/ports/ordering-chorus-service.reader.js";
import { dayOfColumn } from "./chorus-service.columns.js";

/**
 * La fiche du service Chorus d'une société qui commande, lue là où le compte
 * la range (`company_chorus_service`). Le numéro et la date de fin vont
 * ensemble (CHECK `company_chorus_service_commitment_has_end`).
 */
@Injectable()
export class PrismaOrderingChorusServiceReader extends OrderingChorusServiceReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(companyId: string): Promise<OrderingChorusService | null> {
    const row = await this.prisma.companyChorusService.findUnique({
      where: { companyId },
      select: {
        payerCompanyId: true,
        serviceCode: true,
        commitmentNumber: true,
        commitmentEndsOn: true,
      },
    });
    if (row === null) {
      return null;
    }
    const endsOn = dayOfColumn(row.commitmentEndsOn);
    return {
      payerCompanyId: row.payerCompanyId,
      serviceCode: row.serviceCode,
      currentCommitment:
        row.commitmentNumber === "" || endsOn === null
          ? null
          : { number: row.commitmentNumber, endsOn },
    };
  }
}
