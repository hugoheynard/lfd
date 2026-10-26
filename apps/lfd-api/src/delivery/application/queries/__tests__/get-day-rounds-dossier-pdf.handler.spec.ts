import { FixedBrandLogo } from "../../../../platform/brand/__tests__/fixed-brand-logo.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  StaffAuthorDirectory,
  StaffAuthors,
} from "../../../../staff/directory/domain/staff-author-directory.js";
import {
  type DeliveryColors,
  DeliveryAddressPointsReader,
  DeliveryColorsReader,
  type DeliveryOrderAddress,
  type DeliveryOrderProcedure,
  DeliveryProceduresReader,
  TransferSiteColorsReader,
} from "../../../channels/commerce/index.js";
import {
  DeliveryRoundsReader,
  type RoundRow,
} from "../../../domain/ports/delivery-rounds.reader.js";
import {
  DayRoundPapersReader,
  type RoundPaperRow,
} from "../../../domain/ports/round-paper.reader.js";
import { PlannedTiming } from "../../../domain/value-objects/planned-timing.js";
import { deliveryOn, FixedDeliveryOrders } from "../../commands/__tests__/round-doubles.js";
import {
  FixedTransferBinCounts,
  FixedTransferContents,
  FixedTransferSites,
  InMemoryInternalTransfers,
  InternalTransfersReaderOver,
} from "../../__tests__/transfer-doubles.js";
import { FixedTransferSitePlaces } from "../../__tests__/transfer-site-places-double.js";
import { resupplyContentsOver } from "../../__tests__/resupply-transfer-doubles.js";
import { FixedTransferOrderColors } from "../../__tests__/transfer-colors-doubles.js";
import { DayRoundsDossierChecks } from "../../day-rounds-dossier-checks.js";
import { RoundPaperAssembler } from "../../round-paper-assembly.js";
import { GetDayRoundsDossierPdfHandler } from "../get-day-rounds-dossier-pdf.handler.js";
import { GetDayRoundsDossierPdfQuery } from "../get-day-rounds-dossier-pdf.query.js";
import { FixedNoteNumbers } from "../../__tests__/delivery-note-numbers-doubles.js";
import { FixedDepartures, FixedLoading, roundRow } from "./packing-doubles.js";

/** Le jour n'est que recopié et comparé à lui-même : rien ne le compare à l'horloge. */
const DAY = "2026-10-07";
const NOW = new Date("2026-10-07T03:00:00.000Z");

class FixedDayPapers extends DayRoundPapersReader {
  readonly asked: string[] = [];
  constructor(private readonly rows: readonly RoundPaperRow[]) {
    super();
  }
  roundsOn(serviceDay: string): Promise<readonly RoundPaperRow[]> {
    this.asked.push(serviceDay);
    return Promise.resolve(this.rows.filter((row) => row.serviceDay === serviceDay));
  }
}

class ComposedAmong extends DeliveryRoundsReader {
  constructor(private readonly composed: ReadonlySet<string>) {
    super();
  }
  roundsOn(): Promise<readonly RoundRow[]> {
    return Promise.resolve([]);
  }
  composedAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(orderIds.filter((id) => this.composed.has(id))));
  }
}

class CountedProcedures extends DeliveryProceduresReader {
  calls = 0;
  proceduresOf(orderIds: readonly string[]): Promise<readonly DeliveryOrderProcedure[]> {
    this.calls += 1;
    return Promise.resolve(
      orderIds.map((orderId) => ({
        orderId,
        steps: [
          { id: "s", title: "Sonner à la cuisine", body: "", hasPhoto: false, photoRevision: null },
        ],
      })),
    );
  }
}

class NoAuthors extends StaffAuthorDirectory {
  identify(): Promise<StaffAuthors> {
    return Promise.resolve(new StaffAuthors(new Map()));
  }
}

class NoColors extends DeliveryColorsReader {
  departureColors(): Promise<DeliveryColors> {
    return Promise.resolve({ pro: null, public: null });
  }
}

class NoSiteColors extends TransferSiteColorsReader {
  colorsOf(): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(new Map());
  }
}

/** Le carnet : aucune commande n'y est reliée — chacune est « à vérifier ». */
class NoAddressBook extends DeliveryAddressPointsReader {
  addressesOfOrders(): Promise<readonly DeliveryOrderAddress[]> {
    return Promise.resolve([]);
  }
}

function paperRow(
  id: string,
  vehicleName: string,
  departure: string,
  orderId: string,
): RoundPaperRow {
  return {
    id,
    serviceDay: DAY,
    vehicleName,
    passage: 1,
    driverStaffId: null,
    planned: PlannedTiming.of({
      departureAt: new Date(`${DAY}T${departure}:00.000Z`),
      returnAt: new Date(`${DAY}T12:00:00.000Z`),
      meters: 5000,
    }),
    stops: [
      {
        stopId: `s_${orderId}`,
        orderId,
        shipmentRank: 1,
        position: 1,
        departed: null,
        binCodes: [],
      },
    ],
    transferStops: [],
  };
}

function subject() {
  const orders = new FixedDeliveryOrders([
    deliveryOn("o_late", DAY),
    deliveryOn("o_early", DAY),
    deliveryOn("o_loose", DAY, { customerLabel: "Hôtel du Col" }),
    deliveryOn("o_gone", DAY, { status: "cancelled" }),
  ]);
  const procedures = new CountedProcedures();
  // o_late n'a pas de BL : rien ne s'imprime à côté de sa référence.
  const noteNumbers = new FixedNoteNumbers([
    { orderId: "o_early", rank: 1, number: "BL-early-1" },
    { orderId: "o_loose", rank: 1, number: "BL-loose-1" },
  ]);
  const papers = new FixedDayPapers([
    paperRow("r_late", "Camion tardif", "08:00", "o_late"),
    paperRow("r_early", "Camion matinal", "05:00", "o_early"),
  ]);
  const handler = new GetDayRoundsDossierPdfHandler(
    papers,
    new RoundPaperAssembler(
      orders,
      procedures,
      new NoAuthors(),
      new InternalTransfersReaderOver(new InMemoryInternalTransfers()),
      new FixedTransferContents(new Map()),
      new FixedTransferBinCounts(),
      new FixedTransferSitePlaces(),
      new FixedTransferSites(),
      new NoColors(),
      resupplyContentsOver(),
      new FixedTransferOrderColors(),
      noteNumbers,
    ),
    new FixedLoading([roundRow("r_early", [{ orderId: "o_early" }])]),
    orders,
    new ComposedAmong(new Set(["o_late", "o_early"])),
    new NoSiteColors(),
    new DayRoundsDossierChecks(orders, new NoAddressBook(), new FixedDepartures(new Map())),
    noteNumbers,
    new FixedBrandLogo(),
    new FixedClock(NOW),
  );
  return { handler, procedures, papers };
}

describe("GetDayRoundsDossierPdfHandler — le dossier des tournées du jour", () => {
  it("rend la répartition puis les feuilles par heure de départ, nommé par le jour", async () => {
    const { handler, papers } = subject();
    const file = await handler.execute(new GetDayRoundsDossierPdfQuery(DAY, true));
    const pages = pdfPages(file.bytes);
    expect(papers.asked).toEqual([DAY]);
    expect(file.fileName).toBe("dossier-de-livraison-du-7-octobre-2026.pdf");
    expect(pages).toHaveLength(3);
    expect(pages[1]).toContain("Camion matinal · passage 1");
    expect(pages[2]).toContain("Camion tardif · passage 1");
    expect(pages[1]).toContain("Sonner à la cuisine");
  });

  it("garde les livraisons du jour non placées, sans les annulées", async () => {
    const { handler } = subject();
    const [dispatch] = pdfPages(
      (await handler.execute(new GetDayRoundsDossierPdfQuery(DAY, true))).bytes,
    );
    expect(dispatch).toContain("Hôtel du Col");
    expect(dispatch).toContain("1 livraison non placée");
    expect(dispatch).not.toContain("ORD-o_gone");
  });

  it("reprend les alertes de la feuille de route sous « À vérifier », hors tournée compris", async () => {
    const { handler } = subject();
    const [dispatch] = pdfPages(
      (await handler.execute(new GetDayRoundsDossierPdfQuery(DAY, true))).bytes,
    );
    expect(dispatch).toContain("À VÉRIFIER");
    expect(dispatch).toContain("· 3 à vérifier");
    expect(dispatch).toContain("Adresse non reliée au carnet");
    expect(dispatch).toContain("Hors tournée");
    expect(dispatch).not.toContain("ORD-o_gone");
  });

  it("imprime le BL de chaque commande nommée : feuilles, non placées, « À vérifier » (2026-10-26)", async () => {
    const { handler } = subject();
    const pages = pdfPages(
      (await handler.execute(new GetDayRoundsDossierPdfQuery(DAY, true))).bytes,
    );
    const [dispatch = "", early = "", late = ""] = pages;
    // Non placée, et « à vérifier » : son BL dans les deux rubriques.
    expect(dispatch.split("BL-loose-1").length - 1).toBe(2);
    expect(dispatch).toContain("BL-early-1");
    expect(early).toContain("Commande ORD-o_early · BL-early-1");
    expect(late).toContain("Commande ORD-o_late");
    expect(pages.join("\n")).not.toContain("BL-late");
  });

  it("ne lit même pas la procédure sans le droit, comme round.pdf", async () => {
    const { handler, procedures } = subject();
    const text = pdfPages(
      (await handler.execute(new GetDayRoundsDossierPdfQuery(DAY, false))).bytes,
    ).join("\n");
    expect(procedures.calls).toBe(0);
    expect(text).not.toContain("Sonner à la cuisine");
  });
});
