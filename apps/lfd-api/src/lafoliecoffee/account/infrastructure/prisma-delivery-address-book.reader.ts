import type { DeliveryAddressBookRow } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DeliveryAddressBookReader } from "../../../delivery/channels/commerce/index.js";
import { AddressKind } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { deliveryAddressBookRowOf } from "./delivery-address-book-row.mapper.js";

const ADDRESS_SELECT = {
  id: true,
  companyId: true,
  label: true,
  ligne1: true,
  ligne2: true,
  codePostal: true,
  ville: true,
  pays: true,
  isDefault: true,
  deliverySpecs: true,
  depositAllowed: true,
  doorstepRule: true,
  parkingLat: true,
  parkingLng: true,
  company: { select: { raisonSociale: true, enseigne: true, deliverySignatureRequired: true } },
  deliveryProcedure: { select: { id: true } },
} as const;

/**
 * **Le carnet des adresses de livraison, entier** — l'adaptateur de
 * `DeliveryAddressBookReader`, chez le propriétaire du carnet.
 *
 * Une lecture staff, toutes sociétés : il n'y a pas de mur tenant à poser,
 * mais les adresses archivées et les sociétés supprimées (`archivedAt`) sont
 * écartées dans la requête, et seules les adresses de LIVRAISON sortent. Le tri
 * (client, puis libellé) est fait par la base.
 */
@Injectable()
export class PrismaDeliveryAddressBookReader extends DeliveryAddressBookReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async deliveryAddresses(): Promise<readonly DeliveryAddressBookRow[]> {
    const rows = await this.prisma.address.findMany({
      where: { kind: AddressKind.delivery, archivedAt: null, company: { archivedAt: null } },
      orderBy: [{ company: { raisonSociale: "asc" } }, { label: "asc" }, { id: "asc" }],
      select: ADDRESS_SELECT,
    });
    return rows.map((row) =>
      deliveryAddressBookRowOf({
        ...row,
        tradeName: row.company.enseigne.trim(),
        legalName: row.company.raisonSociale,
        hasProcedure: row.deliveryProcedure !== null,
        companySignatureRequired: row.company.deliverySignatureRequired,
      }),
    );
  }
}
