import { checkedDaysOf, missingCheckDays, standingCheckOf } from "../bank-return-checks.js";

/**
 * La règle de lecture de « Retours contrôlés » : la dernière ligne d'un jour
 * fait foi. Les dates ne se comparent qu'entre elles (CLAUDE.md § 5).
 */

const AT = (minutes: number): Date => new Date(Date.UTC(2026, 10, 16, 8, minutes));

function line(id: string, day: string, minutes: number, withdrawn = false) {
  return { id, day, at: AT(minutes), staffId: "staff_1", withdrawn };
}

describe("« Retours contrôlés » — la dernière ligne fait foi", () => {
  it("une attestation seule fait foi", () => {
    expect(standingCheckOf([line("a", "2026-11-16", 0)])?.id).toBe("a");
  });

  it("un retrait plus récent l'annule ; une attestation plus récente encore la rétablit", () => {
    const withdrawn = [line("a", "2026-11-16", 0), line("b", "2026-11-16", 5, true)];
    expect(standingCheckOf(withdrawn)).toBeNull();
    expect(standingCheckOf([...withdrawn, line("c", "2026-11-16", 9)])?.id).toBe("c");
  });

  it("l'ordre de lecture ne compte pas : c'est l'instant qui range", () => {
    expect(standingCheckOf([line("b", "d", 5, true), line("a", "d", 0)])).toBeNull();
  });

  it("à instant égal, l'identifiant (ULID) départage", () => {
    expect(standingCheckOf([line("02", "d", 0, true), line("01", "d", 0)])).toBeNull();
  });

  it("les jours attestés, chacun lu par sa dernière ligne", () => {
    const days = checkedDaysOf([
      line("a", "2026-11-16", 0),
      line("b", "2026-11-17", 0),
      line("c", "2026-11-17", 1, true),
    ]);
    expect([...days]).toEqual(["2026-11-16"]);
  });
});

describe("les jours manquants de la fenêtre", () => {
  it("s'arrêtent à aujourd'hui, et sautent le week-end", () => {
    expect(missingCheckDays("2026-11-13", "2026-11-20", "2026-11-17", new Set())).toEqual([
      "2026-11-13",
      "2026-11-16",
      "2026-11-17",
    ]);
  });

  it("s'arrêtent à la fin de la fenêtre", () => {
    expect(
      missingCheckDays("2026-11-16", "2026-11-17", "2026-12-01", new Set(["2026-11-16"])),
    ).toEqual(["2026-11-17"]);
  });

  it("une échéance un jour fermé commence au jour ouvré suivant", () => {
    expect(missingCheckDays("2026-11-14", "2026-11-17", "2026-11-16", new Set())).toEqual([
      "2026-11-16",
    ]);
  });
});
