import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
} from "../../domain/resupply-receipt-errors.js";
import {
  ResupplyNotCancellableError,
  ResupplyPastCutoffError,
  SiteResupplyNotFoundError,
} from "../../domain/site-resupply-errors.js";
import { CancelSiteResupplyCommand } from "../cancel-site-resupply.command.js";
import { CancelSiteResupplyHandler } from "../cancel-site-resupply.handler.js";
import { ListResuppliesToProduceHandler } from "../list-resupplies-to-produce.handler.js";
import { ListSiteResuppliesHandler } from "../list-site-resupplies.handler.js";
import { ListSiteResuppliesQuery } from "../list-site-resupplies.query.js";
import { PlaceSiteResupplyCommand } from "../place-site-resupply.command.js";
import { PlaceSiteResupplyHandler } from "../place-site-resupply.handler.js";
import { Catalogue, Directory, Sites } from "./resupply-doubles.js";
import {
  FixedResupplyCutoff,
  InMemorySiteResupplies,
  InMemorySiteResupplyReader,
  SiteLabels,
} from "./site-resupply-doubles.js";

/** 17 h à Paris le 2 janvier ; l'heure limite double est posée relativement à lui. */
const NOW = new Date("2026-01-02T16:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const TODAY = "2026-01-02";
const TOMORROW = "2026-01-03";
const VILLAGE = "site_village";
const LABO = "site_labo";
const CATALOGUE = new Catalogue([
  { sku: "CRO", name: "Croissant" },
  { sku: "PAC", name: "Pain au chocolat" },
]);

function setup(deadline: Date | null = null) {
  const store = new InMemorySiteResupplies();
  const reader = new InMemorySiteResupplyReader(store);
  const cutoff = new FixedResupplyCutoff(deadline);
  const clock = new FixedClock(NOW);
  const staff = new Directory({ name: "Lou Martin", role: "counter" });
  return {
    store,
    cutoff,
    clock,
    place: new PlaceSiteResupplyHandler(
      store,
      CATALOGUE,
      new Sites([VILLAGE, LABO]),
      cutoff,
      staff,
      clock,
      new FixedIdGenerator("resupply"),
    ),
    cancel: new CancelSiteResupplyHandler(store, staff, clock),
    list: new ListSiteResuppliesHandler(reader, cutoff, clock),
    toProduce: new ListResuppliesToProduceHandler(
      reader,
      new SiteLabels(new Map([[VILLAGE, "Val Village"]])),
      clock,
    ),
  };
}

describe("passer un réassort", () => {
  it("compose le brouillon au catalogue, le passe et rend son identifiant", async () => {
    const { place, list } = setup();

    const id = await place.execute(
      new PlaceSiteResupplyCommand(
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
        status: "placed",
        lines: [{ sku: "CRO", label: "Croissant", quantity: 24 }],
        placedAt: NOW.toISOString(),
        placedBy: "Lou Martin",
        cancelledAt: null,
        cancelledBy: null,
      },
    ]);
  });

  it("oppose l'heure limite de SA journée à « pour demain », et n'écrit rien", async () => {
    const { place, cutoff, store } = setup(new Date(NOW.getTime() - HOUR_MS));

    await expect(
      place.execute(
        new PlaceSiteResupplyCommand(VILLAGE, "tomorrow", [{ sku: "CRO", quantity: 1 }], "s"),
      ),
    ).rejects.toThrow(ResupplyPastCutoffError);
    expect(cutoff.asked).toEqual([TOMORROW]);
    expect(store.saves).toBe(0);
  });

  it("« au plus tôt » passe après l'heure limite, pour aujourd'hui", async () => {
    const { place, store } = setup(new Date(NOW.getTime() - HOUR_MS));

    await place.execute(
      new PlaceSiteResupplyCommand(VILLAGE, "asap", [{ sku: "PAC", quantity: 6 }], "s"),
    );

    expect(store.all().map((row) => row.serviceDay)).toEqual([TODAY]);
  });

  it("refuse un point inconnu, un article hors catalogue", async () => {
    const { place, store } = setup();
    const lines = [{ sku: "CRO", quantity: 1 }];

    await expect(
      place.execute(new PlaceSiteResupplyCommand("site_x", "asap", lines, "s")),
    ).rejects.toThrow(ResupplySiteUnknownError);
    await expect(
      place.execute(
        new PlaceSiteResupplyCommand(VILLAGE, "asap", [{ sku: "X", quantity: 1 }], "s"),
      ),
    ).rejects.toThrow(ResupplyArticleUnknownError);
    expect(store.saves).toBe(0);
  });

  it("un article donné deux fois est demandé en une ligne, quantités additionnées (R1c)", async () => {
    const { place, store } = setup();
    const lines = [{ sku: "CRO", quantity: 2 }];

    await place.execute(new PlaceSiteResupplyCommand(VILLAGE, "asap", [...lines, ...lines], "s"));

    expect(store.all()[0]?.lines).toEqual([expect.objectContaining({ sku: "CRO", quantity: 4 })]);
  });
});

describe("annuler un réassort", () => {
  it("annule sous le point de l'URL, et pas deux fois", async () => {
    const { place, cancel, list } = setup();
    const id = await place.execute(
      new PlaceSiteResupplyCommand(VILLAGE, "asap", [{ sku: "CRO", quantity: 3 }], "s"),
    );

    await cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "staff_lou"));

    const [cancelled] = (await list.execute(new ListSiteResuppliesQuery(VILLAGE))).resupplies;
    expect(cancelled).toMatchObject({ status: "cancelled", cancelledBy: "Lou Martin" });
    await expect(cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"))).rejects.toThrow(
      ResupplyNotCancellableError,
    );
  });

  it("un réassort d'un autre point est introuvable", async () => {
    const { place, cancel } = setup();
    const id = await place.execute(
      new PlaceSiteResupplyCommand(VILLAGE, "asap", [{ sku: "CRO", quantity: 3 }], "s"),
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
      place.execute(new PlaceSiteResupplyCommand(siteId, target, [{ sku, quantity }], "s"));
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
