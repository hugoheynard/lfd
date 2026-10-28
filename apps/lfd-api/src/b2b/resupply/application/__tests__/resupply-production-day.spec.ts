import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ServiceRange } from "../../../../production/channels/commerce/index.js";
import {
  FixedClosedPlans,
  RecordingAdmissionDesk,
} from "../../../orders/application/commands/__tests__/plan-doubles.js";
import { CancelSiteResupplyCommand } from "../cancel-site-resupply.command.js";
import { CancelSiteResupplyHandler } from "../cancel-site-resupply.handler.js";
import { GetResupplyProductionDayHandler } from "../get-resupply-production-day.handler.js";
import { GetResupplyProductionDayQuery } from "../get-resupply-production-day.query.js";
import { ProductionRangeResupplies } from "../production-range-resupplies.js";
import { ResupplyPlanGate } from "../resupply-plan-gate.js";
import { SendBakehouseResupplyCommand } from "../send-bakehouse-resupply.command.js";
import { SendBakehouseResupplyHandler } from "../send-bakehouse-resupply.handler.js";
import { Catalogue, Directory, Sites } from "./resupply-doubles.js";
import {
  FixedResupplyCutoff,
  FixedTransferServedSites,
  InMemorySiteResupplies,
  InMemorySiteResupplyReader,
  KnownReceptions,
  SiteLabels,
  FixedLaunches,
} from "./site-resupply-doubles.js";

/** 17 h à Paris le 2 janvier : les journées sont le SUJET, l'horloge est fixée. */
const NOW = new Date("2026-01-02T16:00:00Z");
const TODAY = "2026-01-02";
const TOMORROW = "2026-01-03";
const VILLAGE = "site_village";
const LABO = "site_labo";
const ARTICLES = [
  {
    sku: "CRO",
    name: "Croissant",
    categoryId: "fam_morning",
    categoryName: "Viennoiseries",
    saleUnit: "piece" as const,
  },
  {
    sku: "PAC",
    name: "Pain au chocolat",
    categoryId: "fam_morning",
    categoryName: "Viennoiseries",
    saleUnit: "piece" as const,
  },
];

/** Des réassorts envoyés par le fournil, plan ouvert, puis lus par l'onglet et le prévisionnel. */
async function world() {
  const store = new InMemorySiteResupplies();
  const reader = new InMemorySiteResupplyReader(store);
  const clock = new FixedClock(NOW);
  const staff = new Directory({ name: "Lou Martin", role: "counter" });
  const launches = new FixedLaunches();
  const gate = new ResupplyPlanGate(new RecordingAdmissionDesk([]), launches);
  const uow = new DirectUnitOfWork();
  const place = new SendBakehouseResupplyHandler(
    store,
    new Catalogue(ARTICLES),
    new Sites([VILLAGE, LABO]),
    new FixedResupplyCutoff(null),
    staff,
    clock,
    new FixedIdGenerator("resupply"),
    gate,
    uow,
  );
  const cancel = new CancelSiteResupplyHandler(
    store,
    new KnownReceptions(),
    staff,
    clock,
    gate,
    uow,
  );
  const send = (siteId: string, target: "asap" | "tomorrow", sku: string, quantity: number) =>
    place.execute(new SendBakehouseResupplyCommand(siteId, target, [{ sku, quantity }], "s"));
  await send(VILLAGE, "asap", "CRO", 4);
  await send(VILLAGE, "tomorrow", "CRO", 9);
  await send(LABO, "tomorrow", "PAC", 6);
  await send(LABO, "tomorrow", "CRO", 2);
  const dropped = await send(LABO, "tomorrow", "PAC", 99);
  await cancel.execute(new CancelSiteResupplyCommand(LABO, dropped, "s"));
  const dayOf = (stopped: readonly string[]) =>
    new GetResupplyProductionDayHandler(
      reader,
      new SiteLabels(new Map([[VILLAGE, "Val Village"]])),
      new FixedClosedPlans(stopped),
      new Catalogue(ARTICLES),
      new FixedTransferServedSites([VILLAGE]),
    );
  return { reader, dayOf };
}

describe("l'onglet Réassorts de Prod manager (R3d)", () => {
  it("rend la journée, ses réassorts envoyés par point, le cumul, et le catalogue", async () => {
    const { dayOf } = await world();

    const view = await dayOf([]).execute(new GetResupplyProductionDayQuery(TOMORROW));

    expect(view.serviceDay).toBe(TOMORROW);
    expect(view.planStopped).toBe(false);
    expect(view.sites.map((site) => [site.siteId, site.siteLabel])).toEqual([
      [VILLAGE, "Val Village"],
      [LABO, null],
    ]);
    expect(view.totals).toEqual([
      { sku: "CRO", label: "Croissant", quantity: 11 },
      { sku: "PAC", label: "Pain au chocolat", quantity: 6 },
    ]);
    expect(view.articles.map((article) => article.sku)).toEqual(["CRO", "PAC"]);
    // Lot R3e : le Village arrive par transfert ; au Labo, le fournil dit « Monté ».
    expect(view.transferSiteIds).toEqual([VILLAGE]);
  });

  /** « Réassorts à produire » les tait une fois figés (R3a) ; l'onglet les montre, et dit pourquoi. */
  it("montre les « pour demain » d'un plan arrêté, marqués figés", async () => {
    const { dayOf } = await world();

    const view = await dayOf([TOMORROW]).execute(new GetResupplyProductionDayQuery(TOMORROW));

    expect(view.planStopped).toBe(true);
    expect(view.totals.reduce((sum, total) => sum + total.quantity, 0)).toBe(17);
  });

  it("la journée d'aujourd'hui porte ses « au plus tôt »", async () => {
    const { dayOf } = await world();

    const view = await dayOf([]).execute(new GetResupplyProductionDayQuery(TODAY));

    expect(view.sites[0]?.resupplies.map((resupply) => resupply.target)).toEqual(["asap"]);
  });
});

describe("le prévisionnel lit les réassorts pour demain (R3d)", () => {
  it("par journée, fusionnés par article, sans « au plus tôt » ni annulé", async () => {
    const { reader } = await world();

    const days = await new ProductionRangeResupplies(reader).expectedBetween(
      ServiceRange.of(TODAY, TOMORROW),
    );

    expect(days).toEqual([
      {
        day: TOMORROW,
        items: [
          { sku: "CRO", productName: "Croissant", quantity: 11, saleUnit: "piece" },
          { sku: "PAC", productName: "Pain au chocolat", quantity: 6, saleUnit: "piece" },
        ],
      },
    ]);
  });
});
