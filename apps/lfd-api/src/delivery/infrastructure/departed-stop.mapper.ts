import {
  billingAddressPayloadSchema,
  deliveryContactSchema,
  fulfillmentSourceSchema,
} from "@lfd/contracts";
import { z } from "zod";

import type { DepartedStopRow } from "../domain/ports/driver-rounds.reader.js";

/** Ce que la vue du livreur lit de l'instantané du départ — aucun montant n'y a jamais été écrit. */
export const EXECUTION_SELECT = {
  reference: true,
  customerLabel: true,
  address: true,
  contact: true,
  deliveryWindow: true,
  signatureRequired: true,
  note: true,
  addressNote: true,
  departureRank: true,
  gpsLat: true,
  gpsLng: true,
  depositAllowed: true,
  arrivedAt: true,
} as const;

/** La forme de la ligne lue, sans type Prisma. */
export interface ExecutionRecord {
  readonly reference: string;
  readonly customerLabel: string;
  readonly address: unknown;
  readonly contact: unknown;
  readonly deliveryWindow: unknown;
  readonly signatureRequired: boolean;
  readonly note: string;
  readonly addressNote: string | null;
  readonly departureRank: number | null;
  readonly gpsLat: number | null;
  readonly gpsLng: number | null;
  readonly depositAllowed: boolean;
  readonly arrivedAt: Date | null;
}

/** La fenêtre telle que le départ la fige (`DepartureWindow`). */
const departureWindowSchema = z.object({
  start: z.string().nullable(),
  end: z.string(),
  source: fulfillmentSourceSchema,
});

/**
 * La ligne → l'instantané. Les `jsonb` sont VALIDÉS, jamais castés : une
 * forme inattendue ne doit pas atteindre le livreur — l'arrêt s'affiche alors
 * sans adresse, sans contact ou sans fenêtre, et l'écran le dit.
 */
export function departedStopOf(record: ExecutionRecord): DepartedStopRow {
  const address = billingAddressPayloadSchema.safeParse(record.address);
  const contact = deliveryContactSchema.safeParse(record.contact);
  const window = departureWindowSchema.safeParse(record.deliveryWindow);
  return {
    reference: record.reference,
    customerLabel: record.customerLabel,
    address: address.success ? address.data : null,
    contact: contact.success ? contact.data : null,
    window: window.success ? window.data : null,
    signatureRequired: record.signatureRequired,
    note: record.note,
    addressNote: record.addressNote,
    departureRank: record.departureRank,
    gps:
      record.gpsLat === null || record.gpsLng === null
        ? null
        : { lat: record.gpsLat, lng: record.gpsLng },
    depositAllowed: record.depositAllowed,
    arrivedAt: record.arrivedAt,
  };
}
