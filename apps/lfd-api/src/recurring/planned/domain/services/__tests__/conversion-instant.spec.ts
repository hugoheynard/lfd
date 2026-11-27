import { conversionInstant, conversionMissed } from "../conversion-instant.js";

// Les instants ne sont comparés qu'entre eux et à `NOW`, posé ici.
const NOW = new Date("2026-12-01T08:00:00.000Z");
const at = (iso: string): Date => new Date(iso);
const FALLBACK = at("2026-12-02T22:45:00.000Z");

describe("conversionInstant — quinze minutes avant la première fermeture (Q1)", () => {
  it("prend la PREMIÈRE fermeture parmi les lignes, moins quinze minutes", () => {
    expect(
      conversionInstant({
        closures: [at("2026-12-02T13:00:00.000Z"), at("2026-12-02T09:00:00.000Z"), null],
        fallback: FALLBACK,
        now: NOW,
      }),
    ).toEqual(at("2026-12-02T08:45:00.000Z"));
  });

  it("sans aucune fermeture, la veille à 23 h 45 (Q9)", () => {
    expect(conversionInstant({ closures: [null, null], fallback: FALLBACK, now: NOW })).toEqual(
      FALLBACK,
    );
  });

  it("une fermeture déjà passée ne gèle pas la colonne : la ligne est bloquante, pas la colonne", () => {
    expect(
      conversionInstant({
        closures: [at("2026-11-30T09:00:00.000Z"), at("2026-12-02T09:00:00.000Z")],
        fallback: FALLBACK,
        now: NOW,
      }),
    ).toEqual(at("2026-12-02T08:45:00.000Z"));
  });

  it("une fermeture dans moins de quinze minutes : maintenant, jamais avant", () => {
    expect(
      conversionInstant({
        closures: [at("2026-12-01T08:05:00.000Z")],
        fallback: FALLBACK,
        now: NOW,
      }),
    ).toEqual(NOW);
  });

  it("un repli déjà passé : maintenant", () => {
    expect(
      conversionInstant({ closures: [], fallback: at("2026-11-30T22:45:00.000Z"), now: NOW }),
    ).toEqual(NOW);
  });
});

describe("conversionMissed — la fermeture passée sans conversion", () => {
  it("manquée une fois l'instant rangé dépassé de la marge", () => {
    expect(conversionMissed(at("2026-12-01T07:45:00.000Z"), NOW)).toBe(true);
  });

  it("pas encore : l'instant atteint, la marge non", () => {
    expect(conversionMissed(at("2026-12-01T07:50:00.000Z"), NOW)).toBe(false);
  });

  it("une colonne sans instant n'est jamais manquée", () => {
    expect(conversionMissed(null, NOW)).toBe(false);
  });
});
