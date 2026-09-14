import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InvalidEmailError } from "../../../../account/domain/errors/account-errors.js";
import {
  FeatureExemptionNotFoundError,
  FeatureOverrideNotFoundError,
  UnknownFeatureError,
  UnknownFeatureLevelError,
} from "../../../domain/feature-access-errors.js";
import { AddFeatureExemptionCommand } from "../add-feature-exemption.command.js";
import { AddFeatureExemptionHandler } from "../add-feature-exemption.handler.js";
import { ClearFeatureOverrideCommand } from "../clear-feature-override.command.js";
import { ClearFeatureOverrideHandler } from "../clear-feature-override.handler.js";
import { RemoveFeatureExemptionCommand } from "../remove-feature-exemption.command.js";
import { RemoveFeatureExemptionHandler } from "../remove-feature-exemption.handler.js";
import { SetFeatureOverrideCommand } from "../set-feature-override.command.js";
import { SetFeatureOverrideHandler } from "../set-feature-override.handler.js";
import {
  InMemoryExemptions,
  InMemoryOverrides,
  KnownStaff,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "./feature-access-doubles.js";

// Comparée à aucune horloge : c'est l'instant que le handler doit figer.
const NOW = new Date("2026-09-14T09:00:00.000Z");

function harness() {
  const steps = new Steps();
  const overrides = new InMemoryOverrides(steps);
  const exemptions = new InMemoryExemptions(steps);
  const events = new StepPublisher(steps);
  const uow = new StepUnitOfWork(steps);
  const clock = new FixedClock(NOW);
  const staff = new KnownStaff();
  return {
    steps,
    overrides,
    exemptions,
    events,
    set: new SetFeatureOverrideHandler(overrides, staff, clock, events, uow),
    clear: new ClearFeatureOverrideHandler(overrides, events, uow),
    add: new AddFeatureExemptionHandler(
      exemptions,
      staff,
      clock,
      new FixedIdGenerator("ex"),
      events,
      uow,
    ),
    remove: new RemoveFeatureExemptionHandler(exemptions, events, uow),
  };
}

describe("SetFeatureOverrideHandler", () => {
  it("écrit la dérogation puis sa trace, DANS l'unité de travail", async () => {
    const h = harness();

    await h.set.execute(new SetFeatureOverrideCommand("shop", "browse", "staff|admin"));

    expect(h.steps.log).toEqual([
      "uow:begin",
      "override:put:shop",
      "journal:feature_access.override_set",
      "uow:end",
    ]);
    expect(h.events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "feature_access",
      subjectId: "shop",
      payload: { value: "browse", previousValue: null },
    });
  });

  it("fige l'auteur (sub, nom, rôle) et l'instant du Clock", async () => {
    const h = harness();

    await h.set.execute(new SetFeatureOverrideCommand("shop", "closed", "staff|admin"));

    const row = h.overrides.rows.get("shop");
    expect(row?.author).toEqual({ sub: "staff|admin", name: "Camille Admin", role: "admin" });
    expect(row?.at).toBe(NOW);
  });

  it("garde le sub seul quand l'annuaire ne connaît pas l'agent", async () => {
    const h = harness();

    await h.set.execute(new SetFeatureOverrideCommand("shop", "closed", "staff|inconnu"));

    expect(h.overrides.rows.get("shop")?.author).toEqual({
      sub: "staff|inconnu",
      name: "",
      role: "",
    });
  });

  it("dit au journal la valeur remplacée", async () => {
    const h = harness();
    await h.set.execute(new SetFeatureOverrideCommand("shop", "browse", "staff|admin"));

    await h.set.execute(new SetFeatureOverrideCommand("shop", "closed", "staff|admin"));

    expect(h.events.traced[1]?.journalFact().payload).toEqual({
      value: "closed",
      previousValue: "browse",
    });
  });

  it("refuse une valeur hors catalogue AVANT toute écriture ni trace", async () => {
    const h = harness();

    await expect(
      h.set.execute(new SetFeatureOverrideCommand("shop", "open", "staff|admin")),
    ).rejects.toThrow(UnknownFeatureLevelError);

    expect(h.steps.log).toEqual([]);
  });

  it("refuse une clé hors catalogue AVANT toute écriture", async () => {
    const h = harness();

    await expect(
      h.set.execute(new SetFeatureOverrideCommand("legacy_flag", "order", "staff|admin")),
    ).rejects.toThrow(UnknownFeatureError);

    expect(h.steps.log).toEqual([]);
  });
});

describe("ClearFeatureOverrideHandler", () => {
  it("supprime la dérogation et trace la valeur retirée", async () => {
    const h = harness();
    await h.set.execute(new SetFeatureOverrideCommand("shop", "closed", "staff|admin"));
    h.steps.log.length = 0;

    await h.clear.execute(new ClearFeatureOverrideCommand("shop"));

    expect(h.overrides.rows.has("shop")).toBe(false);
    expect(h.steps.log).toEqual([
      "uow:begin",
      "override:remove:shop",
      "journal:feature_access.override_cleared",
      "uow:end",
    ]);
    expect(h.events.traced[1]?.journalFact().payload).toEqual({ previousValue: "closed" });
  });

  it("refuse en 404 quand la clé est déjà sur le défaut, sans trace", async () => {
    const h = harness();

    await expect(h.clear.execute(new ClearFeatureOverrideCommand("shop"))).rejects.toThrow(
      FeatureOverrideNotFoundError,
    );

    expect(h.events.traced).toEqual([]);
  });
});

describe("AddFeatureExemptionHandler", () => {
  it("ajoute l'adresse normalisée et trace l'ajout dans l'unité de travail", async () => {
    const h = harness();

    const id = await h.add.execute(
      new AddFeatureExemptionCommand("shop", " Testeur@Exemple.FR ", "staff|admin"),
    );

    expect(id).toBe("ex_000001");
    expect(h.steps.log).toEqual([
      "uow:begin",
      "exemption:add:testeur@exemple.fr",
      "journal:feature_access.exemption_added",
      "uow:end",
    ]);
    expect(h.exemptions.rows[0]?.author).toEqual({
      sub: "staff|admin",
      name: "Camille Admin",
      role: "admin",
    });
  });

  it("est idempotent sur (clé, adresse) : même id, une seule ligne, une seule trace", async () => {
    const h = harness();
    const first = await h.add.execute(
      new AddFeatureExemptionCommand("shop", "testeur@exemple.fr", "staff|admin"),
    );

    const second = await h.add.execute(
      new AddFeatureExemptionCommand("shop", "TESTEUR@exemple.fr", "staff|admin"),
    );

    expect(second).toBe(first);
    expect(h.exemptions.rows).toHaveLength(1);
    expect(h.events.traced).toHaveLength(1);
  });

  it("refuse une adresse invalide avant toute écriture", async () => {
    const h = harness();

    await expect(
      h.add.execute(new AddFeatureExemptionCommand("shop", "pas-une-adresse", "staff|admin")),
    ).rejects.toThrow(InvalidEmailError);

    expect(h.steps.log).toEqual([]);
  });
});

describe("RemoveFeatureExemptionHandler", () => {
  it("retire l'exemption et trace l'adresse retirée", async () => {
    const h = harness();
    const id = await h.add.execute(
      new AddFeatureExemptionCommand("shop", "testeur@exemple.fr", "staff|admin"),
    );

    await h.remove.execute(new RemoveFeatureExemptionCommand("shop", id));

    expect(h.exemptions.rows).toEqual([]);
    expect(h.events.traced[1]?.journalFact()).toMatchObject({
      type: "feature_access.exemption_removed",
      payload: { exemptionId: id, email: "testeur@exemple.fr" },
    });
  });

  it("refuse en 404 un id inconnu, ou rangé sous une autre clé", async () => {
    const h = harness();
    const id = await h.add.execute(
      new AddFeatureExemptionCommand("shop", "testeur@exemple.fr", "staff|admin"),
    );

    await expect(
      h.remove.execute(new RemoveFeatureExemptionCommand("other_key", id)),
    ).rejects.toThrow(FeatureExemptionNotFoundError);
    expect(h.exemptions.rows).toHaveLength(1);
  });
});
