import {
  accountsState,
  arrivalStepOf,
  fileStatus,
  followedAtClosure,
  followedBatchOf,
  mandatesState,
  openBatchesOf,
  replacementOf,
  returnsStatus,
  type ProcedureBatch,
} from "../collection-procedure.js";
import { EVERY_DAY_CHECKED, NO_DAY_CHECKED } from "./bank-return-check-fixtures.js";

/**
 * L'état des onglets de la procédure (plan
 * `plan-page-procedure-de-prelevement.md`, § 3 et § 4.3). Le jour « aujourd'hui »
 * est un paramètre : les dates ne se comparent qu'entre elles (CLAUDE.md §5).
 */

function batch(id: string, over: Partial<ProcedureBatch> = {}): ProcedureBatch {
  return {
    id,
    scheme: "B2B",
    status: "constituted",
    cycleClosesAt: "2026-10-31T23:00:00.000Z",
    requestedCollectionDay: "2026-11-16",
    depositDeadline: { day: "2026-11-12", time: "13:45" },
    pendingReturnCount: 0,
    checkedDays: EVERY_DAY_CHECKED,
    ...over,
  };
}

const DEPOSITED = batch("dep", { status: "deposited" });

describe("onglets 1 et 2 — les comptes, puis les mandats", () => {
  it("des comptes à exporter : à faire ; en vol seulement : en attente ; rien : fait", () => {
    expect(accountsState(2, 1)).toBe("to_do");
    expect(accountsState(0, 1)).toBe("waiting");
    expect(accountsState(0, 0)).toBe("done");
  });

  it("l'onglet 2 est verrouillé ENTIER tant que l'onglet 1 n'est pas fait", () => {
    expect(mandatesState("to_do", 0, false)).toBe("locked");
    expect(mandatesState("waiting", 3, true)).toBe("locked");
  });

  it("un export non importé met l'onglet 2 en attente, même avec des mandats à exporter", () => {
    expect(mandatesState("done", 3, true)).toBe("waiting");
    expect(mandatesState("done", 3, false)).toBe("to_do");
    expect(mandatesState("done", 0, false)).toBe("done");
  });
});

describe("onglet 3 — le fichier du lot suivi (P2 : sans attestation)", () => {
  it("rien à préparer ni à déposer : aucune action à mener", () => {
    expect(fileStatus(null, false)).toEqual({ state: "done", reason: "no_batch" });
  });

  it("la dernière clôture sans lot : à préparer", () => {
    expect(fileStatus(null, true)).toEqual({ state: "to_do", reason: "to_prepare" });
  });

  it("préparé : à déposer ; déposé : fait ; annulé : jamais fait", () => {
    expect(fileStatus(batch("b"), false).reason).toBe("to_deposit");
    expect(fileStatus(DEPOSITED, false)).toEqual({ state: "done", reason: "deposited" });
    expect(fileStatus(batch("c", { status: "cancelled" }), false)).toEqual({
      state: "to_do",
      reason: "cancelled",
    });
  });

  it("rejeté par la banque : à préparer de nouveau, sous sa propre raison", () => {
    expect(fileStatus(batch("r", { status: "rejected_by_bank" }), false)).toEqual({
      state: "to_do",
      reason: "rejected_by_bank",
    });
  });
});

describe("onglet 4 — les retours (N = 5 jours ouvrés, Q3)", () => {
  it("verrouillé tant que le lot n'est pas déposé, et seulement par là", () => {
    expect(returnsStatus(batch("b"), "2026-11-20").state).toBe("locked");
    expect(returnsStatus(null, "2026-11-20").reason).toBe("not_deposited");
  });

  it("avant l'échéance : rien à contrôler", () => {
    expect(returnsStatus(DEPOSITED, "2026-11-13")).toEqual({
      state: "waiting",
      reason: "before_collection_day",
      watchUntilDay: "2026-11-23",
      missingCheckDays: [],
    });
  });

  it("de l'échéance à échéance + 5 jours ouvrés (week-end sauté) : contrôle quotidien", () => {
    const unchecked = batch("u", { status: "deposited", checkedDays: NO_DAY_CHECKED });
    expect(returnsStatus(DEPOSITED, "2026-11-16").reason).toBe("watching");
    expect(returnsStatus(unchecked, "2026-11-23").state).toBe("to_do");
    expect(returnsStatus(DEPOSITED, "2026-11-24")).toEqual({
      state: "done",
      reason: "watch_over",
      watchUntilDay: "2026-11-23",
      missingCheckDays: [],
    });
  });

  it("un retour en suspens rouvre l'onglet, même après la fenêtre", () => {
    const returned = batch("r", { status: "deposited", pendingReturnCount: 1 });
    expect(returnsStatus(returned, "2027-01-10")).toMatchObject({
      state: "to_do",
      reason: "pending_returns",
    });
  });

  it("un lot d'avant l'échéance figée : pas de fenêtre, fait sans retour en suspens", () => {
    const old = batch("o", { status: "deposited", requestedCollectionDay: null });
    expect(returnsStatus(old, "2026-11-20")).toEqual({
      state: "done",
      reason: "watch_over",
      watchUntilDay: null,
      missingCheckDays: [],
    });
  });
});

describe("onglet 4 — les contrôles attestés « Retours contrôlés » (P3)", () => {
  // Échéance lundi 16 novembre ; fenêtre jusqu'au lundi 23 (5 jours ouvrés).
  const checkedOn = (...days: string[]): ProcedureBatch =>
    batch("dep", { status: "deposited", checkedDays: new Set(days) });

  it("dans la fenêtre, les jours arrivés sans contrôle sont nommés, aujourd'hui compris", () => {
    expect(returnsStatus(checkedOn("2026-11-16"), "2026-11-18")).toEqual({
      state: "to_do",
      reason: "watching",
      watchUntilDay: "2026-11-23",
      missingCheckDays: ["2026-11-17", "2026-11-18"],
    });
  });

  it("dans la fenêtre, chaque jour arrivé attesté : en attente du jour ouvré suivant", () => {
    const status = returnsStatus(checkedOn("2026-11-16", "2026-11-17"), "2026-11-17");
    expect(status).toMatchObject({ state: "waiting", reason: "watching", missingCheckDays: [] });
  });

  it("le week-end n'est jamais demandé", () => {
    expect(returnsStatus(checkedOn(), "2026-11-22").missingCheckDays).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
    ]);
  });

  it("fenêtre passée avec un trou : à faire, le trou nommé — il ne se lisse pas en « fait »", () => {
    const holed = checkedOn("2026-11-16", "2026-11-17", "2026-11-18", "2026-11-20", "2026-11-23");
    expect(returnsStatus(holed, "2026-11-30")).toEqual({
      state: "to_do",
      reason: "unchecked_days",
      watchUntilDay: "2026-11-23",
      missingCheckDays: ["2026-11-19"],
    });
  });

  it("fenêtre passée, chaque jour ouvré attesté, aucun retour : fait", () => {
    const all = checkedOn(
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-23",
    );
    expect(returnsStatus(all, "2026-11-30").state).toBe("done");
  });

  it("un lot dont la fenêtre a un trou reste parmi les lots ouverts", () => {
    expect(openBatchesOf([checkedOn("2026-11-16")], "2026-11-30").map((b) => b.id)).toEqual([
      "dep",
    ]);
  });
});

describe("le lot suivi (§ 4.3, Q4)", () => {
  const LATE = batch("late", { depositDeadline: { day: "2026-11-20", time: "13:45" } });
  const SOON = batch("soon", { depositDeadline: { day: "2026-11-05", time: "13:45" } });
  const UNKNOWN = batch("unknown", { depositDeadline: null, requestedCollectionDay: "2026-11-30" });
  const WATCHED = batch("watched", {
    status: "deposited",
    requestedCollectionDay: "2026-11-02",
    depositDeadline: { day: "2026-10-29", time: "13:45" },
  });

  /**
   * Régression de plan (objection BLOQUANT de vitruve) : suivre « le plus ancien
   * lot non clos » laissait un lot plus récent manquer sa limite de dépôt
   * pendant qu'on suivait des retours.
   */
  it("le lot à déposer à la limite la plus proche passe avant un lot déposé encore suivi", () => {
    expect(followedBatchOf([WATCHED, LATE, SOON], "2026-11-03", false)?.id).toBe("soon");
  });

  it("à limite inconnue, l'échéance range le lot", () => {
    expect(openBatchesOf([UNKNOWN, LATE, SOON], "2026-11-03").map((b) => b.id)).toEqual([
      "soon",
      "late",
      "unknown",
    ]);
  });

  it("tous les lots ouverts sont listés : les déposés suivis après les lots à déposer", () => {
    const closed = batch("closed", { status: "deposited", requestedCollectionDay: "2026-10-01" });
    const cancelled = batch("x", { status: "cancelled" });
    expect(
      openBatchesOf([closed, WATCHED, cancelled, LATE], "2026-11-03").map((b) => b.id),
    ).toEqual(["late", "watched"]);
  });

  it("une clôture à préparer passe avant un lot déposé : aucun lot suivi", () => {
    expect(followedBatchOf([WATCHED], "2026-11-03", true)).toBeNull();
    expect(followedBatchOf([WATCHED], "2026-11-03", false)?.id).toBe("watched");
  });

  it("un lot annulé propose celui de la même clôture et du même schéma, préparé de nouveau", () => {
    const cancelled = batch("x", { status: "cancelled" });
    const other = batch("core", { scheme: "CORE" });
    const again = batch("again");
    expect(replacementOf(cancelled, [cancelled, other, again])?.id).toBe("again");
    expect(replacementOf(cancelled, [cancelled, other])).toBeNull();
  });

  it("un lot rejeté par la banque propose aussi le lot préparé de nouveau, jamais un autre rejeté", () => {
    const rejected = batch("r", { status: "rejected_by_bank" });
    const alsoRejected = batch("r2", { status: "rejected_by_bank" });
    const again = batch("again");
    expect(replacementOf(rejected, [alsoRejected, rejected])).toBeNull();
    expect(replacementOf(rejected, [rejected, alsoRejected, again])?.id).toBe("again");
  });

  it("la clôture suit son lot vivant plutôt qu'un lot rejeté par la banque", () => {
    const rejected = batch("r", { status: "rejected_by_bank" });
    const again = batch("again");
    expect(followedAtClosure([rejected, again], "2026-11-03", false)?.id).toBe("again");
  });
});

describe("l'onglet ouvert à l'arrivée", () => {
  it("le premier qui attend un geste, à faire ou en attente", () => {
    expect(
      arrivalStepOf({ accounts: "done", mandates: "waiting", file: "to_do", returns: "locked" }),
    ).toBe("mandates");
  });

  it("tout est fait : le premier onglet", () => {
    expect(
      arrivalStepOf({ accounts: "done", mandates: "done", file: "done", returns: "done" }),
    ).toBe("accounts");
  });
});
