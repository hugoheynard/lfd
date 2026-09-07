import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderRecipientReader,
  type OrderRecipient,
} from "../domain/ports/order-recipient.reader.js";

/** L'adresse d'un client, lue dans l'annuaire de la plateforme. */
@Injectable()
export class PrismaOrderRecipientReader extends OrderRecipientReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(userId: string): Promise<OrderRecipient | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    // Une adresse vide n'est pas une adresse : la traiter comme telle ferait
    // partir un envoi voué au refus, et compterait comme un e-mail « envoyé ».
    if (row === null || row.email.trim() === "") {
      return null;
    }
    return { email: row.email, firstName: row.firstName };
  }
}
