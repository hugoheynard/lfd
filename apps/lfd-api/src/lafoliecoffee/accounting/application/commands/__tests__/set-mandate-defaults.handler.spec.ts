import { MandateFieldTooLongError } from "../../../domain/errors/accounting-errors.js";
import { SetMandateDefaultsCommand } from "../legal-entity-commands.js";
import { SetMandateDefaultsHandler } from "../set-mandate-defaults.handler.js";
import {
  declaredEntity,
  SettingSteps,
  StepDrafts,
  StepEntities,
  StepUnitOfWork,
} from "./mandate-setting-doubles.js";

const DESCRIPTION = "Fourniture de viennoiseries";

function harness(scheme: "CORE" | "B2B" = "B2B") {
  const steps = new SettingSteps();
  const entities = new StepEntities(steps);
  const entity = declaredEntity();
  entity.changeMandateScheme(scheme);
  entities.rows.set("le1", entity);
  const drafts = new StepDrafts(steps);
  const handler = new SetMandateDefaultsHandler(entities, drafts, new StepUnitOfWork(steps));
  return {
    steps,
    entities,
    drafts,
    run: (contractDescription: string, paymentType: "recurrent" | "one_off") =>
      handler.execute(new SetMandateDefaultsCommand("le1", { contractDescription, paymentType })),
  };
}

describe("SetMandateDefaultsHandler — ce que le papier imprime", () => {
  it.each(["CORE", "B2B"] as const)(
    "rend les brouillons caducs quand le TYPE change, sous %s",
    async (scheme) => {
      const h = harness(scheme);

      await h.run("", "one_off");

      expect(h.steps.log).toEqual([
        "uow:begin",
        "entity:save",
        "drafts:void:mandate_defaults_changed",
        "uow:end",
        "drafts:bell:1",
      ]);
      expect(h.drafts.calls).toEqual([
        { creditorId: "le1", cause: "mandate_defaults_changed", via: "staff" },
      ]);
      expect(h.entities.rows.get("le1")?.mandateDefaults.paymentType).toBe("one_off");
    },
  );

  it("rend les brouillons caducs quand la DESCRIPTION change sous CORE, qui l'imprime", async () => {
    const h = harness("CORE");

    await h.run(DESCRIPTION, "recurrent");

    expect(h.drafts.calls).toHaveLength(1);
  });

  /** Plan mandat deux schémas §10, Q2 : le formulaire interentreprises n'a pas de zone 20. */
  it("ne rend RIEN caduc quand la description change sous interentreprises", async () => {
    const h = harness("B2B");

    await h.run(DESCRIPTION, "recurrent");

    expect(h.steps.log).toEqual(["entity:save"]);
    expect(h.drafts.calls).toEqual([]);
    expect(h.entities.rows.get("le1")?.mandateDefaults.contractDescription).toBe(DESCRIPTION);
  });

  it("ne rend RIEN caduc sur une réécriture à l'identique, même sous CORE", async () => {
    const h = harness("CORE");

    await h.run("", "recurrent");

    expect(h.steps.log).toEqual(["entity:save"]);
  });

  it("ne touche jamais au schéma — la raison d'être de sa commande à part", async () => {
    const h = harness("CORE");

    await h.run(DESCRIPTION, "one_off");

    expect(h.entities.rows.get("le1")?.mandateScheme).toBe("CORE");
  });

  it("refuse une description trop longue AVANT toute écriture ou caducité", async () => {
    const h = harness("CORE");

    await expect(h.run("x".repeat(91), "one_off")).rejects.toBeInstanceOf(MandateFieldTooLongError);
    expect(h.steps.log).toEqual([]);
  });
});
