import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CustomerEmailReader } from "../domain/ports/customer-email.reader.js";

/** Lit l'adresse e-mail des personnes clientes sur leur fiche (`users`). */
@Injectable()
export class PrismaCustomerEmailReader extends CustomerEmailReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async emailsOf(userIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    // Un journal vide n'a personne à nommer : pas d'aller-retour pour `in: []`.
    if (userIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: { id: true, email: true },
    });
    // Une fiche provisionnée sans adresse (jeton sans claim) la porte vide :
    // absente de la table plutôt qu'une chaîne vide qui masquerait le repli.
    return new Map(rows.filter((row) => row.email !== "").map((row) => [row.id, row.email]));
  }
}
