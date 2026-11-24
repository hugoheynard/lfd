import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import {
  InvalidResupplyArrivalTimeError,
  ResupplyArrivalRequiredError,
} from "../../domain/resupply-arrival-errors.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RecordingAdmissionDesk } from "../../../orders/application/commands/__tests__/plan-doubles.js";
import type { SiteResupply, SiteResupplySnapshot } from "../../domain/site-resupply.js";
import {
  SiteResupplyChangedMeanwhileError,
  SiteResupplyNotFoundError,
} from "../../domain/site-resupply-errors.js";
import { ResupplyPlanGate } from "../resupply-plan-gate.js";
import { SendSiteResupplyCommand } from "../send-site-resupply.command.js";
import { SendSiteResupplyHandler } from "../send-site-resupply.handler.js";
import { Directory } from "./resupply-doubles.js";
import {
  FixedLaunches,
  FixedResupplyCutoff,
  InMemorySiteResupplies,
  InMemorySiteResupplyPlanKeys,
} from "./site-resupply-doubles.js";

/**
 * L'envoi du comptoir (audit du 2026-11-02) : le verrou de la journée AVANT
 * le chargement, comme l'annulation, et le double clic sans erreur (D5).
 * Instants recopiés, comparés entre eux seulement — exception étroite du §5.
 */

const AT = new Date("2026-01-02T08:00:00Z");
const SITE = "site_village";
const SEEN = 3;

const DRAFT: SiteResupplySnapshot = {
  id: "rs_1",
  siteId: SITE,
  target: "tomorrow",
  serviceDay: "2026-01-03",
  version: SEEN,
  origin: "counter",
  name: null,
  arrivalBy: "06:30",
  lines: [{ sku: "CRO", label: "Croissant", quantity: 6, saleUnit: "piece" }],
  placed: null,
  cancelled: null,
  arrived: null,
};

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
  store.put(DRAFT);
  const desk = new RecordingAdmissionDesk([], () => trace.push("hold"));
  const handler = new SendSiteResupplyHandler(
    store,
    new InMemorySiteResupplyPlanKeys(store, trace),
    new FixedResupplyCutoff(null),
    new Directory({ name: "Lou Martin", role: "counter" }),
    new FixedClock(AT),
    new ResupplyPlanGate(desk, new FixedLaunches()),
    new DirectUnitOfWork(),
  );
  return { handler, store, trace, desk };
}

describe("SendSiteResupplyHandler — verrou, puis chargement", () => {
  /** Régression : l'envoi chargeait et jugeait la demande AVANT de prendre le verrou de sa journée. */
  it("lit la clé, verrouille la journée, PUIS charge la demande qu'il envoie", async () => {
    const { handler, store, trace, desk } = subject();

    await handler.execute(new SendSiteResupplyCommand(SITE, "rs_1", SEEN, "staff_lou"));

    expect(desk.held).toEqual(["2026-01-03"]);
    expect(trace).toEqual(["keyOf", "hold", "load"]);
    expect(store.all()[0]?.placed).not.toBeNull();
  });

  it("une demande d'un autre point est introuvable, sans prendre le verrou", async () => {
    const { handler, desk } = subject();

    await expect(
      handler.execute(new SendSiteResupplyCommand("site_labo", "rs_1", SEEN, "staff_lou")),
    ).rejects.toBeInstanceOf(SiteResupplyNotFoundError);
    expect(desk.held).toEqual([]);
  });
});

describe("SendSiteResupplyHandler — le double clic (D5)", () => {
  /** Régression : le second clic d'un double clic sur « Envoyer » rendait 409 au comptoir. */
  it("un second envoi de la MÊME version déjà partie réussit sans rien écrire", async () => {
    const { handler, store } = subject();
    await handler.execute(new SendSiteResupplyCommand(SITE, "rs_1", SEEN, "staff_lou"));
    const saves = store.saves;

    await handler.execute(new SendSiteResupplyCommand(SITE, "rs_1", SEEN, "staff_lou"));

    expect(store.saves).toBe(saves);
    expect(store.all()[0]?.version).toBe(SEEN + 1);
  });

  it("une version plus ancienne que celle qui est partie reste refusée", async () => {
    const { handler } = subject();
    await handler.execute(new SendSiteResupplyCommand(SITE, "rs_1", SEEN, "staff_lou"));

    await expect(
      handler.execute(new SendSiteResupplyCommand(SITE, "rs_1", SEEN - 1, "staff_lou")),
    ).rejects.toBeInstanceOf(SiteResupplyChangedMeanwhileError);
  });
});

describe("SendSiteResupplyHandler — l'heure d'arrivée (H1)", () => {
  const arrival = (store: ReturnType<typeof subject>["store"]) => store.all()[0]?.arrivalBy;

  it("pose l'heure envoyée avec la demande, puis l'envoie", async () => {
    const { handler, store } = subject();

    await handler.execute(new SendSiteResupplyCommand(SITE, "rs_1", SEEN, "staff_lou", "05:15"));

    expect(arrival(store)).toBe("05:15");
    expect(store.all()[0]?.placed).not.toBeNull();
  });

  it("sans heure dans la requête, celle déjà posée sur la demande part", async () => {
    const { handler, store } = subject();

    await handler.execute(new SendSiteResupplyCommand(SITE, "rs_1", SEEN, "staff_lou"));

    expect(arrival(store)).toBe("06:30");
  });

  it("« pour demain » dont on retire l'heure est refusé, et rien n'est écrit", async () => {
    const { handler, store } = subject();
    const saves = store.saves;

    await expect(
      handler.execute(new SendSiteResupplyCommand(SITE, "rs_1", SEEN, "staff_lou", null)),
    ).rejects.toBeInstanceOf(ResupplyArrivalRequiredError);
    expect(store.saves).toBe(saves);
    expect(store.all()[0]?.placed).toBeNull();
  });

  it("une heure mal formée est refusée en nommant la forme", async () => {
    const { handler } = subject();

    await expect(
      handler.execute(new SendSiteResupplyCommand(SITE, "rs_1", SEEN, "staff_lou", "6h30")),
    ).rejects.toBeInstanceOf(InvalidResupplyArrivalTimeError);
  });
});
