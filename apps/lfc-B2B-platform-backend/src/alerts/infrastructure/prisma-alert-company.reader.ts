import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { AlertCompanyReader } from "../domain/ports/company.reader.js";

/** Existence seule — `select: { id }` : on ne charge pas un dossier pour un booléen. */
@Injectable()
export class PrismaAlertCompanyReader extends AlertCompanyReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async exists(companyId: string): Promise<boolean> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    return row !== null;
  }
}
