import {
  type BillingAddressView,
  type CompanyAddressesView,
  type DeliveryAddressView,
  type DeliverySpecs,
  deliverySpecsSchema,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { AddressKind } from "../../../platform/database/client/client.js";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyAddressReader } from "../domain/ports/company-address.reader.js";

/** Consignes vides — pour une livraison créée sans aucune préférence encore. */
const EMPTY_SPECS: DeliverySpecs = {
  note: "",
  slots: { mode: "everyday", slot: null },
  deliveryContact: null,
  gps: null,
  signatureRequired: false,
};

/** Une ligne d'adresse telle que Prisma la sélectionne. */
interface AddressRow {
  readonly id: string;
  readonly kind: AddressKind;
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  readonly isDefault: boolean;
  readonly deliverySpecs: unknown;
}

/**
 * Lecture des adresses d'une entreprise. Tri **défaut d'abord** puis ancienneté :
 * l'adresse de livraison par défaut ressort toujours en tête, les autres dans un
 * ordre stable. Les consignes JSON sont re-validées par le schéma du contrat à la
 * lecture — une donnée corrompue est refusée plutôt que servie telle quelle.
 */
@Injectable()
export class PrismaCompanyAddressReader extends CompanyAddressReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(companyId: string): Promise<CompanyAddressesView> {
    const rows = await this.prisma.address.findMany({
      where: { companyId, archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        kind: true,
        label: true,
        ligne1: true,
        ligne2: true,
        codePostal: true,
        ville: true,
        pays: true,
        isDefault: true,
        deliverySpecs: true,
      },
    });

    const billingRow = rows.find((row) => row.kind === "billing") ?? null;
    const deliveryRows = rows.filter((row) => row.kind === "delivery");
    const stepCounts = await this.procedureStepCounts(
      companyId,
      deliveryRows.map((row) => row.id),
    );
    const deliveries = deliveryRows.map((row) => toDeliveryView(row, stepCounts.get(row.id) ?? 0));

    return {
      billing: billingRow === null ? null : toBillingView(billingRow),
      deliveries,
    };
  }

  /**
   * Le nombre d'étapes de procédure de chaque adresse, en **une** requête pour
   * tout le carnet — pas une par adresse. Le mur `companyId` y est aussi : la
   * jointure par adresse suffirait, mais une lecture murée le porte toujours.
   */
  private async procedureStepCounts(
    companyId: string,
    addressIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    if (addressIds.length === 0) {
      return new Map();
    }
    const procedures = await this.prisma.deliveryProcedure.findMany({
      where: { companyId, addressId: { in: [...addressIds] } },
      select: { addressId: true, _count: { select: { steps: true } } },
    });
    return new Map(procedures.map((procedure) => [procedure.addressId, procedure._count.steps]));
  }
}

/** Champs postaux communs → la vue. */
function toBillingView(row: AddressRow): BillingAddressView {
  return {
    id: row.id,
    label: row.label,
    ligne1: row.ligne1,
    ligne2: row.ligne2,
    codePostal: row.codePostal,
    ville: row.ville,
    pays: row.pays,
  };
}

/** Une livraison → la vue, consignes JSON parsées (défaut si absentes). */
function toDeliveryView(row: AddressRow, procedureStepCount: number): DeliveryAddressView {
  const specs =
    row.deliverySpecs === null || row.deliverySpecs === undefined
      ? EMPTY_SPECS
      : deliverySpecsSchema.parse(row.deliverySpecs);
  return { ...toBillingView(row), isDefault: row.isDefault, specs, procedureStepCount };
}
