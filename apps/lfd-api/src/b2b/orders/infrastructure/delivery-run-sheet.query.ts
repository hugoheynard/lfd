import {
  billingAddressPayloadSchema,
  deliverySpecsSchema,
  type BillingAddressPayload,
} from "@lfd/contracts";

import type {
  DeliveryRunSheetAddressBook,
  DeliveryRunSheetEntry,
  DeliveryRunSheetStep,
} from "../../../handover/channels/commerce/index.js";
import type { Prisma } from "../../../platform/database/client/client.js";
import { photoCardRevision } from "../../shared/photo-cards/domain/value-objects/photo-revision.js";
import { customerLabelOf, tradeNameOf } from "./handover-order.query.js";
import { fulfillmentOf, windowOf } from "./order-fulfillment.parse.js";

/**
 * **La lecture d'une commande POUR LA FEUILLE DE ROUTE** — interne à
 * `infrastructure/`, comme `handover-order.query.ts` dont elle reprend le
 * nommage du client (une seule règle d'enseigne pour le comptoir et le livreur).
 *
 * 🔴 **Aucun montant dans ces `select`.** Ce n'est pas une omission à combler :
 * un total servi au livreur serait lu comme une somme à encaisser à la porte.
 */

/** Ce que la feuille de route lit de chaque commande. Le lien, pas les consignes. */
export const RUN_SHEET_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillment: true,
  readyAt: true,
  createdAt: true,
  companyId: true,
  clientele: true,
  note: true,
  deliveryAddressSnapshot: true,
  deliveryAddressId: true,
  company: { select: { raisonSociale: true, enseigne: true } },
  placedBy: { select: { email: true, firstName: true, lastName: true } },
  lines: { select: { quantity: true } },
} as const;

/** Les consignes d'une adresse du carnet. */
export const RUN_SHEET_ADDRESS_SELECT = {
  id: true,
  companyId: true,
  deliverySpecs: true,
} as const;

/** La procédure d'une adresse, étapes dans l'ordre. La clé de photo ne sort pas. */
export const RUN_SHEET_PROCEDURE_SELECT = {
  addressId: true,
  steps: {
    orderBy: { position: "asc" },
    select: { id: true, title: true, body: true, photoKey: true },
  },
} as const;

export type RunSheetOrderRow = Prisma.OrderGetPayload<{ select: typeof RUN_SHEET_ORDER_SELECT }>;
export type RunSheetAddressRow = Prisma.AddressGetPayload<{
  select: typeof RUN_SHEET_ADDRESS_SELECT;
}>;
export type RunSheetProcedureRow = Prisma.DeliveryProcedureGetPayload<{
  select: typeof RUN_SHEET_PROCEDURE_SELECT;
}>;

/** Un lien d'adresse à relire : l'adresse ET la société qui doit la posséder. */
export interface AddressLink {
  readonly addressId: string;
  readonly companyId: string;
}

/**
 * Les liens à relire. Une commande sans société n'en a aucun : son lien, s'il
 * existait, ne pourrait désigner que le carnet d'un autre.
 */
export function addressLinksOf(rows: readonly RunSheetOrderRow[]): readonly AddressLink[] {
  return rows.flatMap((row) =>
    row.deliveryAddressId === null || row.companyId === null
      ? []
      : [{ addressId: row.deliveryAddressId, companyId: row.companyId }],
  );
}

/**
 * La ligne → un arrêt. `addresses` et `procedures` ont été lus SOUS LE MUR ;
 * le mapper revérifie quand même que l'adresse trouvée est celle de la société
 * de la commande, parce que deux commandes de deux sociétés peuvent se
 * retrouver dans le même lot.
 */
export function toRunSheetEntry(
  row: RunSheetOrderRow,
  addresses: ReadonlyMap<string, RunSheetAddressRow>,
  procedures: ReadonlyMap<string, RunSheetProcedureRow>,
): DeliveryRunSheetEntry {
  const agreed = fulfillmentOf(row.fulfillment);
  const label = customerLabelOf(row);
  return {
    orderId: row.id,
    reference: row.orderNumber,
    customerLabel: label,
    tradeName: tradeNameOf(row.company, label),
    clientele: row.clientele,
    address: snapshotOf(row.deliveryAddressSnapshot),
    window: windowOf(agreed),
    contact: agreed.contact.value,
    signatureRequired: agreed.signatureRequired.value,
    orderNote: row.note,
    addressBook: addressBookOf(row, addresses, procedures),
    totalUnits: row.lines.reduce((sum, line) => sum + line.quantity, 0),
    status: row.status,
    readyAt: row.readyAt,
    placedAt: row.createdAt,
  };
}

function addressBookOf(
  row: RunSheetOrderRow,
  addresses: ReadonlyMap<string, RunSheetAddressRow>,
  procedures: ReadonlyMap<string, RunSheetProcedureRow>,
): DeliveryRunSheetAddressBook | null {
  if (row.deliveryAddressId === null || row.companyId === null) {
    return null;
  }
  const address = addresses.get(row.deliveryAddressId);
  if (address === undefined || address.companyId !== row.companyId) {
    return null;
  }
  // Validé, jamais casté : une adresse antérieure aux consignes n'en porte pas,
  // et une forme inattendue ne doit pas atteindre le livreur. La procédure,
  // elle, reste servie — elle ne dépend pas de ce JSON.
  const specs = deliverySpecsSchema.safeParse(address.deliverySpecs);
  return {
    companyId: address.companyId,
    addressId: address.id,
    note: specs.success ? specs.data.note : "",
    gps: specs.success ? specs.data.gps : null,
    procedure: (procedures.get(address.id)?.steps ?? []).map(toStep),
  };
}

function toStep(step: RunSheetProcedureRow["steps"][number]): DeliveryRunSheetStep {
  return {
    id: step.id,
    title: step.title,
    body: step.body,
    hasPhoto: step.photoKey !== null,
    // La révision que sert déjà la procédure staff (`PrismaDeliveryProcedureReader`) :
    // la route photo répond en cache immuable, et l'écran change d'URL sur elle.
    photoRevision: step.photoKey === null ? null : photoCardRevision(step.photoKey),
  };
}

/**
 * L'adresse livrée figée. `safeParse` plutôt que `parse` : un snapshot illisible
 * sur UNE commande ne doit pas faire tomber la feuille de toute la tournée —
 * l'arrêt s'affiche sans adresse, et l'écran le dit.
 */
function snapshotOf(value: Prisma.JsonValue | null): BillingAddressPayload | null {
  if (value === null) {
    return null;
  }
  const parsed = billingAddressPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
