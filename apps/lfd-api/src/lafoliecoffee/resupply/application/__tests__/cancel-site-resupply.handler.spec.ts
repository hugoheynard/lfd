import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RecordingAdmissionDesk } from "../../../orders/application/commands/__tests__/plan-doubles.js";
import type { SiteResupply, SiteResupplySnapshot } from "../../domain/site-resupply.js";
import { SiteResupplyNotFoundError } from "../../domain/site-resupply-errors.js";
import { CancelSiteResupplyCommand } from "../cancel-site-resupply.command.js";
import { CancelSiteResupplyHandler } from "../cancel-site-resupply.handler.js";
import { ResupplyPlanGate } from "../resupply-plan-gate.js";
import { Directory } from "./resupply-doubles.js";
import {
  FixedLaunches,
  InMemorySiteResupplies,
  InMemorySiteResupplyPlanKeys,
  KnownReceptions,
} from "./site-resupply-doubles.js";

/**
 * L'annulation prend le verrou de la journée AVANT de charger l'agrégat
 * (2026-11-02). Régression : elle chargeait le réassort, puis verrouillait —
 * la décision portait sur un état lu hors du verrou qui la garde. Instants
 * recopiés, jamais comparés à l'horloge — exception étroite du §5.
 */

const AT = new Date("2026-01-02T08:00:00Z");
const SITE = "site_village";
const AUTHOR = { staffUserId: "staff_lou", name: "Lou Martin", role: "counter" };

const PLACED: SiteResupplySnapshot = {
  id: "rs_1",
  siteId: SITE,
  target: "tomorrow",
  serviceDay: "2026-01-03",
  version: 2,
  origin: "counter",
  name: null,
  lines: [{ sku: "CRO", label: "Croissant", quantity: 6, saleUnit: "piece" }],
  placed: { at: AT, author: AUTHOR },
  cancelled: null,
  arrived: null,
};

/** Le dépôt en mémoire, qui note chaque chargement dans la trace commune. */
class TracingResupplies extends InMemorySiteResupplies {
  constructor(private readonly trace: string[]) {
    super();
  }

  override load(siteId: string, resupplyId: string): Promise<SiteResupply | null> {
    this.trace.push("load");
    return super.load(siteId, resupplyId);
  }
}

function subject() {
  const trace: string[] = [];
  const store = new TracingResupplies(trace);
  store.put(PLACED);
  const desk = new RecordingAdmissionDesk([], () => trace.push("hold"));
  const handler = new CancelSiteResupplyHandler(
    store,
    new InMemorySiteResupplyPlanKeys(store, trace),
    new KnownReceptions(),
    new Directory({ name: "Lou Martin", role: "counter" }),
    new FixedClock(AT),
    new ResupplyPlanGate(desk, new FixedLaunches()),
    new DirectUnitOfWork(),
  );
  return { handler, store, trace, desk };
}

describe("CancelSiteResupplyHandler — verrou, puis chargement", () => {
  it("lit la clé, verrouille la journée, PUIS charge l'agrégat qu'il annule", async () => {
    const { handler, store, trace, desk } = subject();

    await handler.execute(new CancelSiteResupplyCommand(SITE, "rs_1", "staff_lou"));

    expect(desk.held).toEqual(["2026-01-03"]);
    expect(trace).toEqual(["keyOf", "hold", "load"]);
    expect(store.all()[0]?.cancelled).not.toBeNull();
  });

  it("un réassort d'un autre point est introuvable, sans prendre le verrou", async () => {
    const { handler, desk } = subject();

    await expect(
      handler.execute(new CancelSiteResupplyCommand("site_labo", "rs_1", "staff_lou")),
    ).rejects.toBeInstanceOf(SiteResupplyNotFoundError);
    expect(desk.held).toEqual([]);
  });
});
