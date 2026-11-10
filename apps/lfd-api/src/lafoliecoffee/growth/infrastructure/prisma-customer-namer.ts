import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CustomerNamer } from "../domain/ports/customer-namer.js";

/**
 * Lit le prénom et le nom d'une personne cliente, pour les figer dans un fait
 * du journal. Jamais l'adresse : un libellé de sujet n'est pas une coordonnée
 * (voir le port).
 */
@Injectable()
export class PrismaCustomerNamer extends CustomerNamer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async nameOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    if (user === null) {
      return null;
    }
    const name = `${user.firstName} ${user.lastName}`.trim();
    return name === "" ? null : name;
  }
}
