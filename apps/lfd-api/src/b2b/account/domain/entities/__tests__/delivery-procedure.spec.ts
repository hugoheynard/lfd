import { DELIVERY_PROCEDURE_MAX_STEPS as CONTRACT_MAX_STEPS } from "@lfd/contracts";

import {
  DeliveryProcedureFullError,
  DeliveryProcedureOrderStaleError,
  DeliveryStepNotFoundError,
  InvalidDeliveryStepError,
} from "../../errors/delivery-procedure-errors.js";
import { DeliveryStepContent } from "../../value-objects/delivery-step-content.js";
import {
  DELIVERY_PROCEDURE_MAX_STEPS,
  DeliveryProcedure,
  type DeliveryProcedureState,
} from "../delivery-procedure.js";

/**
 * **La procédure de livraison d'une adresse.**
 *
 * Ce que ce fichier tient : les trois refus (plein, étape inconnue, ordre
 * périmé), le fait qu'un geste qui rend une photo orpheline RENDE sa clé — c'est
 * ce que le handler supprime du stockage —, et que l'état écrit suit l'ordre.
 */

const IDENTITY = { id: "proc1", companyId: "c1", addressId: "a1" } as const;

function content(title: string, body = ""): DeliveryStepContent {
  return DeliveryStepContent.create({ title, body });
}

/** Une procédure à trois étapes, la deuxième avec photo. */
function threeSteps(): DeliveryProcedure {
  const procedure = DeliveryProcedure.openFor(IDENTITY);
  procedure.addStep("s1", content("Portail"), null);
  procedure.addStep("s2", content("Cour"), "key-s2");
  procedure.addStep("s3", content("Porte de service"), null);
  return procedure;
}

function stepIdsOf(procedure: DeliveryProcedure): string[] {
  return procedure.toPersistence().steps.map((step) => step.id);
}

describe("DeliveryProcedure — ajout", () => {
  it("naît vide et range chaque étape en fin", () => {
    const procedure = threeSteps();
    expect(stepIdsOf(procedure)).toEqual(["s1", "s2", "s3"]);
    expect(procedure.toPersistence()).toMatchObject(IDENTITY);
  });

  it(`refuse la ${DELIVERY_PROCEDURE_MAX_STEPS + 1}e étape`, () => {
    const procedure = DeliveryProcedure.openFor(IDENTITY);
    for (let index = 0; index < DELIVERY_PROCEDURE_MAX_STEPS; index += 1) {
      procedure.addStep(`s${index}`, content(`Étape ${index}`), null);
    }
    expect(() => procedure.addStep("extra", content("De trop"), null)).toThrow(
      DeliveryProcedureFullError,
    );
    expect(procedure.stepCount).toBe(DELIVERY_PROCEDURE_MAX_STEPS);
  });

  it("garde la même borne que celle que l'écran énonce", () => {
    expect(DELIVERY_PROCEDURE_MAX_STEPS).toBe(CONTRACT_MAX_STEPS);
  });
});

describe("DeliveryProcedure — refaire une étape", () => {
  it("remplace titre et texte sans toucher à la photo", () => {
    const procedure = threeSteps();
    procedure.reviseStep("s2", content("Cour intérieure", "Sonner au 2"));
    expect(procedure.toPersistence().steps[1]).toEqual({
      id: "s2",
      title: "Cour intérieure",
      body: "Sonner au 2",
      photoKey: "key-s2",
    });
  });

  it("rend la clé remplacée quand on pose une photo", () => {
    const procedure = threeSteps();
    expect(procedure.attachPhoto("s2", "key-s2-bis")).toBe("key-s2");
    expect(procedure.attachPhoto("s1", "key-s1")).toBeNull();
  });

  it("rend la clé retirée quand on enlève la photo", () => {
    const procedure = threeSteps();
    expect(procedure.detachPhoto("s2")).toBe("key-s2");
    expect(procedure.toPersistence().steps[1]?.photoKey).toBeNull();
    expect(procedure.detachPhoto("s2")).toBeNull();
  });

  it("refuse une étape inconnue, pour chaque geste qui en vise une", () => {
    const procedure = threeSteps();
    expect(() => procedure.reviseStep("ghost", content("x"))).toThrow(DeliveryStepNotFoundError);
    expect(() => procedure.attachPhoto("ghost", "k")).toThrow(DeliveryStepNotFoundError);
    expect(() => procedure.detachPhoto("ghost")).toThrow(DeliveryStepNotFoundError);
    expect(() => procedure.removeStep("ghost")).toThrow(DeliveryStepNotFoundError);
  });
});

describe("DeliveryProcedure — suppression définitive", () => {
  it("retire l'étape et rend la clé de sa photo", () => {
    const procedure = threeSteps();
    expect(procedure.removeStep("s2")).toBe("key-s2");
    expect(stepIdsOf(procedure)).toEqual(["s1", "s3"]);
  });

  it("rend null quand l'étape supprimée n'avait pas de photo", () => {
    expect(threeSteps().removeStep("s1")).toBeNull();
  });
});

describe("DeliveryProcedure — réordonner", () => {
  it("range les étapes dans l'ordre donné", () => {
    const procedure = threeSteps();
    procedure.reorder(["s3", "s1", "s2"]);
    expect(stepIdsOf(procedure)).toEqual(["s3", "s1", "s2"]);
  });

  it.each([
    ["une étape manque", ["s1", "s2"]],
    ["une étape est en trop", ["s1", "s2", "s3", "s4"]],
    ["une étape est répétée", ["s1", "s1", "s2"]],
    ["une étape est inconnue", ["s1", "s2", "ghost"]],
  ])("refuse l'ordre quand %s — l'écran n'a pas vu la dernière écriture", (_, ids) => {
    const procedure = threeSteps();
    expect(() => procedure.reorder(ids)).toThrow(DeliveryProcedureOrderStaleError);
    expect(stepIdsOf(procedure)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("DeliveryProcedure — rehydratation", () => {
  it("relit l'état écrit, ordre compris", () => {
    const state: DeliveryProcedureState = threeSteps().toPersistence();
    expect(DeliveryProcedure.reconstitute(state).toPersistence()).toEqual(state);
  });

  it("revalide le contenu : une ligne au titre vide ne rentre pas en mémoire", () => {
    expect(() =>
      DeliveryProcedure.reconstitute({
        ...IDENTITY,
        steps: [{ id: "s1", title: "  ", body: "", photoKey: null }],
      }),
    ).toThrow(InvalidDeliveryStepError);
  });
});
