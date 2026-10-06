/**
 * Les doublés de la feuille de route, partagés par ses suites : ils héritent
 * du port abstrait et enregistrent leurs appels.
 */
import {
  DeliveryRunSheetReader,
  type DeliveryRunSheetEntry,
} from "../../../channels/commerce/index.js";
import {
  HandoverAttestationsReader,
  type AttestedHandover,
} from "../../../domain/ports/handover-attestations.reader.js";
import { AtelierSheetsReader } from "../../../../production/channels/handover/index.js";
import {
  RoundPlacementsReader,
  type RoundPlacement,
  type RoundPlacements,
} from "../../../../delivery/channels/handover/index.js";
import { GetDeliveryRunSheetHandler } from "../get-delivery-run-sheet.handler.js";

// Intention relative : ces dates ne sont comparées à aucune horloge.
export const PLACED_AT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
export const DAY = "2026-09-30";

export function entry(overrides: Partial<DeliveryRunSheetEntry> = {}): DeliveryRunSheetEntry {
  return {
    orderId: "ord_1",
    reference: "ORD-ABCD-1234",
    customerLabel: "Les Halles",
    tradeName: null,
    clientele: "pro",
    address: {
      label: "",
      ligne1: "12 rue du Test",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
    },
    window: { start: "08:00", end: "09:00", source: "override" },
    contact: { prenom: "Léa", nom: "Martin", telephone: "0600000000" },
    signatureRequired: true,
    orderNote: "par la cour",
    addressBook: {
      companyId: "cmp_1",
      addressId: "addr_1",
      note: "sonner deux fois",
      gps: { lat: 45.44, lng: 6.98 },
      stopMinutes: 25,
      procedure: [
        {
          id: "step_1",
          title: "Portail",
          body: "code 1234",
          hasPhoto: true,
          photoRevision: "01JREV",
        },
      ],
    },
    totalUnits: 3,
    status: "confirmed",
    readyAt: null,
    placedAt: PLACED_AT,
    ...overrides,
  };
}

class FixedRunSheet extends DeliveryRunSheetReader {
  readonly calls: string[] = [];
  readonly amongCalls: (readonly string[])[] = [];

  constructor(
    private readonly entries: readonly DeliveryRunSheetEntry[],
    /** Les livraisons d'autres jours, trouvables par identifiant. */
    private readonly elsewhere: readonly DeliveryRunSheetEntry[] = [],
  ) {
    super();
  }

  deliveriesOn(day: string): Promise<readonly DeliveryRunSheetEntry[]> {
    this.calls.push(day);
    return Promise.resolve(this.entries);
  }

  deliveriesAmong(orderIds: readonly string[]): Promise<readonly DeliveryRunSheetEntry[]> {
    this.amongCalls.push(orderIds);
    return Promise.resolve(
      [...this.entries, ...this.elsewhere].filter((row) => orderIds.includes(row.orderId)),
    );
  }
}

class RecordingAttestations extends HandoverAttestationsReader {
  readonly calls: (readonly string[])[] = [];

  constructor(private readonly attested: ReadonlyMap<string, AttestedHandover> = new Map()) {
    super();
  }

  forOrders(orderIds: readonly string[]): Promise<ReadonlyMap<string, AttestedHandover>> {
    this.calls.push(orderIds);
    return Promise.resolve(this.attested);
  }
}

class FixedAtelierSheets extends AtelierSheetsReader {
  readonly calls: { readonly day: string; readonly orderIds: readonly string[] }[] = [];

  constructor(private readonly without: ReadonlySet<string> = new Set()) {
    super();
  }

  withoutSheet(serviceDay: string, orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    this.calls.push({ day: serviceDay, orderIds });
    return Promise.resolve(this.without);
  }
}

export function handlerOf(
  entries: readonly DeliveryRunSheetEntry[],
  attested: ReadonlyMap<string, AttestedHandover> = new Map(),
  without: ReadonlySet<string> = new Set(),
  elsewhere: readonly DeliveryRunSheetEntry[] = [],
  rounds: FixedRoundPlacements = new FixedRoundPlacements(),
) {
  const sheet = new FixedRunSheet(entries, elsewhere);
  const attestations = new RecordingAttestations(attested);
  const sheets = new FixedAtelierSheets(without);
  return {
    handler: new GetDeliveryRunSheetHandler(sheet, attestations, sheets, rounds),
    sheet,
    attestations,
    sheets,
    rounds,
  };
}

/** La livraison doublée : un compte du jour et des places fixés, les appels notés. */
export class FixedRoundPlacements extends RoundPlacementsReader {
  readonly calls: { readonly day: string; readonly orderIds: readonly string[] }[] = [];

  constructor(
    private readonly byOrder: ReadonlyMap<string, RoundPlacement> = new Map(),
    private readonly roundCount = 0,
  ) {
    super();
  }

  placementsOf(day: string, orderIds: readonly string[]): Promise<RoundPlacements> {
    this.calls.push({ day, orderIds });
    return Promise.resolve({ roundCount: this.roundCount, byOrder: this.byOrder });
  }
}
