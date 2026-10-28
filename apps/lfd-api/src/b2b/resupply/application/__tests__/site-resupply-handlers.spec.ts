import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
} from "../../domain/resupply-receipt-errors.js";
import {
  FixedClosedPlans,
  RecordingAdmissionDesk,
} from "../../../orders/application/commands/__tests__/plan-doubles.js";
import {
  BakehouseResupplyAfterStopError,
  ResupplyAlreadyReceivedNotCancellableError,
  ResupplyFrozenInPlanError,
  ResupplyNotCancellableError,
  SiteResupplyNotFoundError,
} from "../../domain/site-resupply-errors.js";
import { CancelSiteResupplyCommand } from "../cancel-site-resupply.command.js";
import { CancelSiteResupplyHandler } from "../cancel-site-resupply.handler.js";
import { ListResuppliesToProduceHandler } from "../list-resupplies-to-produce.handler.js";
import { ListSiteResuppliesHandler } from "../list-site-resupplies.handler.js";
import { ListSiteResuppliesQuery } from "../list-site-resupplies.query.js";
import { ResupplyPlanGate } from "../resupply-plan-gate.js";
import { SendBakehouseResupplyCommand } from "../send-bakehouse-resupply.command.js";
import { SendBakehouseResupplyHandler } from "../send-bakehouse-resupply.handler.js";
import { Catalogue, Directory, Sites } from "./resupply-doubles.js";
import {
  FixedResupplyCutoff,
  InMemorySiteResupplies,
  KnownReceptions,
  InMemorySiteResupplyReader,
  SiteLabels,
  InMemoryResupplyUsedNames,
  FixedLaunches,
} from "./site-resupply-doubles.js";

/** 17 h à Paris le 2 janvier ; l'heure limite double est posée relativement à lui. */
const NOW = new Date("2026-01-02T16:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const TODAY = "2026-01-02";
const TOMORROW = "2026-01-03";
const VILLAGE = "site_village";
const LABO = "site_labo";
const CATALOGUE = new Catalogue([
  {
    sku: "CRO",
    name: "Croissant",
    categoryId: "fam_morning",
    categoryName: "Viennoiseries",
    saleUnit: "piece",
  },
  {
    sku: "PAC",
    name: "Pain au chocolat",
    categoryId: "fam_morning",
    categoryName: "Viennoiseries",
    saleUnit: "piece",
  },
]);

/**
 * `stopped` : les journées dont le plan est arrêté (lot R3a) — le guichet
 * doublé les dit closes, et note chaque journée qu'on lui fait tenir.
 */
function setup(deadline: Date | null = null, stopped: readonly string[] = []) {
  const store = new InMemorySiteResupplies();
  const reader = new InMemorySiteResupplyReader(store);
  const cutoff = new FixedResupplyCutoff(deadline);
  const clock = new FixedClock(NOW);
  const staff = new Directory({ name: "Lou Martin", role: "counter" });
  const receptions = new KnownReceptions();
  const desk = new RecordingAdmissionDesk(stopped);
  const launches = new FixedLaunches();
  const gate = new ResupplyPlanGate(desk, launches);
  const uow = new DirectUnitOfWork();
  return {
    store,
    receptions,
    cutoff,
    clock,
    desk,
    place: new SendBakehouseResupplyHandler(
      store,
      CATALOGUE,
      new Sites([VILLAGE, LABO]),
      cutoff,
      staff,
      clock,
      new FixedIdGenerator("resupply"),
      gate,
      uow,
    ),
    cancel: new CancelSiteResupplyHandler(store, receptions, staff, clock, gate, uow),
    list: new ListSiteResuppliesHandler(
      reader,
      cutoff,
      clock,
      new InMemoryResupplyUsedNames(store),
    ),
    toProduce: new ListResuppliesToProduceHandler(
      reader,
      new SiteLabels(new Map([[VILLAGE, "Val Village"]])),
      clock,
      new FixedClosedPlans(stopped),
    ),
  };
}

describe("le fournil envoie un réassort (R1d)", () => {
  it("le compose au catalogue, l'envoie d'un geste, signé du fournil, et rend son identifiant", async () => {
    const { place, list } = setup();

    const id = await place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        "tomorrow",
        [{ sku: "CRO", quantity: 24 }],
        "staff_lou",
      ),
    );

    const view = await list.execute(new ListSiteResuppliesQuery(VILLAGE));
    expect(id).toBe("resupply_000001");
    expect(view).toMatchObject({ today: TODAY, tomorrow: TOMORROW, tomorrowOrderUntil: null });
    expect(view.resupplies).toEqual([
      {
        id,
        siteId: VILLAGE,
        serviceDay: TOMORROW,
        target: "tomorrow",
        origin: "bakehouse",
        name: null,
        status: "placed",
        lines: [{ sku: "CRO", label: "Croissant", quantity: 24 }],
        placedAt: NOW.toISOString(),
        placedBy: "Lou Martin",
        cancelledAt: null,
        cancelledBy: null,
        arrivedAt: null,
        arrivedBy: null,
        launchedAt: null,
        launchedBy: null,
        departedAt: null,
        departedBy: null,
      },
    ]);
  });

  it("oppose l'heure du réassort de SA journée à « pour demain », et n'écrit rien", async () => {
    const { place, cutoff, store } = setup(new Date(NOW.getTime() - HOUR_MS));

    const refusal = place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "tomorrow", [{ sku: "CRO", quantity: 1 }], "s"),
    );

    // Lot R3a : le message parle au fournil, et lui donne son recours.
    await expect(refusal).rejects.toThrow(BakehouseResupplyAfterStopError);
    await expect(refusal).rejects.toThrow(/hors plan/u);
    expect(cutoff.asked).toEqual([TOMORROW]);
    expect(store.saves).toBe(0);
  });

  it("« pour demain » se tient au guichet du plan, sous le verrou de SA journée (R3a)", async () => {
    const { place, desk } = setup();

    await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "tomorrow", [{ sku: "CRO", quantity: 1 }], "s"),
    );
    await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "asap", [{ sku: "CRO", quantity: 1 }], "s"),
    );

    // « Au plus tôt » n'entre pas au plan : aucun verrou.
    expect(desk.held).toEqual([TOMORROW]);
  });

  it("refuse « pour demain » quand le plan est déjà arrêté, même avant l'heure (R3a)", async () => {
    const { place, store } = setup(null, [TOMORROW]);

    await expect(
      place.execute(
        new SendBakehouseResupplyCommand(VILLAGE, "tomorrow", [{ sku: "CRO", quantity: 1 }], "s"),
      ),
    ).rejects.toThrow(BakehouseResupplyAfterStopError);
    expect(store.saves).toBe(0);
  });

  it("« au plus tôt » passe après l'heure limite, pour aujourd'hui", async () => {
    const { place, store } = setup(new Date(NOW.getTime() - HOUR_MS));

    await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "asap", [{ sku: "PAC", quantity: 6 }], "s"),
    );

    expect(store.all().map((row) => row.serviceDay)).toEqual([TODAY]);
  });

  it("refuse un point inconnu, un article hors catalogue", async () => {
    const { place, store } = setup();
    const lines = [{ sku: "CRO", quantity: 1 }];

    await expect(
      place.execute(new SendBakehouseResupplyCommand("site_x", "asap", lines, "s")),
    ).rejects.toThrow(ResupplySiteUnknownError);
    await expect(
      place.execute(
        new SendBakehouseResupplyCommand(VILLAGE, "asap", [{ sku: "X", quantity: 1 }], "s"),
      ),
    ).rejects.toThrow(ResupplyArticleUnknownError);
    expect(store.saves).toBe(0);
  });

  it("un article donné deux fois est demandé en une ligne, quantités additionnées (R1c)", async () => {
    const { place, store } = setup();
    const lines = [{ sku: "CRO", quantity: 2 }];

    await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "asap", [...lines, ...lines], "s"),
    );

    expect(store.all()[0]?.lines).toEqual([expect.objectContaining({ sku: "CRO", quantity: 4 })]);
  });
});

describe("annuler un réassort", () => {
  it("annule sous le point de l'URL, et pas deux fois", async () => {
    const { place, cancel, list } = setup();
    const id = await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "asap", [{ sku: "CRO", quantity: 3 }], "s"),
    );

    await cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "staff_lou"));

    const [cancelled] = (await list.execute(new ListSiteResuppliesQuery(VILLAGE))).resupplies;
    expect(cancelled).toMatchObject({ status: "cancelled", cancelledBy: "Lou Martin" });
    await expect(cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"))).rejects.toThrow(
      ResupplyNotCancellableError,
    );
  });

  /** Trou laissé par R2 : un réassort arrivé et réceptionné s'annulait encore. */
  it("refuse d'annuler un réassort déjà réceptionné, en nommant qui et à quelle heure", async () => {
    const { place, cancel, receptions, store } = setup();
    const id = await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "asap", [{ sku: "CRO", quantity: 3 }], "s"),
    );
    receptions.receive(VILLAGE, id, {
      at: NOW,
      author: { staffUserId: "staff_lea", name: "Léa Roux", role: "counter" },
    });

    const refusal = cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"));

    await expect(refusal).rejects.toThrow(ResupplyAlreadyReceivedNotCancellableError);
    await expect(refusal).rejects.toThrow(/réceptionné par Léa Roux à 17:00/u);
    expect(receptions.asked).toEqual([`${VILLAGE}:${id}`]);
    expect(store.all()[0]?.cancelled).toBeNull();
  });

  /** Lot R3a, Q3 : figé dans un plan arrêté, il ne s'annule plus. */
  it("refuse d'annuler un réassort « pour demain » figé dans un plan arrêté", async () => {
    const open = setup();
    const id = await open.place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "tomorrow", [{ sku: "CRO", quantity: 3 }], "s"),
    );
    const { cancel, store, desk } = setup(null, [TOMORROW]);
    for (const row of open.store.all()) {
      store.put(row);
    }

    const refusal = cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"));

    await expect(refusal).rejects.toThrow(ResupplyFrozenInPlanError);
    await expect(refusal).rejects.toThrow(/réceptionnez-le avec un écart/iu);
    expect(desk.held).toEqual([TOMORROW]);
    expect(store.all()[0]?.cancelled).toBeNull();
  });

  it("un réassort « au plus tôt » s'annule même quand le plan du jour est arrêté", async () => {
    const { place, cancel, store } = setup(null, [TODAY]);
    const id = await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "asap", [{ sku: "CRO", quantity: 3 }], "s"),
    );

    await cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"));

    expect(store.all()[0]?.cancelled).not.toBeNull();
  });

  it("un réassort d'un autre point est introuvable", async () => {
    const { place, cancel } = setup();
    const id = await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "asap", [{ sku: "CRO", quantity: 3 }], "s"),
    );

    await expect(cancel.execute(new CancelSiteResupplyCommand(LABO, id, "s"))).rejects.toThrow(
      SiteResupplyNotFoundError,
    );
  });
});

describe("les réassorts à produire", () => {
  it("par journée puis par point, sans les annulés, avec le cumul par article", async () => {
    const { place, cancel, toProduce } = setup();
    const order = (siteId: string, target: "asap" | "tomorrow", sku: string, quantity: number) =>
      place.execute(new SendBakehouseResupplyCommand(siteId, target, [{ sku, quantity }], "s"));
    await order(VILLAGE, "asap", "CRO", 10);
    await order(LABO, "asap", "CRO", 5);
    await order(VILLAGE, "tomorrow", "PAC", 7);
    const dropped = await order(LABO, "tomorrow", "PAC", 99);
    await cancel.execute(new CancelSiteResupplyCommand(LABO, dropped, "s"));

    const view = await toProduce.execute();

    expect(view.days.map((day) => day.serviceDay)).toEqual([TODAY, TOMORROW]);
    const [today, tomorrow] = view.days;
    expect(today?.sites.map((site) => [site.siteId, site.siteLabel])).toEqual([
      [VILLAGE, "Val Village"],
      [LABO, null],
    ]);
    expect(today?.totals).toEqual([{ sku: "CRO", label: "Croissant", quantity: 15 }]);
    expect(tomorrow?.totals).toEqual([{ sku: "PAC", label: "Pain au chocolat", quantity: 7 }]);
  });
});

describe("les réassorts à produire, une fois le plan arrêté (R3a)", () => {
  it("ne montre plus un « pour demain » figé dans un plan arrêté ; « au plus tôt » reste", async () => {
    const open = setup();
    const send = (target: "asap" | "tomorrow", quantity: number) =>
      open.place.execute(
        new SendBakehouseResupplyCommand(VILLAGE, target, [{ sku: "CRO", quantity }], "s"),
      );
    await send("asap", 4);
    await send("tomorrow", 9);
    const stopped = setup(null, [TOMORROW]);
    for (const row of open.store.all()) {
      stopped.store.put(row);
    }

    const [today, tomorrow] = (await stopped.toProduce.execute()).days;

    expect(today?.totals).toEqual([{ sku: "CRO", label: "Croissant", quantity: 4 }]);
    expect(tomorrow?.sites).toEqual([]);
    expect(tomorrow?.totals).toEqual([]);
  });
});
