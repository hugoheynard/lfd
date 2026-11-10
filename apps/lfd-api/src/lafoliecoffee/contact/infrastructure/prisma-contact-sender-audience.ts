import { audienceOf, type CustomerAudience } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ContactSenderAudience } from "../domain/ports/contact-sender-audience.js";

/**
 * Adaptateur Prisma : lit le statut de la société agissante. Une société
 * inconnue vaut `null`, donc `b2c` — on ne fabrique pas de pro.
 */
@Injectable()
export class PrismaContactSenderAudience extends ContactSenderAudience {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(companyId: string | null): Promise<CustomerAudience> {
    if (companyId === null) {
      return audienceOf(null);
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { status: true },
    });
    return audienceOf(company?.status ?? null);
  }
}
