import { Injectable } from "@nestjs/common";

import { AddressKind } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import { DeliveryAddressReader } from "../domain/ports/delivery-address.reader.js";

/** Adaptateur Prisma : le code postal d'une adresse de livraison de l'entreprise. */
@Injectable()
export class PrismaDeliveryAddressReader extends DeliveryAddressReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async postalCodeOf(companyId: string, addressId: string): Promise<string | null> {
    const address = await this.prisma.address.findFirst({
      where: {
        id: addressId,
        companyId,
        kind: AddressKind.livraison,
        archivedAt: null,
      },
      select: { codePostal: true },
    });
    return address?.codePostal ?? null;
  }
}
