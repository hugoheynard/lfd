import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BasketBuyerContacts } from "../../../recurring/channels/commerce/index.js";

/**
 * **L'adresse de l'acheteur d'un panier récurrent** — le port que les paniers
 * déclarent, implémenté par les comptes, qui tiennent l'annuaire des clients.
 */
@Injectable()
export class AccountBasketBuyerContacts extends BasketBuyerContacts {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async emailOf(userId: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    // Une adresse vide n'est pas une adresse : l'envoi serait voué au refus.
    return row === null || row.email.trim() === "" ? null : row.email;
  }
}
