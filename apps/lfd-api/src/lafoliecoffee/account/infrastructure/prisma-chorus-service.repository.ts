import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ChorusServiceRepository } from "../domain/ports/chorus-service.repository.js";
import { ChorusService } from "../domain/value-objects/chorus-service.js";
import { dayOfColumn, dayColumn } from "./chorus-service.columns.js";

/** Écrit et relit `company_chorus_service` — une ligne par société. */
@Injectable()
export class PrismaChorusServiceRepository extends ChorusServiceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(companyId: string): Promise<ChorusService | null> {
    const row = await this.prisma.companyChorusService.findUnique({ where: { companyId } });
    if (row === null) {
      return null;
    }
    return ChorusService.reconstitute(
      row.payerCompanyId,
      {
        serviceCode: row.serviceCode,
        commitmentNumber: row.commitmentNumber,
        commitmentEndsOn: dayOfColumn(row.commitmentEndsOn),
      },
      row.recordedAt,
      { staffUserId: row.recordedByStaffId, name: row.recordedByName, role: row.recordedByRole },
    );
  }

  async save(companyId: string, service: ChorusService): Promise<void> {
    const commitment = service.currentCommitment;
    const columns = {
      payerCompanyId: service.payerCompanyId,
      serviceCode: service.serviceCode,
      commitmentNumber: commitment?.number ?? "",
      commitmentEndsOn: commitment === null ? null : dayColumn(commitment.endsOn),
      recordedAt: service.recordedAt,
      recordedByStaffId: service.recordedBy.staffUserId,
      recordedByName: service.recordedBy.name,
      recordedByRole: service.recordedBy.role,
    };
    await this.prisma.companyChorusService.upsert({
      where: { companyId },
      create: { companyId, ...columns },
      update: columns,
    });
  }
}
