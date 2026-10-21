import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  type StaffAuthor,
  StaffAuthorDirectory,
  StaffAuthors,
} from "../../../../staff/directory/domain/staff-author-directory.js";
import {
  type DeliveryColors,
  DeliveryColorsReader,
  type DeliveryOrderProcedure,
  DeliveryProceduresReader,
} from "../../../channels/commerce/index.js";
import { DeliveryRoundNotFoundError } from "../../../domain/errors/delivery-round-errors.js";
import type { DepartedStopRow } from "../../../domain/ports/driver-rounds.reader.js";
import {
  RoundPaperReader,
  type RoundPaperRow,
  type RoundPaperStopRow,
} from "../../../domain/ports/round-paper.reader.js";
import { deliveryOn, FixedDeliveryOrders } from "../../commands/__tests__/round-doubles.js";
import {
  FixedTransferBinCounts,
  FixedTransferContents,
  FixedTransferSites,
  InMemoryInternalTransfers,
  InternalTransfersReaderOver,
  plannedTransfer,
} from "../../__tests__/transfer-doubles.js";
import {
  FixedTransferSitePlaces,
  VAL_VILLAGE_PLACE,
} from "../../__tests__/transfer-site-places-double.js";
import { GetRoundPaperPdfHandler, type RoundPaperFile } from "../get-round-paper-pdf.handler.js";
import { GetRoundPaperPdfQuery } from "../get-round-paper-pdf.query.js";
import { resupplyContentsOver } from "../../__tests__/resupply-transfer-doubles.js";

/** Le jour n'est que recopié dans le papier : rien ne le compare à l'horloge. */
const DAY = "2026-10-07";
const NOW = new Date("2026-10-07T04:15:00.000Z");

class FixedRoundPaper extends RoundPaperReader {
  readonly asked: string[] = [];
  constructor(private readonly round: RoundPaperRow | null) {
    super();
  }
  roundOf(roundId: string): Promise<RoundPaperRow | null> {
    this.asked.push(roundId);
    return Promise.resolve(this.round?.id === roundId ? this.round : null);
  }
}

class FixedProcedures extends DeliveryProceduresReader {
  calls = 0;
  constructor(private readonly procedures: readonly DeliveryOrderProcedure[]) {
    super();
  }
  proceduresOf(orderIds: readonly string[]): Promise<readonly DeliveryOrderProcedure[]> {
    this.calls += 1;
    return Promise.resolve(this.procedures.filter((p) => orderIds.includes(p.orderId)));
  }
}

class OneAuthor extends StaffAuthorDirectory {
  identify(): Promise<StaffAuthors> {
    const author: StaffAuthor = {
      staffUserId: "staff_paul",
      firstName: "Paul",
      lastName: "Durand",
      role: "livreur",
      roleLabel: "Livreur",
      jobTitle: "",
    };
    return Promise.resolve(new StaffAuthors(new Map([["staff_paul", author]])));
  }
}

const FROZEN: DepartedStopRow = {
  reference: "FIGEE-1",
  customerLabel: "Maison figée",
  address: {
    label: "",
    ligne1: "1 place figée",
    ligne2: "",
    codePostal: "73000",
    ville: "Chambéry",
    pays: "FR",
  },
  contact: null,
  window: null,
  signatureRequired: true,
  note: "",
  addressNote: null,
  departureRank: 1,
  gps: null,
  parking: null,
  depositAllowed: false,
  doorstepRule: "ask",
  arrivedAt: null,
};

function stopRow(orderId: string, overrides: Partial<RoundPaperStopRow> = {}): RoundPaperStopRow {
  return {
    stopId: `stop_${orderId}`,
    orderId,
    position: 0,
    departed: null,
    binCodes: [],
    ...overrides,
  };
}

/** Les couleurs de livraison du départ, données d'avance ; compte ses lectures. */
class FixedDeliveryColors extends DeliveryColorsReader {
  calls = 0;
  constructor(private readonly colors: DeliveryColors) {
    super();
  }
  departureColors(): Promise<DeliveryColors> {
    this.calls += 1;
    return Promise.resolve(this.colors);
  }
}

const NO_COLORS: DeliveryColors = { pro: null, public: null };

const ROUND: RoundPaperRow = {
  id: "round_1",
  serviceDay: DAY,
  vehicleName: "Kangoo blanc",
  passage: 1,
  driverStaffId: "staff_paul",
  planned: null,
  stops: [
    stopRow("o2", { binCodes: ["K7Q2"], position: 1 }),
    stopRow("o1", { departed: FROZEN, position: 2 }),
    stopRow("o_unknown", { position: 4 }),
  ],
  // L'arrêt de transfert, intercalé à la position 3 (2026-10-13).
  transferStops: [{ stopId: "stop_t1", transferId: "t_1", position: 3 }],
};

const TRANSFER_LINES = new Map([
  ["o_vv1", [{ sku: "PAIN", name: "Pain de campagne", quantity: 4 }]],
  ["o_vv2", [{ sku: "PAIN", name: "Pain de campagne", quantity: 2 }]],
]);

const PROCEDURE: DeliveryOrderProcedure = {
  orderId: "o2",
  steps: [{ id: "s1", title: "Entrer par la cour", body: "", hasPhoto: true, photoRevision: "r1" }],
};

function subject(round: RoundPaperRow | null = ROUND, colors = new FixedDeliveryColors(NO_COLORS)) {
  const procedures = new FixedProcedures([PROCEDURE]);
  const handler = new GetRoundPaperPdfHandler(
    new FixedRoundPaper(round),
    new FixedDeliveryOrders([
      deliveryOn("o1", DAY, { clientele: "pro" }),
      deliveryOn("o2", DAY, { clientele: null }),
    ]),
    procedures,
    new OneAuthor(),
    new FixedClock(NOW),
    new InternalTransfersReaderOver(
      new InMemoryInternalTransfers(plannedTransfer("t_1", DAY, NOW, ["o_vv1", "o_vv2"])),
    ),
    new FixedTransferContents(TRANSFER_LINES),
    new FixedTransferBinCounts(new Map([["t_1", 3]])),
    new FixedTransferSitePlaces([VAL_VILLAGE_PLACE]),
    new FixedTransferSites([
      {
        siteId: "site_vv",
        label: "Val Village",
        gps: null,
        mode: "integrated",
        arrivalBy: "09:30",
      },
    ]),
    colors,
    resupplyContentsOver(),
  );
  return { handler, procedures, colors };
}

function textOf(file: RoundPaperFile): string {
  return pdfPages(file.bytes).join("\n");
}

describe("GetRoundPaperPdfHandler — la feuille de tournée tirée au moment", () => {
  it("assemble les arrêts dans l'ordre de composition : vivant, figé, absent", async () => {
    const { handler } = subject();
    const file = await handler.execute(new GetRoundPaperPdfQuery("round_1", true));
    const text = textOf(file);
    const positions = ["Commande CMD-o2", "Commande FIGEE-1", "Commande o_unknown"].map((part) =>
      text.indexOf(part),
    );
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).toContain("K7Q2");
    expect(text).toContain("1 place figée");
    expect(text).toContain("Livreur : Paul Durand");
    expect(text).toContain("Tiré le mercredi 7 octobre 2026 à 06:15");
    expect(file.fileName).toBe("tournee-2026-10-07-Kangoo blanc.pdf");
  });

  it("imprime l'arrêt de transfert à sa place : site, heure, bacs, total des commandes", async () => {
    const { handler } = subject();
    const text = textOf(await handler.execute(new GetRoundPaperPdfQuery("round_1", true)));
    const positions = ["Commande FIGEE-1", "Vers Val Village", "Commande o_unknown"].map((part) =>
      text.indexOf(part),
    );
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).toContain("avant 9 h 30");
    expect(text).toContain("1 place du Village");
    expect(text).toContain("3 bacs");
    expect(text).toContain("COMMANDES · 2 COMMANDES");
    expect(text).toContain("6 × Pain de campagne");
    expect(text).toContain("4 bacs à charger");
  });

  it("lit les couleurs du départ À CHAQUE tirage, et un arrêt coloré change le papier (L5)", async () => {
    const plain = subject();
    const painted = subject(ROUND, new FixedDeliveryColors({ pro: "#1e88e5", public: null }));
    const query = new GetRoundPaperPdfQuery("round_1", true);

    const before = await plain.handler.execute(query);
    const after = await painted.handler.execute(query);
    await painted.handler.execute(query);

    expect(painted.colors.calls).toBe(2);
    expect(after.bytes.equals(before.bytes)).toBe(false);
    expect(textOf(after)).toBe(textOf(before));
  });

  it("imprime la procédure avec le droit de la lire", async () => {
    const { handler } = subject();
    const text = textOf(await handler.execute(new GetRoundPaperPdfQuery("round_1", true)));
    expect(text).toContain("1. Entrer par la cour");
  });

  it("ne lit même pas la procédure sans le droit, et ne l'imprime pas", async () => {
    const { handler, procedures } = subject();
    const text = textOf(await handler.execute(new GetRoundPaperPdfQuery("round_1", false)));
    expect(procedures.calls).toBe(0);
    expect(text).not.toContain("Entrer par la cour");
  });

  it("refuse une tournée inconnue par un 404 qui nomme l'identifiant", async () => {
    const { handler } = subject(null);
    await expect(handler.execute(new GetRoundPaperPdfQuery("round_x", true))).rejects.toThrow(
      DeliveryRoundNotFoundError,
    );
  });
});
