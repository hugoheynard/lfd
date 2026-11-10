import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  AdminOrderAuthorReader,
  type AdminOrderAuthor,
} from "../domain/ports/admin-order-author.reader.js";

/**
 * Une lecture, deux jointures du même contexte : la personne (`placedBy`, le
 * `User` du commerce) et la société. Les colonnes vides (`phone`, `enseigne`
 * valent `""` par défaut) deviennent `null` : l'écran n'a pas à savoir qu'une
 * chaîne vide veut dire « rien ».
 */
@Injectable()
export class PrismaAdminOrderAuthorReader extends AdminOrderAuthorReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async authorOf(orderId: string): Promise<AdminOrderAuthor | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        placedByStaffId: true,
        placedBy: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        company: { select: { id: true, raisonSociale: true, enseigne: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      placedByStaffId: row.placedByStaffId,
      customer: {
        userId: row.placedBy.id,
        firstName: row.placedBy.firstName,
        lastName: row.placedBy.lastName,
        email: row.placedBy.email,
        phone: blankToNull(row.placedBy.phone),
      },
      company:
        row.company === null
          ? null
          : {
              id: row.company.id,
              raisonSociale: row.company.raisonSociale,
              enseigne: blankToNull(row.company.enseigne),
            },
    };
  }
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
