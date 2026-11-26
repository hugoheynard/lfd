import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  InHouseDeclarationReader,
  type InHouseDeclarationState,
} from "../domain/ports/in-house-declaration.reader.js";

/** La société et son marquage, en une requête. */
@Injectable()
export class PrismaInHouseDeclarationReader extends InHouseDeclarationReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async stateOf(companyId: string): Promise<InHouseDeclarationState | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        inHouse: { where: { withdrawnAt: null }, select: { declaredAt: true }, take: 1 },
      },
    });
    return company === null ? null : { declaredAt: company.inHouse[0]?.declaredAt ?? null };
  }
}
