import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ResupplyLaunchedEvent } from "../../../../production/channels/commerce/index.js";
import {
  FixedClosedPlans,
  RecordingAdmissionDesk,
} from "../../../orders/application/commands/__tests__/plan-doubles.js";
import { ResupplyLaunchedNotCancellableError } from "../../domain/site-resupply-errors.js";
import { CancelSiteResupplyCommand } from "../cancel-site-resupply.command.js";
import { CancelSiteResupplyHandler } from "../cancel-site-resupply.handler.js";
import { ListResuppliesToProduceHandler } from "../list-resupplies-to-produce.handler.js";
import { ListSiteResuppliesHandler } from "../list-site-resupplies.handler.js";
import { ListSiteResuppliesQuery } from "../list-site-resupplies.query.js";
import { RecordLaunchOnResupplyLaunched } from "../record-launch-on-resupply-launched.handler.js";
import { ResupplyPlanGate } from "../resupply-plan-gate.js";
import { SendBakehouseResupplyCommand } from "../send-bakehouse-resupply.command.js";
import { SendBakehouseResupplyHandler } from "../send-bakehouse-resupply.handler.js";
import { Catalogue, Directory, Sites } from "./resupply-doubles.js";
import {
  FixedLaunches,
  FixedResupplyCutoff,
  InMemoryResupplyUsedNames,
  InMemorySiteResupplies,
  InMemorySiteResupplyReader,
  KnownReceptions,
  SiteLabels,
} from "./site-resupply-doubles.js";

/**
 * Le commerce face au lancement d'un « au plus tôt » (R4a,
 * `reassort-boutiques/plan-au-plus-tot.md` §2) : l'annulation refusée sur la
 * réponse du fournil, sous le verrou ; l'affichage « lancé » posé par le
 * fait. L'horloge fixe n'est comparée qu'aux journées qu'elle-même désigne.
 */
const NOW = new Date("2026-01-02T08:00:00Z");
const LAUNCHED_AT = new Date("2026-01-02T08:30:00Z");
const TODAY = "2026-01-02";
const VILLAGE = "site_village";
const CATALOGUE = new Catalogue([
  { sku: "CRO", name: "Croissant", categoryId: "fam_morning", categoryName: "Viennoiseries" },
]);

function setup() {
  const store = new InMemorySiteResupplies();
  const reader = new InMemorySiteResupplyReader(store);
  const clock = new FixedClock(NOW);
  const staff = new Directory({ name: "Lou Martin", role: "counter" });
  const launches = new FixedLaunches();
  const gate = new ResupplyPlanGate(new RecordingAdmissionDesk([]), launches);
  const uow = new DirectUnitOfWork();
  const cutoff = new FixedResupplyCutoff(null);
  return {
    store,
    launches,
    place: new SendBakehouseResupplyHandler(
      store,
      CATALOGUE,
      new Sites([VILLAGE]),
      cutoff,
      staff,
      clock,
      new FixedIdGenerator("resupply"),
      gate,
      uow,
    ),
    cancel: new CancelSiteResupplyHandler(store, new KnownReceptions(), staff, clock, gate, uow),
    list: new ListSiteResuppliesHandler(
      reader,
      cutoff,
      clock,
      new InMemoryResupplyUsedNames(store),
    ),
    toProduce: new ListResuppliesToProduceHandler(
      reader,
      new SiteLabels(new Map([[VILLAGE, "Le Village"]])),
      clock,
      new FixedClosedPlans([]),
    ),
    onLaunched: new RecordLaunchOnResupplyLaunched(store),
  };
}

function launched(resupplyId: string, siteId = VILLAGE) {
  const fact = new ResupplyLaunchedEvent(TODAY, LAUNCHED_AT, "s_max", "Max Martin", {
    resupplyId,
    siteId,
    siteLabel: "Le Village",
    name: null,
    servedByTransfer: true,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 3 }],
  }).durableFact();
  return { eventId: "evt_1", type: fact.type, payload: fact.payload };
}

async function sendAsap(place: SendBakehouseResupplyHandler): Promise<string> {
  return place.execute(
    new SendBakehouseResupplyCommand(VILLAGE, "asap", [{ sku: "CRO", quantity: 3 }], "s"),
  );
}

describe("annuler un « au plus tôt » lancé (R4a)", () => {
  it("🔴 refuse quand le fournil répond « lancé », sous le verrou, sans rien écrire", async () => {
    const { place, cancel, list, launches, store } = setup();
    const id = await sendAsap(place);
    launches.launched.add(id);
    const saves = store.saves;

    await expect(cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"))).rejects.toThrow(
      ResupplyLaunchedNotCancellableError,
    );

    expect(launches.asked).toEqual([`${TODAY}:${id}`]);
    expect(store.saves).toBe(saves);
    const [kept] = (await list.execute(new ListSiteResuppliesQuery(VILLAGE))).resupplies;
    expect(kept?.status).toBe("placed");
  });

  it("annule quand le fournil ne l'a pas lancé — l'affichage ne décide pas", async () => {
    const { place, cancel, onLaunched, list } = setup();
    const id = await sendAsap(place);
    await onLaunched.handle(launched(id));

    await cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"));

    const [cancelled] = (await list.execute(new ListSiteResuppliesQuery(VILLAGE))).resupplies;
    expect(cancelled?.status).toBe("cancelled");
  });

  it("ne pose pas la question au fournil pour un « pour demain »", async () => {
    const { place, cancel, launches } = setup();
    const id = await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "tomorrow", [{ sku: "CRO", quantity: 3 }], "s"),
    );

    await cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"));

    expect(launches.asked).toEqual([]);
  });
});

describe("l'affichage « Lancé par X à HH:MM » (R4a)", () => {
  it("le fait du fournil le pose, à son instant et au nom figé ; rejoué, rien de plus", async () => {
    const { place, onLaunched, list, store } = setup();
    const id = await sendAsap(place);

    await onLaunched.handle(launched(id));
    const saves = store.saves;
    await onLaunched.handle(launched(id));

    const [view] = (await list.execute(new ListSiteResuppliesQuery(VILLAGE))).resupplies;
    expect(view).toMatchObject({
      launchedAt: LAUNCHED_AT.toISOString(),
      launchedBy: "Max Martin",
    });
    expect(store.saves).toBe(saves);
  });

  it("un réassort introuvable sous son point est écarté, sans lever", async () => {
    const { place, onLaunched, store } = setup();
    const id = await sendAsap(place);
    const saves = store.saves;

    await onLaunched.handle(launched(id, "site_other"));

    expect(store.saves).toBe(saves);
  });

  it("« Réassorts à produire » ne montre plus un lancé : il est au plan du jour", async () => {
    const { place, onLaunched, toProduce } = setup();
    const kept = await sendAsap(place);
    const gone = await sendAsap(place);
    await onLaunched.handle(launched(gone));

    const [today] = (await toProduce.execute()).days;

    expect(today?.sites.flatMap((site) => site.resupplies.map((r) => r.id))).toEqual([kept]);
  });
});
