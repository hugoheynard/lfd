import { ResourceNotFoundError } from "../../../../../platform/shared/errors/app-error.js";
import { ProductionPaperArchive, productionCountPdfKey } from "../../../../shared/print/index.js";
import { dayDossierPdfKey } from "../../../domain/services/day-dossier-pdf.js";
import { Directory, staffCard } from "../../__tests__/dossier-recipient-doubles.js";
import { PlanVersionPaperShelf } from "../../services/plan-version-paper-shelf.js";
import { ComparePlanVersionsHandler } from "../compare-plan-versions.handler.js";
import { ComparePlanVersionsQuery } from "../compare-plan-versions.query.js";
import { ListPlanVersionsHandler } from "../list-plan-versions.handler.js";
import { ListPlanVersionsQuery } from "../list-plan-versions.query.js";
import {
  EntriesListing,
  FixedComparison,
  PaperBucket,
  type PlanVersionDiff,
  type PlanVersionEntry,
  entry,
} from "./plan-version-doubles.js";

const DAY = "2026-11-28";
const CLOSED_AT = new Date("2026-11-27T18:00:00.000Z");

function dossierKey(version: number): string {
  return dayDossierPdfKey(DAY, CLOSED_AT, null, version);
}

function countKey(version: number): string {
  return productionCountPdfKey(DAY, CLOSED_AT, null, version);
}

function listHandler(
  entries: readonly PlanVersionEntry[],
  bucket = new PaperBucket(),
  directory = new Directory(),
): ListPlanVersionsHandler {
  return new ListPlanVersionsHandler(
    new EntriesListing(entries),
    new PlanVersionPaperShelf(new ProductionPaperArchive(bucket)),
    directory,
  );
}

/** La liste des versions (lot H4) : auteur nommé, papier lu au stockage. */
describe("ListPlanVersionsHandler", () => {
  it("rend une liste vide pour une journée jamais versionnée, sans lire le stockage", async () => {
    const bucket = new PaperBucket();

    expect(await listHandler([], bucket).execute(new ListPlanVersionsQuery(DAY))).toEqual([]);
    expect(bucket.reads).toEqual([]);
  });

  it("nomme les auteurs des quatre genres, le staff par son nom figé puis par l'annuaire", async () => {
    const directory = new Directory().put(
      staffCard({ staffUserId: "s-paul", firstName: "Paul", lastName: "Martin" }),
    );
    const entries = [
      entry({ version: 1 }),
      entry({ version: 2, cause: "order_revised", recordedBy: staffWithoutName("s-paul") }),
      entry({ version: 3, cause: "order_revised", recordedBy: staffWithoutName("s-gone") }),
      entry({
        version: 4,
        cause: "order_withdrawn",
        recordedBy: { kind: "customer" },
        paperVersion: 3,
      }),
      entry({
        version: 5,
        cause: "order_withdrawn",
        recordedBy: { kind: "guest" },
        paperVersion: 3,
      }),
      entry({ version: 6, cause: "auto_closed", recordedBy: { kind: "system" } }),
    ];

    const views = await listHandler(entries, new PaperBucket(), directory).execute(
      new ListPlanVersionsQuery(DAY),
    );

    expect(views.map((view) => view.author)).toEqual([
      { kind: "staff", staffId: "s-marie", name: "Marie Dupont" },
      { kind: "staff", staffId: "s-paul", name: "Paul Martin" },
      { kind: "staff", staffId: "s-gone", name: null },
      { kind: "customer" },
      { kind: "guest" },
      { kind: "system" },
    ]);
  });

  it("dit le papier rangé ou non, version par version, au stockage", async () => {
    const bucket = new PaperBucket().put(dossierKey(1)).put(countKey(1)).put(countKey(2));
    const entries = [entry({ version: 1 }), entry({ version: 2, cause: "retaken", printRun: 2 })];

    const views = await listHandler(entries, bucket).execute(new ListPlanVersionsQuery(DAY));

    expect(views.map((view) => view.paper)).toEqual([
      { version: 1, dossier: true, count: true },
      { version: 2, dossier: false, count: true },
    ]);
    expect(views[1]).toMatchObject({
      version: 2,
      cause: "retaken",
      printRun: 2,
      shipmentCount: 3,
      recordedAt: CLOSED_AT.toISOString(),
      closedAt: CLOSED_AT.toISOString(),
    });
  });

  it("renvoie un retrait au papier de la version d'avant, lu une seule fois", async () => {
    const bucket = new PaperBucket().put(dossierKey(1)).put(countKey(1));
    const entries = [
      entry({ version: 1 }),
      entry({ version: 2, cause: "order_withdrawn", paperVersion: 1 }),
    ];

    const views = await listHandler(entries, bucket).execute(new ListPlanVersionsQuery(DAY));

    expect(views[1]?.paper).toEqual({ version: 1, dossier: true, count: true });
    expect(bucket.reads).toEqual([dossierKey(1), countKey(1)]);
  });

  it("un retrait sans version d'avant n'a aucun papier", async () => {
    const entries = [entry({ version: 1, cause: "order_withdrawn", paperVersion: null })];

    const views = await listHandler(entries).execute(new ListPlanVersionsQuery(DAY));

    expect(views[0]?.paper).toEqual({ version: null, dossier: false, count: false });
  });

  it("un stockage qui ne répond pas rend « on ne sait pas », pas « non rangé »", async () => {
    const bucket = new PaperBucket().put(dossierKey(1));
    bucket.down = true;

    const views = await listHandler([entry()], bucket).execute(new ListPlanVersionsQuery(DAY));

    expect(views[0]?.paper).toEqual({ version: 1, dossier: null, count: null });
  });
});

/** La comparaison (lot H4) : le diff du noyau tel quel, instants en ISO. */
describe("ComparePlanVersionsHandler", () => {
  it("passe le jour et la plage au noyau, et rend son diff, instants en ISO", async () => {
    const comparison = new FixedComparison(sampleDiff());

    const view = await new ComparePlanVersionsHandler(comparison).execute(
      new ComparePlanVersionsQuery(DAY, 1, 3),
    );

    expect(comparison.asked).toEqual([[DAY, 1, 3]]);
    expect(view).toEqual({
      from: { ...mark(1), recordedAt: CLOSED_AT.toISOString(), closedAt: CLOSED_AT.toISOString() },
      to: { ...mark(3), recordedAt: CLOSED_AT.toISOString(), closedAt: CLOSED_AT.toISOString() },
      baselineUnknown: false,
      production: sampleDiff().production,
      changes: [
        {
          kind: "entered",
          shipment: { orderId: "o2", rank: 1, reference: "ORD-2", customerLabel: "Café" },
          by: {
            ...mark(3),
            recordedAt: CLOSED_AT.toISOString(),
            closedAt: CLOSED_AT.toISOString(),
          },
          entry: "retaken",
          offPlan: true,
          reason: "retaken_off_plan",
        },
      ],
      resupplies: [],
      toCheck: [
        {
          kind: "left_reason_at_commerce",
          severity: "to_check",
          shipment: { orderId: "o9", rank: 1, reference: "ORD-9", customerLabel: "Bar" },
          by: {
            ...mark(3),
            recordedAt: CLOSED_AT.toISOString(),
            closedAt: CLOSED_AT.toISOString(),
          },
        },
      ],
    });
  });

  // Les refus eux-mêmes (400, 404) sont éprouvés au noyau et par l'e2e.
  it("laisse passer le refus du noyau tel quel", async () => {
    const refused = new UnknownVersion();

    await expect(
      new ComparePlanVersionsHandler(new FixedComparison(refused)).execute(
        new ComparePlanVersionsQuery(DAY, 1, 9),
      ),
    ).rejects.toBe(refused);
  });
});

function staffWithoutName(staffId: string): PlanVersionEntry["recordedBy"] {
  return { kind: "staff", staffId, name: null };
}

function mark(version: number): PlanVersionDiff["from"] {
  return {
    version,
    cause: version === 1 ? "closed" : "retaken",
    recordedAt: CLOSED_AT,
    recordedBy: { kind: "system" },
    closedAt: CLOSED_AT,
  };
}

function sampleDiff(): PlanVersionDiff {
  return {
    from: mark(1),
    to: mark(3),
    baselineUnknown: false,
    production: [
      {
        sku: "croissant",
        productName: "Croissant",
        saleUnit: "piece",
        before: 10,
        after: 15,
        delta: 5,
      },
    ],
    changes: [
      {
        kind: "entered",
        shipment: { orderId: "o2", rank: 1, reference: "ORD-2", customerLabel: "Café" },
        by: mark(3),
        entry: "retaken",
        offPlan: true,
        reason: "retaken_off_plan",
      },
    ],
    resupplies: [],
    toCheck: [
      {
        kind: "left_reason_at_commerce",
        severity: "to_check",
        shipment: { orderId: "o9", rank: 1, reference: "ORD-9", customerLabel: "Bar" },
        by: mark(3),
      },
    ],
  };
}

/** Un refus du noyau, tel qu'un double le lève. */
class UnknownVersion extends ResourceNotFoundError {
  constructor() {
    super("test.plan_version.not_found", "Version inconnue (double).");
  }
}
