import {
  DeliveryRunSheetReader,
  type DeliveryRunSheetEntry,
} from "../../../channels/commerce/index.js";
import {
  HandoverAttestationsReader,
  type AttestedHandover,
} from "../../../domain/ports/handover-attestations.reader.js";
import { AtelierSheetsReader } from "../../../../production/channels/handover/index.js";
import { GetDeliveryRunSheetHandler } from "../get-delivery-run-sheet.handler.js";
import { GetDeliveryRunSheetQuery } from "../get-delivery-run-sheet.query.js";

/**
 * La feuille de route : la rencontre des trois lectures, l'état partagé avec
 * la file du comptoir, et « trois questions, jamais N + 1 ». Les doublés
 * héritent du port abstrait et enregistrent leurs appels.
 */

// Intention relative : ces dates ne sont comparées à aucune horloge.
const PLACED_AT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
const DAY = "2026-09-30";

function entry(overrides: Partial<DeliveryRunSheetEntry> = {}): DeliveryRunSheetEntry {
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

  constructor(private readonly entries: readonly DeliveryRunSheetEntry[]) {
    super();
  }

  deliveriesOn(day: string): Promise<readonly DeliveryRunSheetEntry[]> {
    this.calls.push(day);
    return Promise.resolve(this.entries);
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

function handlerOf(
  entries: readonly DeliveryRunSheetEntry[],
  attested: ReadonlyMap<string, AttestedHandover> = new Map(),
  without: ReadonlySet<string> = new Set(),
) {
  const sheet = new FixedRunSheet(entries);
  const attestations = new RecordingAttestations(attested);
  const sheets = new FixedAtelierSheets(without);
  return {
    handler: new GetDeliveryRunSheetHandler(sheet, attestations, sheets),
    sheet,
    attestations,
    sheets,
  };
}

describe("GetDeliveryRunSheetHandler", () => {
  it("rend chaque arrêt avec ses consignes, sa procédure et ses dates en ISO", async () => {
    const { handler } = handlerOf([entry()]);

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY));

    expect(view.day).toBe(DAY);
    expect(view.stops[0]).toMatchObject({
      orderId: "ord_1",
      signatureRequired: true,
      orderNote: "par la cour",
      state: "expected",
      withoutAtelierSheet: false,
      readyAt: null,
      placedAt: PLACED_AT.toISOString(),
      addressBook: {
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
    });
  });

  it("tait le temps de livraison sur place quand l'adresse suit le réglage (L7b-C4)", async () => {
    const book = entry().addressBook;
    const { handler } = handlerOf([
      entry({ addressBook: book === null ? null : { ...book, stopMinutes: null } }),
    ]);

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY));

    expect(view.stops[0]?.addressBook).not.toHaveProperty("stopMinutes");
  });

  it("🔴 ne sert AUCUN champ monétaire", async () => {
    const { handler } = handlerOf([entry()]);

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY));

    const keys = Object.keys(view.stops[0] ?? {});
    expect(keys.filter((key) => /cents|price|total(?!Units)|amount/iu.test(key))).toEqual([]);
  });

  it("garde `addressBook: null` quand la commande n'est pas reliée au carnet", async () => {
    const { handler } = handlerOf([entry({ addressBook: null })]);

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY));

    expect(view.stops[0]?.addressBook).toBeNull();
  });

  it("dit l'état comme la file du comptoir : attestée et annulée reste `handed_over`", async () => {
    const { handler } = handlerOf(
      [entry({ status: "cancelled" })],
      new Map([
        ["ord_1", { handedOverAt: PLACED_AT, handedOverBy: "staff-1", via: "manual" as const }],
      ]),
    );

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY));

    expect(view.stops[0]?.state).toBe("handed_over");
  });

  it("🔴 signale la retardataire sans feuille d'atelier, et elle seule", async () => {
    const { handler } = handlerOf(
      [entry({ orderId: "ord_1" }), entry({ orderId: "ord_late" })],
      new Map(),
      new Set(["ord_late"]),
    );

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY));

    expect(view.stops.map((stop) => [stop.orderId, stop.withoutAtelierSheet])).toEqual([
      ["ord_1", false],
      ["ord_late", true],
    ]);
  });

  it("pose trois questions pour tout le lot, jamais une par commande", async () => {
    const { handler, sheet, attestations, sheets } = handlerOf([
      entry({ orderId: "a" }),
      entry({ orderId: "b" }),
    ]);

    await handler.execute(new GetDeliveryRunSheetQuery(DAY));

    expect(sheet.calls).toEqual([DAY]);
    expect(attestations.calls).toEqual([["a", "b"]]);
    expect(sheets.calls).toEqual([{ day: DAY, orderIds: ["a", "b"] }]);
  });
});
