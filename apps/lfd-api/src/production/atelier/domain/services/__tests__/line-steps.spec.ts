import type { LineStepStatus } from "../../entities/line-step.js";
import {
  FinishingWorkstationIsNotAStepError,
  WorkstationNotOnLineError,
} from "../../errors/line-step-errors.js";
import { assertStepOf, type LineStation, pendingStepsOf } from "../line-steps.js";

/** Les étapes d'une ligne (`fournil/un-produit-sur-plusieurs-postes.md`, § 2.3). */
const STATIONS: readonly LineStation[] = [
  { workstationId: "pain", finishes: false },
  { workstationId: "traiteur", finishes: true },
  { workstationId: "four", finishes: false },
];

describe("assertStepOf", () => {
  it("admet un poste du produit qui ne le finit pas", () => {
    expect(() => assertStepOf(STATIONS, "pain", "SAND")).not.toThrow();
  });

  it("refuse le poste qui finit", () => {
    expect(() => assertStepOf(STATIONS, "traiteur", "SAND")).toThrow(
      FinishingWorkstationIsNotAStepError,
    );
  });

  it("refuse un poste étranger au produit, ou un produit sans poste", () => {
    expect(() => assertStepOf(STATIONS, "patisserie", "SAND")).toThrow(WorkstationNotOnLineError);
    expect(() => assertStepOf([], "pain", "SAND")).toThrow(WorkstationNotOnLineError);
  });
});

describe("pendingStepsOf", () => {
  it("rend les étapes qui n'ont pas coché, dans l'ordre reçu, jamais celui qui finit", () => {
    expect(pendingStepsOf(STATIONS, () => undefined)).toEqual(["pain", "four"]);
  });

  it("une étape faite n'attend plus ; en rouge ou décochée, elle attend", () => {
    const status = new Map<string, LineStepStatus>([
      ["pain", "done"],
      ["four", "red"],
    ]);

    expect(pendingStepsOf(STATIONS, (id) => status.get(id))).toEqual(["four"]);
    expect(pendingStepsOf(STATIONS, () => "undone")).toEqual(["pain", "four"]);
  });
});
