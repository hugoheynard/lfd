import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ChorusRoutingRepository } from "../domain/ports/chorus-routing.repository.js";
import { ChorusRouting } from "../domain/value-objects/chorus-routing.js";

/** Le jour d'une colonne `DATE`, posé à minuit UTC. */
function dayColumn(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Écrit et relit `company_chorus_routing` — une ligne par société. */
@Injectable()
export class PrismaChorusRoutingRepository extends ChorusRoutingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(companyId: string): Promise<ChorusRouting | null> {
    const row = await this.prisma.companyChorusRouting.findUnique({ where: { companyId } });
    if (row === null) {
      return null;
    }
    return ChorusRouting.reconstitute(
      {
        commitmentRequired: row.commitmentRequired,
        serviceCodeRequired: row.serviceCodeRequired,
        defaultServiceCode: row.defaultServiceCode,
        checkedOn: row.checkedOn.toISOString().slice(0, 10),
      },
      { staffUserId: row.checkedByStaffId, name: row.checkedByName, role: row.checkedByRole },
    );
  }

  async save(companyId: string, routing: ChorusRouting): Promise<void> {
    const columns = {
      commitmentRequired: routing.commitmentRequired,
      serviceCodeRequired: routing.serviceCodeRequired,
      defaultServiceCode: routing.defaultServiceCode,
      checkedOn: dayColumn(routing.checkedOn),
      checkedByStaffId: routing.checkedBy.staffUserId,
      checkedByName: routing.checkedBy.name,
      checkedByRole: routing.checkedBy.role,
    };
    await this.prisma.companyChorusRouting.upsert({
      where: { companyId },
      create: { companyId, ...columns },
      update: columns,
    });
  }
}
