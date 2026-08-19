import type { Instant } from "../../context/request-context.js";
import { Clock } from "../../time/clock.js";
import { RAW_BUCKET, SchemaOpsCounter, schemaOf } from "../schema-ops.counter.js";

describe("schemaOf — le seau d'une opération", () => {
  it("range un modèle de `growth` sous `growth`", () => {
    expect(schemaOf("Lead")).toBe("growth");
  });

  it("range tout le reste sous `public`", () => {
    expect(schemaOf("Company")).toBe("public");
  });

  it("range ce qui n'a pas de modèle sous le SQL brut", () => {
    // `$queryRaw`, `$executeRaw`, `$transaction` : facturés comme les autres.
    // Les taire ferait mentir le total, et c'est le total qui approche la facture.
    expect(schemaOf(undefined)).toBe(RAW_BUCKET);
  });
});

describe("SchemaOpsCounter — un régime, pas un cumul", () => {
  it("ne rend aucun taux avant une seconde d'observation", () => {
    // Sous une seconde, un taux serait du bruit multiplié par soixante — et ce
    // bruit-là s'afficherait comme une mesure.
    const clock = new MovingClock();
    const counter = new SchemaOpsCounter(clock);
    counter.record("Company");

    expect(counter.perMinute()).toEqual([]);
  });

  it("rend les schémas du plus gourmand au plus discret", () => {
    const clock = new MovingClock();
    const counter = new SchemaOpsCounter(clock);
    for (let i = 0; i < 3; i++) {
      counter.record("Lead");
    }
    counter.record("Company");
    clock.advance(60_000);

    expect(counter.perMinute().map((rate) => rate.schema)).toEqual(["growth", "public"]);
  });

  it("compte par minute écoulée, pas par appel", () => {
    const clock = new MovingClock();
    const counter = new SchemaOpsCounter(clock);
    counter.record("Company");
    counter.record("Company");
    clock.advance(120_000);

    // Deux opérations en deux minutes : une par minute. Un cumul aurait dit
    // deux, et deux processus d'âges différents auraient rendu des chiffres
    // incomparables sur la même carte.
    expect(counter.perMinute()[0]?.perMinute).toBe(1);
  });
});

/** Une horloge qu'on avance à la main — le temps est une donnée, pas un effet. */
class MovingClock extends Clock {
  private current = new Date("2026-08-19T12:00:00.000Z");

  now(): Instant {
    return this.current;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
