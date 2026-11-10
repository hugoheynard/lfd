import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { readServedCompany } from "../../shared/company-standing/infrastructure/read-reservation-holders.js";
import { ServedCompanyReader, type ServedCompany } from "../domain/ports/served-company.reader.js";

/** La requête partagée, derrière le port de la fabrique du lecteur. */
@Injectable()
export class PrismaServedCompanyReader extends ServedCompanyReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  servedOf(companyId: string): Promise<ServedCompany | null> {
    return readServedCompany(this.prisma, companyId);
  }
}
