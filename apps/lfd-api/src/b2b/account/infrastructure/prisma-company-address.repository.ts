import type { BillingAddressPayload, DeliveryAddressPayload } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AddressKind } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyAddressNotFoundError } from "../domain/errors/account-errors.js";
import { CompanyAddressRepository } from "../domain/ports/company-address.repository.js";

/** Colonnes postales communes, extraites d'une charge validée. */
function postal(payload: BillingAddressPayload): {
  label: string;
  ligne1: string;
  ligne2: string;
  codePostal: string;
  ville: string;
  pays: string;
} {
  return {
    label: payload.label,
    ligne1: payload.ligne1,
    ligne2: payload.ligne2,
    codePostal: payload.codePostal,
    ville: payload.ville,
    pays: payload.pays,
  };
}

/**
 * Adaptateur Prisma des adresses. Le mur (appartenance + rôle) est vérifié en
 * amont par les handlers ; ici, chaque écriture reste tout de même filtrée sur
 * `companyId` (défense en profondeur) et les invariants de défaut sont tenus dans
 * une transaction — « au plus une livraison par défaut », « exactement une
 * facturation ».
 */
@Injectable()
export class PrismaCompanyAddressRepository extends CompanyAddressRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async saveBilling(companyId: string, payload: BillingAddressPayload): Promise<void> {
    // Une seule facturation par entreprise : on met à jour celle qui existe, on la
    // crée sinon. Pas d'`isDefault` sur une facturation (notion propre à la livraison).
    const existing = await this.prisma.address.findFirst({
      where: { companyId, kind: AddressKind.facturation, archivedAt: null },
      select: { id: true },
    });
    if (existing !== null) {
      await this.prisma.address.update({ where: { id: existing.id }, data: postal(payload) });
      return;
    }
    await this.prisma.address.create({
      data: { companyId, kind: AddressKind.facturation, isDefault: false, ...postal(payload) },
    });
  }

  async addDelivery(companyId: string, payload: DeliveryAddressPayload): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({
        where: { companyId, kind: AddressKind.livraison, archivedAt: null },
      });
      // Devient le défaut si elle le demande, ou si c'est la première livraison.
      const makeDefault = payload.isDefault || count === 0;
      if (makeDefault) {
        await tx.address.updateMany({
          where: { companyId, kind: AddressKind.livraison, archivedAt: null },
          data: { isDefault: false },
        });
      }
      const created = await tx.address.create({
        data: {
          companyId,
          kind: AddressKind.livraison,
          isDefault: makeDefault,
          ...postal(payload),
          deliverySpecs: payload.specs,
        },
        select: { id: true },
      });
      return created.id;
    });
  }

  async updateDelivery(
    companyId: string,
    addressId: string,
    payload: DeliveryAddressPayload,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Le mur DANS le `where` (id ET companyId) : une adresse d'une autre
      // entreprise est traitée comme absente. On ne promeut le défaut que si
      // la charge le demande — un update ne rétrograde jamais le défaut.
      const { count } = await tx.address.updateMany({
        where: { id: addressId, companyId, kind: AddressKind.livraison, archivedAt: null },
        data: {
          ...postal(payload),
          deliverySpecs: payload.specs,
          ...(payload.isDefault ? { isDefault: true } : {}),
        },
      });
      if (count === 0) {
        throw new CompanyAddressNotFoundError(addressId);
      }
      if (payload.isDefault) {
        await tx.address.updateMany({
          where: {
            companyId,
            kind: AddressKind.livraison,
            archivedAt: null,
            id: { not: addressId },
          },
          data: { isDefault: false },
        });
      }
    });
  }

  async archiveDelivery(companyId: string, addressId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.address.findFirst({
        where: { id: addressId, companyId, kind: AddressKind.livraison, archivedAt: null },
        select: { isDefault: true },
      });
      if (target === null) {
        throw new CompanyAddressNotFoundError(addressId);
      }
      await tx.address.update({
        where: { id: addressId },
        data: { archivedAt: new Date(), isDefault: false },
      });
      // Une liste non vide garde toujours un défaut : on promeut la plus ancienne.
      if (target.isDefault) {
        const next = await tx.address.findFirst({
          where: { companyId, kind: AddressKind.livraison, archivedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (next !== null) {
          await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
    });
  }

  async setDefaultDelivery(companyId: string, addressId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.address.findFirst({
        where: { id: addressId, companyId, kind: AddressKind.livraison, archivedAt: null },
        select: { id: true },
      });
      if (target === null) {
        throw new CompanyAddressNotFoundError(addressId);
      }
      await tx.address.updateMany({
        where: { companyId, kind: AddressKind.livraison, archivedAt: null },
        data: { isDefault: false },
      });
      await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    });
  }
}
