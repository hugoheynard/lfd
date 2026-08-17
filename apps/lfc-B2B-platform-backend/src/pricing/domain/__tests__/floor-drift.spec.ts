import { floorDrift, medianCents, STALE_DRIFT_BP } from "../floor-drift.js";

const POSED = new Date("2026-01-01T00:00:00.000Z");
const NOW = new Date("2026-08-17T00:00:00.000Z");
const AMOUNT = { mode: "amount", cents: 150 } as const;

describe("l'écart entre l'intention et le tarif du jour", () => {
  it("mesure une hausse du tarif depuis la décision", () => {
    const drift = floorDrift(AMOUNT, 200, 224, POSED, NOW);

    expect(drift?.driftBp).toBe(1_200);
    expect(drift?.stale).toBe(true);
  });

  it("mesure aussi une baisse — l'écart est signé", () => {
    expect(floorDrift(AMOUNT, 200, 180, POSED, NOW)?.driftBp).toBe(-1_000);
  });

  it("ne s'alarme pas d'un écart sous le seuil", () => {
    const drift = floorDrift(AMOUNT, 200, 206, POSED, NOW); // +3 %

    expect(drift?.stale).toBe(false);
  });

  it("s'alarme au seuil exact — la borne est INCLUSE", () => {
    // 10 000 → 10 500 = +5 %, soit exactement STALE_DRIFT_BP.
    const drift = floorDrift(AMOUNT, 10_000, 10_500, POSED, NOW);

    expect(drift?.driftBp).toBe(STALE_DRIFT_BP);
    expect(drift?.stale).toBe(true);
  });

  /**
   * Le point qui rend ce signal petit : « jamais sous 50 % du tarif » SUIT le
   * tarif par construction. Une limite en fraction ne peut pas se retrouver
   * décalée, donc il n'y a rien à surveiller.
   */
  it("se tait sur une limite en FRACTION — elle suit le tarif", () => {
    expect(floorDrift({ mode: "percent", bp: 5_000 }, 200, 260, POSED, NOW)).toBeNull();
  });

  /**
   * Rendre « 0 % d'écart » ferait passer une absence de mesure pour une
   * confirmation — sur les limites les plus anciennes, donc les plus suspectes.
   */
  it("se tait quand aucune référence n'a été enregistrée", () => {
    expect(floorDrift(AMOUNT, null, 224, POSED, NOW)).toBeNull();
  });

  it("se tait quand le tarif du jour est inconnu", () => {
    expect(floorDrift(AMOUNT, 200, null, POSED, NOW)).toBeNull();
  });

  it("compte l'âge en jours pleins", () => {
    expect(floorDrift(AMOUNT, 200, 224, POSED, NOW)?.ageDays).toBe(228);
  });

  /**
   * L'âge seul n'alarme pas : une limite posée il y a deux ans sur un tarif qui
   * n'a pas bougé est aussi juste qu'au premier jour. Alerter sur l'ancienneté
   * apprendrait au staff à ignorer l'alerte — pire que ne pas l'avoir.
   */
  it("ne s'alarme PAS d'une vieille limite dont le tarif n'a pas bougé", () => {
    const drift = floorDrift(AMOUNT, 200, 200, new Date("2024-01-01T00:00:00.000Z"), NOW);

    expect(drift?.ageDays).toBeGreaterThan(500);
    expect(drift?.stale).toBe(false);
  });
});

describe("le tarif représentatif", () => {
  it("prend la valeur du milieu sur un nombre impair", () => {
    expect(medianCents([100, 200, 900])).toBe(200);
  });

  it("prend la moyenne des deux du milieu sur un nombre pair", () => {
    expect(medianCents([100, 200, 300, 900])).toBe(250);
  });

  /**
   * Médiane et non moyenne : une limite de famille ne doit pas se juger déplacée
   * parce qu'une pièce montée à 90 € y côtoie des croissants à 2 €.
   */
  it("résiste à un article hors norme, là où une moyenne céderait", () => {
    expect(medianCents([200, 220, 240, 9_000])).toBe(230);
  });

  it("n'a pas de valeur sur un ensemble vide", () => {
    expect(medianCents([])).toBeNull();
  });
});
