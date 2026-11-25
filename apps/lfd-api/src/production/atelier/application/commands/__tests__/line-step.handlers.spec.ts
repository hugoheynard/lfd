import {
  FinishingWorkstationIsNotAStepError,
  InvalidStepReasonError,
  LineStationsUnreadableError,
  WorkstationNotOnLineError,
} from "../../../domain/errors/line-step-errors.js";
import {
  FINISHING_STATION,
  lineStepScene,
  OTHER_STATION,
  STEP_STATION,
} from "../../__tests__/line-step-scene.js";
import { nextIntent, SCENE_DAY, SCENE_NOW, SCENE_SKU } from "../../__tests__/problem-scene.js";
import { MarkStepDoneCommand } from "../mark-step-done.command.js";
import { MarkStepRedCommand } from "../mark-step-red.command.js";
import { UndoStepCommand } from "../undo-step.command.js";

/** Les gestes d'une étape (`fournil/un-produit-sur-plusieurs-postes.md`, § 2.3), ports doublés. */
const KEY = { serviceDay: SCENE_DAY, sku: SCENE_SKU, workstationId: STEP_STATION };

function done(workstationId = STEP_STATION, key = nextIntent(), sku = SCENE_SKU) {
  return new MarkStepDoneCommand(SCENE_DAY, sku, workstationId, "staff-1", key);
}

function red(reason: string | null, key = nextIntent()) {
  return new MarkStepRedCommand(SCENE_DAY, SCENE_SKU, STEP_STATION, reason, "staff-1", key);
}

function undo(key = nextIntent()) {
  return new UndoStepCommand(SCENE_DAY, SCENE_SKU, STEP_STATION, "staff-1", key);
}

describe("MarkStepDoneHandler", () => {
  it("coche l'étape sous le verrou de la journée, la journalise, et ne compte aucune pièce", async () => {
    const scene = lineStepScene();

    await scene.stepDone.execute(done());

    expect(scene.steps.of(KEY)).toEqual({
      ...KEY,
      status: "done",
      reason: null,
      checked: { at: SCENE_NOW, staffId: "staff-1", name: "Marie Dupont" },
      version: 1,
    });
    expect(scene.trace).toContain(`lock:${SCENE_DAY}`);
    expect(scene.store.batches).toHaveLength(0);
    expect((await scene.days.load()).producedOf(SCENE_SKU)).toBe(0);
    expect(scene.events.factTypes()).toEqual(["production_line.step_done"]);
    expect(scene.events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "production_line_step",
      subjectId: `${SCENE_DAY}:${SCENE_SKU}:${STEP_STATION}`,
      payload: { subjectLabel: "Croissant", workstationName: "Boulangerie", version: 1 },
    });
  });

  it("déjà faite : rien n'est écrit ni journalisé", async () => {
    const scene = lineStepScene();
    await scene.stepDone.execute(done());

    await scene.stepDone.execute(done());

    expect(scene.steps.saves).toBe(1);
    expect(scene.events.traced).toHaveLength(1);
  });

  it("rejoué avec la même clé, ne coche qu'une fois", async () => {
    const scene = lineStepScene();
    const key = nextIntent();

    await scene.stepDone.execute(done(STEP_STATION, key));
    await scene.stepDone.execute(done(STEP_STATION, key));

    expect(scene.steps.saves).toBe(1);
  });

  it("refuse le poste qui finit la ligne : il déclare par « Fait »", async () => {
    const scene = lineStepScene();

    await expect(scene.stepDone.execute(done(FINISHING_STATION))).rejects.toBeInstanceOf(
      FinishingWorkstationIsNotAStepError,
    );
    expect(scene.steps.saves).toBe(0);
    expect(scene.events.traced).toHaveLength(0);
  });

  it("refuse un poste qui n'est pas un poste du produit sur la carte courante", async () => {
    const scene = lineStepScene();

    await expect(scene.stepDone.execute(done(OTHER_STATION))).rejects.toBeInstanceOf(
      WorkstationNotOnLineError,
    );
    expect(scene.steps.saves).toBe(0);
  });

  it("refuse une ligne qui n'est pas au compte du jour", async () => {
    const scene = lineStepScene();

    await expect(
      scene.stepDone.execute(done(STEP_STATION, nextIntent(), "INCONNU")),
    ).rejects.toMatchObject({ code: "production.item.not_found" });
  });

  it("des postes illisibles : rien n'est coché à l'aveugle", async () => {
    const scene = lineStepScene("down");

    await expect(scene.stepDone.execute(done())).rejects.toBeInstanceOf(
      LineStationsUnreadableError,
    );
    expect(scene.steps.saves).toBe(0);
  });
});

describe("MarkStepRedHandler", () => {
  it("met l'étape en rouge avec sa raison rognée, sans plafond ni fournée", async () => {
    const scene = lineStepScene();

    await scene.stepRed.execute(red("  four à pain en panne "));

    expect(scene.steps.of(KEY)).toMatchObject({ status: "red", reason: "four à pain en panne" });
    expect(scene.problems.saves).toBe(0);
    expect(scene.store.batches).toHaveLength(0);
    expect(scene.events.factTypes()).toEqual(["production_line.step_red"]);
    expect(scene.events.traced[0]?.journalFact().payload).toMatchObject({
      reason: "four à pain en panne",
    });
  });

  it("la même raison ne réécrit rien ; une autre monte la version", async () => {
    const scene = lineStepScene();
    await scene.stepRed.execute(red("panne"));

    await scene.stepRed.execute(red("panne"));
    expect(scene.steps.saves).toBe(1);

    await scene.stepRed.execute(red("farine manquante"));
    expect(scene.steps.of(KEY)).toMatchObject({ reason: "farine manquante", version: 2 });
  });

  it("refuse une raison trop longue", async () => {
    const scene = lineStepScene();

    await expect(scene.stepRed.execute(red("x".repeat(501)))).rejects.toBeInstanceOf(
      InvalidStepReasonError,
    );
  });

  it("une étape en rouge se coche ensuite : la version monte", async () => {
    const scene = lineStepScene();
    await scene.stepRed.execute(red(null));

    await scene.stepDone.execute(done());

    expect(scene.steps.of(KEY)).toMatchObject({ status: "done", reason: null, version: 2 });
  });
});

describe("UndoStepHandler", () => {
  it("décoche une étape faite : elle reste, `undone`, et sa version monte", async () => {
    const scene = lineStepScene();
    await scene.stepDone.execute(done());

    await scene.stepUndo.execute(undo());

    expect(scene.steps.of(KEY)).toMatchObject({ status: "undone", version: 2 });
    expect(scene.events.factTypes()).toEqual([
      "production_line.step_done",
      "production_line.step_undone",
    ]);
  });

  it("une étape jamais touchée : rien n'est écrit ni journalisé", async () => {
    const scene = lineStepScene();

    await scene.stepUndo.execute(undo());

    expect(scene.steps.saves).toBe(0);
    expect(scene.events.traced).toHaveLength(0);
  });

  it("recochée après décoche, la version monte encore", async () => {
    const scene = lineStepScene();
    await scene.stepDone.execute(done());
    await scene.stepUndo.execute(undo());

    await scene.stepDone.execute(done());

    expect(scene.steps.of(KEY)).toMatchObject({ status: "done", version: 3 });
  });
});
