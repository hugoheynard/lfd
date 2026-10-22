import { SiteResupply } from "../site-resupply.js";
import {
  ResupplyFrozenInPlanError,
  ResupplyLaunchedNotCancellableError,
} from "../site-resupply-errors.js";
import { SiteResupplyLine } from "../site-resupply-line.js";
import type { ResupplyTarget, SiteResupplySnapshot } from "../site-resupply.js";

/**
 * Le réassort « au plus tôt » lancé au fournil (R4a,
 * `reassort-boutiques/plan-au-plus-tot.md`) : l'annulation refusée sur la
 * réponse SYNCHRONE du fournil, et l'affichage « lancé » posé par le fait.
 * Des instants comparés entre eux seulement, jamais à l'horloge.
 */
const PLACED_AT = new Date(1_000);
const LAUNCHED_AT = new Date(5_000);
const LATER = new Date(9_000);
const LOU = { staffUserId: "staff_lou", name: "Lou", role: "counter" };

function placed(target: ResupplyTarget = "asap"): SiteResupply {
  const resupply = SiteResupply.draft({ id: "rs1", siteId: "site_1", target, at: PLACED_AT });
  resupply.addLine(SiteResupplyLine.of({ sku: "CRO", label: "Croissant", quantity: 12 }));
  resupply.place({ at: PLACED_AT, author: LOU }, null, false);
  return resupply;
}

function snapshotOf(resupply: SiteResupply): SiteResupplySnapshot {
  return {
    id: resupply.id,
    siteId: resupply.siteId,
    target: resupply.target,
    serviceDay: resupply.serviceDay,
    version: 1,
    origin: resupply.origin,
    name: resupply.name,
    lines: resupply.lines,
    placed: resupply.placed,
    cancelled: resupply.cancelled,
    arrived: resupply.arrived,
    launched: resupply.launched,
  };
}

describe("SiteResupply.cancel — un « au plus tôt » lancé (R4a)", () => {
  it("🔴 refuse d'annuler un réassort que le fournil a lancé, et nomme la sortie", () => {
    const resupply = placed();

    expect(() => resupply.cancel({ at: LATER, author: LOU }, null, false, true)).toThrow(
      ResupplyLaunchedNotCancellableError,
    );
    expect(() => resupply.cancel({ at: LATER, author: LOU }, null, false, true)).toThrow(
      /Réceptionnez-le avec un écart/u,
    );
    expect(resupply.status).toBe("placed");
  });

  it("le refus suit la réponse du fournil, pas l'affichage : non lancé, il s'annule", () => {
    const resupply = placed();
    resupply.recordLaunch({ at: LAUNCHED_AT, byName: "Max" });

    resupply.cancel({ at: LATER, author: LOU }, null, false, false);

    expect(resupply.status).toBe("cancelled");
  });

  it("un plan arrêté garde son refus propre pour un « pour demain »", () => {
    expect(() => placed("tomorrow").cancel({ at: LATER, author: LOU }, null, true, false)).toThrow(
      ResupplyFrozenInPlanError,
    );
  });
});

describe("SiteResupply.recordLaunch — l'affichage « Lancé par X à HH:MM »", () => {
  it("pose l'instant et le nom du lancement sur un « au plus tôt » envoyé", () => {
    const resupply = placed();

    expect(resupply.recordLaunch({ at: LAUNCHED_AT, byName: "Max" })).toBe(true);
    expect(resupply.launched).toEqual({ at: LAUNCHED_AT, byName: "Max" });
  });

  it("rejoué, ne change rien", () => {
    const resupply = placed();
    resupply.recordLaunch({ at: LAUNCHED_AT, byName: "Max" });

    expect(resupply.recordLaunch({ at: LATER, byName: "Paul" })).toBe(false);
    expect(resupply.launched).toEqual({ at: LAUNCHED_AT, byName: "Max" });
  });

  it("ignore un « pour demain », une demande en cours et un réassort annulé", () => {
    const cancelled = placed();
    cancelled.cancel({ at: LATER, author: LOU }, null, false, false);
    const draft = SiteResupply.draft({
      id: "rs2",
      siteId: "site_1",
      target: "asap",
      at: PLACED_AT,
    });

    expect(placed("tomorrow").recordLaunch({ at: LAUNCHED_AT, byName: null })).toBe(false);
    expect(draft.recordLaunch({ at: LAUNCHED_AT, byName: null })).toBe(false);
    expect(cancelled.recordLaunch({ at: LAUNCHED_AT, byName: null })).toBe(false);
  });

  it("se relit tel qu'écrit ; un instantané d'avant R4a se relit sans lancement", () => {
    const resupply = placed();
    resupply.recordLaunch({ at: LAUNCHED_AT, byName: null });
    const { launched: _dropped, ...before } = snapshotOf(resupply);

    expect(SiteResupply.restore(snapshotOf(resupply)).launched).toEqual({
      at: LAUNCHED_AT,
      byName: null,
    });
    expect(SiteResupply.restore(before).launched).toBeNull();
  });
});
