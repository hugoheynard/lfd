import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
} from "../../domain/resupply-receipt-errors.js";
import {
  StockAlertAlreadyLiftedError,
  StockAlertNotFoundError,
} from "../../domain/stock-alert-errors.js";
import { DeclareStockAlertCommand } from "../declare-stock-alert.command.js";
import { DeclareStockAlertHandler } from "../declare-stock-alert.handler.js";
import { LiftStockAlertCommand } from "../lift-stock-alert.command.js";
import { LiftStockAlertHandler } from "../lift-stock-alert.handler.js";
import { ListLiveStockAlertsHandler } from "../list-live-stock-alerts.handler.js";
import { ListSiteStockAlertsHandler } from "../list-site-stock-alerts.handler.js";
import { ListSiteStockAlertsQuery } from "../list-site-stock-alerts.query.js";
import { ReceiveResupplyLineCommand } from "../receive-resupply-line.command.js";
import { ReceiveResupplyLineHandler } from "../receive-resupply-line.handler.js";
import { Catalogue, Directory, InMemoryReceipts, Sites } from "./resupply-doubles.js";
import { SiteLabels } from "./site-resupply-doubles.js";
import { InMemoryStockAlertReader, InMemoryStockAlerts } from "./stock-alert-doubles.js";

/** Le 2 janvier au matin ; l'horloge double avance d'elle, jamais du calendrier. */
const NOW = new Date("2026-01-02T08:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const VILLAGE = "site_village";
const LABO = "site_labo";
const CATALOGUE = new Catalogue([
  { sku: "CRO", name: "Croissant" },
  { sku: "PAC", name: "Pain au chocolat" },
]);

function setup() {
  const store = new InMemoryStockAlerts();
  const reader = new InMemoryStockAlertReader(store);
  const clock = new FixedClock(NOW);
  const staff = new Directory({ name: "Lou Martin", role: "counter" });
  const uow = new DirectUnitOfWork();
  const sites = new Sites([VILLAGE, LABO]);
  return {
    store,
    clock,
    declare: new DeclareStockAlertHandler(
      store,
      CATALOGUE,
      sites,
      staff,
      clock,
      new FixedIdGenerator("alert"),
      uow,
    ),
    lift: new LiftStockAlertHandler(store, staff, clock),
    receive: new ReceiveResupplyLineHandler(
      new InMemoryReceipts(),
      store,
      CATALOGUE,
      sites,
      staff,
      clock,
      new FixedIdGenerator("receipt"),
      uow,
    ),
    list: new ListSiteStockAlertsHandler(reader),
    live: new ListLiveStockAlertsHandler(reader, new SiteLabels(new Map([[VILLAGE, "Village"]]))),
  };
}

async function onlyAlertOf(
  list: ListSiteStockAlertsHandler,
  siteId: string,
): Promise<{ readonly id: string; readonly level: string }> {
  const { alerts } = await list.execute(new ListSiteStockAlertsQuery(siteId));
  expect(alerts).toHaveLength(1);
  const [alert] = alerts;
  if (alert === undefined) {
    throw new TypeError("une alerte attendue");
  }
  return alert;
}

describe("déclarer une alerte de stock", () => {
  it("ouvre l'alerte, libellé lu au catalogue, auteur figé", async () => {
    const { declare, list } = setup();

    await declare.execute(
      new DeclareStockAlertCommand(VILLAGE, "CRO", "out_of_stock", "staff_lou"),
    );

    await expect(list.execute(new ListSiteStockAlertsQuery(VILLAGE))).resolves.toEqual({
      siteId: VILLAGE,
      alerts: [
        {
          id: "alert_000001",
          siteId: VILLAGE,
          sku: "CRO",
          label: "Croissant",
          level: "out_of_stock",
          declaredAt: NOW.toISOString(),
          declaredBy: "Lou Martin",
        },
      ],
    });
  });

  it("redéclarer change l'état de l'alerte vivante, sans en ouvrir une seconde", async () => {
    const { declare, list, store } = setup();

    await declare.execute(new DeclareStockAlertCommand(VILLAGE, "CRO", "low", "staff_lou"));
    await declare.execute(
      new DeclareStockAlertCommand(VILLAGE, "CRO", "out_of_stock", "staff_lou"),
    );

    expect(store.all()).toHaveLength(1);
    await expect(onlyAlertOf(list, VILLAGE)).resolves.toMatchObject({ level: "out_of_stock" });
  });

  it("un même article a une alerte par point", async () => {
    const { declare, store } = setup();

    await declare.execute(new DeclareStockAlertCommand(VILLAGE, "CRO", "low", "staff_lou"));
    await declare.execute(new DeclareStockAlertCommand(LABO, "CRO", "low", "staff_lou"));

    expect(store.all()).toHaveLength(2);
  });

  it("refuse un article hors du catalogue publié, et un point inconnu", async () => {
    const { declare, store } = setup();

    await expect(
      declare.execute(new DeclareStockAlertCommand(VILLAGE, "XXX", "low", "staff_lou")),
    ).rejects.toThrow(ResupplyArticleUnknownError);
    await expect(
      declare.execute(new DeclareStockAlertCommand("site_inconnu", "CRO", "low", "staff_lou")),
    ).rejects.toThrow(ResupplySiteUnknownError);
    expect(store.saves).toBe(0);
  });
});

describe("lever une alerte de stock", () => {
  it("à la main : elle quitte la liste, sa trace reste", async () => {
    const { declare, lift, list, store } = setup();
    await declare.execute(new DeclareStockAlertCommand(VILLAGE, "CRO", "low", "staff_lou"));
    const { id } = await onlyAlertOf(list, VILLAGE);

    await lift.execute(new LiftStockAlertCommand(VILLAGE, id, "staff_lou"));

    await expect(list.execute(new ListSiteStockAlertsQuery(VILLAGE))).resolves.toMatchObject({
      alerts: [],
    });
    expect(store.all()[0]?.lifted).toMatchObject({ reason: "manual", at: NOW });
  });

  it("une alerte d'un autre point est introuvable", async () => {
    const { declare, lift, list } = setup();
    await declare.execute(new DeclareStockAlertCommand(VILLAGE, "CRO", "low", "staff_lou"));
    const { id } = await onlyAlertOf(list, VILLAGE);

    await expect(lift.execute(new LiftStockAlertCommand(LABO, id, "staff_lou"))).rejects.toThrow(
      StockAlertNotFoundError,
    );
  });

  it("une alerte déjà levée ne se relève pas", async () => {
    const { declare, lift, list } = setup();
    await declare.execute(new DeclareStockAlertCommand(VILLAGE, "CRO", "low", "staff_lou"));
    const { id } = await onlyAlertOf(list, VILLAGE);
    await lift.execute(new LiftStockAlertCommand(VILLAGE, id, "staff_lou"));

    await expect(lift.execute(new LiftStockAlertCommand(VILLAGE, id, "staff_lou"))).rejects.toThrow(
      StockAlertAlreadyLiftedError,
    );
  });

  it("par la réception d'une ligne de l'article au point, dans la même unité", async () => {
    const { declare, receive, list, store } = setup();
    await declare.execute(
      new DeclareStockAlertCommand(VILLAGE, "CRO", "out_of_stock", "staff_lou"),
    );
    await declare.execute(new DeclareStockAlertCommand(LABO, "CRO", "out_of_stock", "staff_lou"));
    await declare.execute(new DeclareStockAlertCommand(VILLAGE, "PAC", "low", "staff_lou"));

    await receive.execute(
      new ReceiveResupplyLineCommand(VILLAGE, "2026-01-02", "CRO", 12, "staff_lou"),
    );

    const village = await list.execute(new ListSiteStockAlertsQuery(VILLAGE));
    expect(village.alerts.map((alert) => alert.sku)).toEqual(["PAC"]);
    await expect(onlyAlertOf(list, LABO)).resolves.toMatchObject({ level: "out_of_stock" });
    expect(store.all().find((a) => a.siteId === VILLAGE && a.sku === "CRO")?.lifted).toMatchObject({
      reason: "receipt",
    });
  });

  it("une réception à zéro ne lève rien : rien n'est arrivé", async () => {
    const { declare, receive, list } = setup();
    await declare.execute(
      new DeclareStockAlertCommand(VILLAGE, "CRO", "out_of_stock", "staff_lou"),
    );

    await receive.execute(
      new ReceiveResupplyLineCommand(VILLAGE, "2026-01-02", "CRO", 0, "staff_lou"),
    );

    await expect(onlyAlertOf(list, VILLAGE)).resolves.toMatchObject({ level: "out_of_stock" });
  });

  it("jamais d'elle-même le lendemain", async () => {
    const { declare, list, live, clock } = setup();
    await declare.execute(
      new DeclareStockAlertCommand(VILLAGE, "CRO", "out_of_stock", "staff_lou"),
    );

    clock.set(new Date(NOW.getTime() + 3 * DAY_MS));

    await expect(onlyAlertOf(list, VILLAGE)).resolves.toMatchObject({ level: "out_of_stock" });
    await expect(live.execute()).resolves.toMatchObject({
      sites: [{ siteId: VILLAGE, siteLabel: "Village", alerts: [{ sku: "CRO" }] }],
    });
  });
});

describe("les alertes vivantes pour le fournil", () => {
  it("groupées par point, nom du point lu, point inconnu nommé null", async () => {
    const { declare, live } = setup();
    await declare.execute(
      new DeclareStockAlertCommand(VILLAGE, "CRO", "out_of_stock", "staff_lou"),
    );
    await declare.execute(new DeclareStockAlertCommand(LABO, "PAC", "low", "staff_lou"));

    const view = await live.execute();

    expect(view.sites).toEqual([
      expect.objectContaining({ siteId: VILLAGE, siteLabel: "Village" }),
      expect.objectContaining({ siteId: LABO, siteLabel: null }),
    ]);
  });
});
