import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LegalEntityLogoReader } from "../domain/ports/legal-entity-logo.reader.js";

/**
 * Adaptateur Prisma du port le plus étroit du contexte.
 *
 * `select` explicite plutôt que la ligne entière, et ce n'est pas une
 * optimisation : cette classe sert des chemins de LECTURE de fichier, et ne rien
 * ramener d'autre que la clé rend inexprimable qu'un IBAN créancier se retrouve
 * en mémoire sur le trajet d'un logo.
 */
@Injectable()
export class PrismaLegalEntityLogoReader extends LegalEntityLogoReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async logoKeyOf(legalEntityId: string): Promise<string | null> {
    const row = await this.prisma.legalEntity.findUnique({
      where: { id: legalEntityId },
      select: { logoKey: true },
    });
    return row?.logoKey ?? null;
  }
}
