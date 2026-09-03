import type { BillingAddressPayload, DeliverySpecs } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AddressKind } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  DeliveryAddressBook,
  type DeliveryAddress,
} from "../domain/entities/delivery-address-book.js";
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

/** Ce que la base rend d'une adresse de livraison, avant rehydratation. */
interface DeliveryRow {
  readonly id: string;
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  readonly deliverySpecs: unknown;
  readonly isDefault: boolean;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
}

/** Consignes vides — une livraison saisie avant que les consignes existent. */
const NO_SPECS: DeliverySpecs = {
  note: "",
  slots: { mode: "everyday", slot: null },
  deliveryContact: null,
  gps: null,
  signatureRequired: null,
};

/** Ligne → entrée du carnet. Les consignes sont du JSON libre côté base. */
function toDomain(row: DeliveryRow): DeliveryAddress {
  return {
    id: row.id,
    lines: {
      label: row.label,
      ligne1: row.ligne1,
      ligne2: row.ligne2,
      codePostal: row.codePostal,
      ville: row.ville,
      pays: row.pays,
    },
    specs: isSpecs(row.deliverySpecs) ? row.deliverySpecs : NO_SPECS,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
  };
}

/**
 * La colonne `delivery_specs` est un `jsonb` : elle peut être `null` (livraison
 * d'avant les consignes) et rien en base ne garantit sa forme. On la reconnaît
 * plutôt que de l'affirmer — un `as` ici ferait entrer une valeur non vérifiée
 * dans le domaine sous couvert de typage.
 */
function isSpecs(value: unknown): value is DeliverySpecs {
  return typeof value === "object" && value !== null && "slots" in value;
}

/**
 * Adaptateur Prisma des adresses.
 *
 * Le mur (appartenance + rôle) est vérifié en amont par les handlers ; ici,
 * chaque écriture reste filtrée sur `companyId` — défense en profondeur.
 *
 * Ce que cet adaptateur **ne fait plus** : arbitrer le défaut. Il ne démote plus
 * les autres lignes, ne promeut plus la plus ancienne à l'archivage, ne décide
 * plus qu'une première adresse devient le défaut. Ces quatre règles vivaient ici,
 * en SQL, éclatées sur quatre méthodes ; elles sont dans `DeliveryAddressBook`.
 * Il ne reste qu'une traduction : `is_default` vaut vrai pour l'unique
 * `defaultId` du carnet, faux partout ailleurs.
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
      where: { companyId, kind: AddressKind.billing, archivedAt: null },
      select: { id: true },
    });
    if (existing !== null) {
      await this.prisma.address.update({ where: { id: existing.id }, data: postal(payload) });
      return;
    }
    await this.prisma.address.create({
      data: { companyId, kind: AddressKind.billing, isDefault: false, ...postal(payload) },
    });
  }

  async loadDeliveryBook(companyId: string): Promise<DeliveryAddressBook> {
    const rows = await this.prisma.address.findMany({
      where: { companyId, kind: AddressKind.delivery },
      select: {
        id: true,
        label: true,
        ligne1: true,
        ligne2: true,
        codePostal: true,
        ville: true,
        pays: true,
        deliverySpecs: true,
        isDefault: true,
        archivedAt: true,
        createdAt: true,
      },
    });
    const current = rows.find((row) => row.isDefault && row.archivedAt === null);
    return DeliveryAddressBook.reconstitute({
      companyId,
      entries: rows.map(toDomain),
      defaultId: current?.id ?? null,
    });
  }

  async saveDeliveryBook(book: DeliveryAddressBook): Promise<void> {
    const state = book.toPersistence();
    await this.prisma.$transaction(async (tx) => {
      for (const entry of state.entries) {
        const columns = {
          ...entry.lines,
          deliverySpecs: entry.specs,
          // L'unique source du défaut : le carnet, jamais la ligne.
          isDefault: entry.id === state.defaultId,
          archivedAt: entry.archivedAt,
        };
        await tx.address.upsert({
          where: { id: entry.id },
          create: {
            id: entry.id,
            companyId: state.companyId,
            kind: AddressKind.delivery,
            createdAt: entry.createdAt,
            ...columns,
          },
          update: columns,
        });
      }
    });
  }
}
