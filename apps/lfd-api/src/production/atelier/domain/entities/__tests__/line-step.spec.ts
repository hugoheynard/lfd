import { InvalidStepReasonError } from "../../errors/line-step-errors.js";
import { LineStep, STEP_REASON_MAX } from "../line-step.js";

/** L'étape d'un poste qui ne finit pas la ligne (`fournil/un-produit-sur-plusieurs-postes.md`). */
const KEY = { serviceDay: "2030-03-12", sku: "SAND", workstationId: "pain" };
const FIRST = { at: new Date("2030-03-12T05:00:00.000Z"), staffId: "s1", name: "Marie" };
const LATER = { at: new Date("2030-03-12T06:00:00.000Z"), staffId: "s2", name: null };

describe("LineStep", () => {
  it("cochée d'abord : faite, version 1, neuve pour le dépôt", () => {
    const step = LineStep.checkDone(KEY, FIRST);

    expect(step.state).toEqual({
      ...KEY,
      status: "done",
      reason: null,
      checked: FIRST,
      version: 1,
    });
    expect(step.loadedVersion).toBeNull();
  });

  it("chaque geste qui change l'étape monte la version et pose son auteur", () => {
    const step = LineStep.checkDone(KEY, FIRST);

    expect(step.undo(LATER)).toBe(true);
    expect(step.state).toMatchObject({ status: "undone", checked: LATER, version: 2 });
    expect(step.markRed("panne", FIRST)).toBe(true);
    expect(step.state).toMatchObject({ status: "red", reason: "panne", version: 3 });
    expect(step.markDone(LATER)).toBe(true);
    expect(step.state).toMatchObject({ status: "done", reason: null, version: 4 });
  });

  it("un geste qui ne change rien le dit, et laisse la version", () => {
    const step = LineStep.fromState({
      ...KEY,
      status: "red",
      reason: "panne",
      checked: FIRST,
      version: 3,
    });

    expect(step.markRed(" panne ", LATER)).toBe(false);
    expect(step.state).toMatchObject({ checked: FIRST, version: 3 });
    expect(step.loadedVersion).toBe(3);
  });

  it("un rouge sans raison, ou d'une raison vide, n'en porte pas", () => {
    expect(LineStep.checkRed(KEY, "   ", FIRST).state.reason).toBeNull();
  });

  it("refuse une raison trop longue", () => {
    expect(() => LineStep.checkRed(KEY, "x".repeat(STEP_REASON_MAX + 1), FIRST)).toThrow(
      InvalidStepReasonError,
    );
  });
});
