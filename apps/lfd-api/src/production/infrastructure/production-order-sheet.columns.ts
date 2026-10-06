import type { Clientele, OrderSheetDetails } from "../channels/commerce/day-orders.reader.js";

/**
 * **Le bon figé à l'arrêt, colonne par colonne** (E1b, 2026-10-06) — les deux
 * mappers de `production_order.trade_name … recurring`, sortis du dépôt de la
 * journée pour qu'il garde sa taille.
 *
 * `legal_name` fait foi : nul, la commande a été figée avant le lot et le bloc
 * entier se relit `null`, quelles que soient les autres colonnes.
 */
export const SHEET_COLUMNS = {
  tradeName: true,
  legalName: true,
  pickupLabel: true,
  addressLine1: true,
  addressLine2: true,
  addressPostalCode: true,
  addressCity: true,
  windowStart: true,
  windowEnd: true,
  contactSource: true,
  contactName: true,
  contactPhone: true,
  signatureRequired: true,
  note: true,
  recurring: true,
} as const;

/** Les colonnes telles que la base les rend — toutes nullables. */
export interface SheetRow {
  readonly tradeName: string | null;
  readonly legalName: string | null;
  readonly pickupLabel: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly addressPostalCode: string | null;
  readonly addressCity: string | null;
  readonly windowStart: string | null;
  readonly windowEnd: string | null;
  readonly contactSource: string | null;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly signatureRequired: boolean | null;
  readonly note: string | null;
  readonly recurring: boolean | null;
}

/** Ligne → bloc du domaine ; `null` pour une commande figée avant le lot. */
export function sheetDetailsOf(row: SheetRow): OrderSheetDetails | null {
  if (row.legalName === null) {
    return null;
  }
  return {
    tradeName: row.tradeName ?? "",
    legalName: row.legalName,
    pickupLabel: row.pickupLabel,
    address:
      row.addressLine1 === null && row.addressCity === null
        ? null
        : {
            line1: row.addressLine1 ?? "",
            line2: row.addressLine2 ?? "",
            postalCode: row.addressPostalCode ?? "",
            city: row.addressCity ?? "",
          },
    window: row.windowEnd === null ? null : { start: row.windowStart, end: row.windowEnd },
    contact:
      row.contactName === null
        ? null
        : {
            // Écrit par `sheetRowOf` et lui seul : deux valeurs possibles.
            source: row.contactSource === "holder" ? "holder" : "order",
            name: row.contactName,
            phone: row.contactPhone ?? "",
          },
    signatureRequired: row.signatureRequired ?? false,
    note: row.note ?? "",
    recurring: row.recurring ?? false,
  };
}

/** Bloc du domaine → colonnes ; tout à `null` quand le bloc est absent. */
export function sheetRowOf(details: OrderSheetDetails | null): SheetRow {
  return {
    tradeName: details?.tradeName ?? null,
    legalName: details?.legalName ?? null,
    pickupLabel: details?.pickupLabel ?? null,
    addressLine1: details?.address?.line1 ?? null,
    addressLine2: details?.address?.line2 ?? null,
    addressPostalCode: details?.address?.postalCode ?? null,
    addressCity: details?.address?.city ?? null,
    windowStart: details?.window?.start ?? null,
    windowEnd: details?.window?.end ?? null,
    contactSource: details?.contact?.source ?? null,
    contactName: details?.contact?.name ?? null,
    contactPhone: details?.contact?.phone ?? null,
    signatureRequired: details?.signatureRequired ?? null,
    note: details?.note ?? null,
    recurring: details?.recurring ?? null,
  };
}

/**
 * `production_order.clientele` ramenée dans son union. Le CHECK n'admet que
 * `pro`, `public` ou `NULL` ; `NULL` = journée figée avant la colonne.
 */
export function clienteleOf(value: string | null): Clientele | null {
  return value === "pro" || value === "public" ? value : null;
}
