import { IN_FORCE, statusOf, suspendedFromOf } from "../rule-lifecycle.js";
import type { RuleLifecycle } from "../rule-lifecycle.js";

const PAUSED_AT = new Date("2026-08-10T09:00:00.000Z");
const ARCHIVED_AT = new Date("2026-08-12T09:00:00.000Z");

function lifecycle(over: Partial<RuleLifecycle> = {}): RuleLifecycle {
  return { ...IN_FORCE, ...over };
}

describe("l'état d'une règle, dérivé et jamais stocké", () => {
  it("est en vigueur quand aucun geste ne l'a touchée", () => {
    expect(statusOf(IN_FORCE)).toBe("active");
  });

  it("est en pause quand quelqu'un l'a suspendue", () => {
    expect(statusOf(lifecycle({ pausedAt: PAUSED_AT, pausedBy: "staff_1" }))).toBe("paused");
  });

  /**
   * L'archivage est terminal : une règle archivée **pendant** qu'elle était en
   * pause est archivée, pas en pause. Sans cet ordre, l'écran afficherait
   * « en pause » sur une décision close et proposerait de la reprendre.
   */
  it("est archivée même si elle était en pause au moment de l'archivage", () => {
    const state = lifecycle({ pausedAt: PAUSED_AT, archivedAt: ARCHIVED_AT });

    expect(statusOf(state)).toBe("archived");
  });
});

describe("l'instant où la règle a cessé d'agir", () => {
  it("n'existe pas tant que rien ne l'a interrompue", () => {
    expect(suspendedFromOf(IN_FORCE)).toBeNull();
  });

  it("est la pause quand elle n'est que suspendue", () => {
    expect(suspendedFromOf(lifecycle({ pausedAt: PAUSED_AT }))).toBe(PAUSED_AT);
  });

  it("est l'archivage quand elle n'a jamais été suspendue", () => {
    expect(suspendedFromOf(lifecycle({ archivedAt: ARCHIVED_AT }))).toBe(ARCHIVED_AT);
  });

  /**
   * Le **plus tôt** des deux : une règle suspendue le 10 puis archivée le 12 a
   * cessé d'agir le 10. Prendre l'archivage la ferait facturer deux jours qu'elle
   * n'a pas facturés, précisément quand on relit une commande contestée.
   */
  it("est le PLUS TÔT des deux quand une pause a précédé l'archivage", () => {
    const state = lifecycle({ pausedAt: PAUSED_AT, archivedAt: ARCHIVED_AT });

    expect(suspendedFromOf(state)).toBe(PAUSED_AT);
  });

  /** Et symétriquement, si l'horodatage d'archivage précède celui de pause. */
  it("prend l'archivage s'il est antérieur à la pause", () => {
    const state = lifecycle({ pausedAt: ARCHIVED_AT, archivedAt: PAUSED_AT });

    expect(suspendedFromOf(state)).toBe(PAUSED_AT);
  });
});
