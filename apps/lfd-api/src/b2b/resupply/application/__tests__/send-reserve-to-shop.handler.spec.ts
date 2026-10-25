import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  ReserveShopRelease,
  type ShopRelease,
} from "../../../../packing/channels/commerce/index.js";
import { ServiceDay } from "../../../../production/channels/commerce/index.js";
import { FixedClosedPlans } from "../../../orders/application/commands/__tests__/plan-doubles.js";
import {
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
} from "../../domain/resupply-receipt-errors.js";
import { EmptyResupplyError, ReserveNotTodayError } from "../../domain/site-resupply-errors.js";
import type { SiteResupply } from "../../domain/site-resupply.js";
import { GetResupplyProductionDayHandler } from "../get-resupply-production-day.handler.js";
import { GetResupplyProductionDayQuery } from "../get-resupply-production-day.query.js";
import { ListResuppliesToProduceHandler } from "../list-resupplies-to-produce.handler.js";
import { ProductionDayResupplies } from "../production-day-resupplies.js";
import { SendReserveToShopCommand } from "../send-reserve-to-shop.command.js";
import { SendReserveToShopHandler } from "../send-reserve-to-shop.handler.js";
import { Catalogue, Directory, Sites } from "./resupply-doubles.js";
import {
  FixedTransferServedSites,
  InMemorySiteResupplies,
  InMemorySiteResupplyReader,
  SiteLabels,
} from "./site-resupply-doubles.js";

/**
 * « Envoyer en boutique » depuis la réserve (plan A1, lot A1.4). L'horloge
 * est fixée ; les journées sont le sujet, jamais comparées au mur.
 */
const NOW = new Date("2026-01-02T08:00:00Z");
const TODAY = "2026-01-02";
const VILLAGE = "site_village";
const KEY = "panel_key_1";
const CATALOGUE = new Catalogue([
  { sku: "CRO", name: "Croissant", categoryId: "fam_morning", categoryName: "Viennoiseries" },
  { sku: "BAG", name: "Baguette", categoryId: "fam_bread", categoryName: "Pains" },
]);

/** Le colisage doublé : retient chaque sortie, et combien de réassorts étaient écrits à cet instant. */
class RecordingRelease extends ReserveShopRelease {
  readonly sent: ShopRelease[] = [];
  readonly savesAtSend: number[] = [];

  constructor(
    private readonly store: InMemorySiteResupplies,
    private readonly refusal: Error | null = null,
  ) {
    super();
  }

  send(release: ShopRelease): Promise<void> {
    this.savesAtSend.push(this.store.saves);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.sent.push(release);
    return Promise.resolve();
  }
}

/**
 * Deux envois de la même clé qui se croisent : chacun a lu « pas encore
 * écrit » avant que l'autre ne valide — `load` ne voit rien, la clé primaire
 * refuse le second.
 */
class RacingSiteResupplies extends InMemorySiteResupplies {
  override load(): Promise<SiteResupply | null> {
    return Promise.resolve(null);
  }
}

function setup(refusal: Error | null = null, store = new InMemorySiteResupplies()) {
  const reader = new InMemorySiteResupplyReader(store);
  const release = new RecordingRelease(store, refusal);
  const clock = new FixedClock(NOW);
  const labels = new SiteLabels(new Map([[VILLAGE, "Village"]]));
  const handler = new SendReserveToShopHandler(
    store,
    CATALOGUE,
    new Sites([VILLAGE]),
    labels,
    new Directory({ name: "Lou Martin", role: "supervisor" }),
    clock,
    release,
    new DirectUnitOfWork(),
  );
  const send = (lines: readonly { sku: string; quantity: number }[], key = KEY, day = TODAY) =>
    handler.execute(new SendReserveToShopCommand(day, VILLAGE, key, lines, "staff_1"));
  return { store, reader, release, clock, labels, send };
}

describe("SendReserveToShopHandler — envoyer en boutique depuis la réserve", () => {
  it("écrit un réassort `reserve` envoyé « au plus tôt », PUIS fait sortir la réserve", async () => {
    const { store, release, send } = setup();

    const id = await send([
      { sku: "CRO", quantity: 4 },
      { sku: "CRO", quantity: 2 },
      { sku: "BAG", quantity: 3 },
    ]);

    expect(id).toBe(KEY);
    expect(store.all()).toEqual([
      expect.objectContaining({
        id: KEY,
        siteId: VILLAGE,
        origin: "reserve",
        target: "asap",
        serviceDay: TODAY,
        lines: [
          expect.objectContaining({ sku: "CRO", label: "Croissant", quantity: 6 }),
          expect.objectContaining({ sku: "BAG", label: "Baguette", quantity: 3 }),
        ],
      }),
    ]);
    expect(release.savesAtSend).toEqual([1]);
    expect(release.sent).toEqual([
      {
        serviceDay: TODAY,
        siteId: VILLAGE,
        siteLabel: "Village",
        resupplyId: KEY,
        lines: [
          { sku: "CRO", productName: "Croissant", quantity: 6 },
          { sku: "BAG", productName: "Baguette", quantity: 3 },
        ],
      },
    ]);
  });

  it("un second envoi avec la même clé ne fait rien", async () => {
    const { store, release, send } = setup();

    await send([{ sku: "CRO", quantity: 4 }]);
    await send([{ sku: "CRO", quantity: 4 }]);

    expect(store.saves).toBe(1);
    expect(release.sent).toHaveLength(1);
  });

  it("deux envois de la même clé qui se croisent : le second rend la même clé, sans rien sortir", async () => {
    const { store, release, send } = setup(null, new RacingSiteResupplies());

    await send([{ sku: "CRO", quantity: 4 }]);
    await expect(send([{ sku: "CRO", quantity: 4 }])).resolves.toBe(KEY);

    expect(store.saves).toBe(1);
    expect(release.sent).toHaveLength(1);
  });

  it("refuse la réserve d'un autre jour que celui du geste, sans rien écrire ni sortir", async () => {
    const { store, release, send } = setup();

    await expect(send([{ sku: "CRO", quantity: 4 }], KEY, "2026-01-01")).rejects.toThrow(
      ReserveNotTodayError,
    );
    expect(store.saves).toBe(0);
    expect(release.sent).toEqual([]);
  });

  it("le refus du colisage remonte tel quel : rien n'est réputé envoyé", async () => {
    const refusal = new Error("libre insuffisant");
    const { send } = setup(refusal);

    await expect(send([{ sku: "CRO", quantity: 40 }])).rejects.toBe(refusal);
  });

  it("refuse un article hors catalogue, ou aucune ligne — sans rien sortir", async () => {
    const { store, release, send } = setup();

    await expect(send([{ sku: "XXX", quantity: 1 }])).rejects.toThrow(ResupplyArticleUnknownError);
    await expect(send([])).rejects.toThrow(EmptyResupplyError);
    expect(store.saves).toBe(0);
    expect(release.sent).toEqual([]);
  });

  it("refuse un point inconnu", async () => {
    const { store } = setup();
    const handler = new SendReserveToShopHandler(
      store,
      CATALOGUE,
      new Sites([]),
      new SiteLabels(new Map()),
      new Directory({ name: "Lou Martin", role: "supervisor" }),
      new FixedClock(NOW),
      new RecordingRelease(store),
      new DirectUnitOfWork(),
    );

    await expect(
      handler.execute(
        new SendReserveToShopCommand(TODAY, "nowhere", KEY, [{ sku: "CRO", quantity: 1 }], "s"),
      ),
    ).rejects.toThrow(ResupplySiteUnknownError);
  });
});

/** § 1 : une sortie de réserve n'est jamais proposée au fournil. */
describe("une sortie de réserve n'entre jamais chez le fournil (A1.4)", () => {
  it("ni lançable, ni à produire, ni dans l'onglet de Prod manager", async () => {
    const { reader, clock, labels, send } = setup();
    await send([{ sku: "CRO", quantity: 4 }]);

    const launchable = await new ProductionDayResupplies(
      reader,
      labels,
      new FixedTransferServedSites([VILLAGE]),
    ).asapToLaunch(ServiceDay.of(TODAY), KEY);
    const toProduce = await new ListResuppliesToProduceHandler(
      reader,
      labels,
      clock,
      new FixedClosedPlans([]),
    ).execute();
    const tab = await new GetResupplyProductionDayHandler(
      reader,
      labels,
      new FixedClosedPlans([]),
      CATALOGUE,
      new FixedTransferServedSites([VILLAGE]),
    ).execute(new GetResupplyProductionDayQuery(TODAY));

    expect(launchable).toBeNull();
    expect(toProduce.days.flatMap((day) => day.sites)).toEqual([]);
    expect(tab.sites).toEqual([]);
    expect(tab.totals).toEqual([]);
  });
});
