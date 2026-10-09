import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  FeatureExemptionNotFoundError,
  FeatureNotExemptibleError,
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

    await h.set.execute(new SetFeatureOverrideCommand("customerMandate", "open", "staff_admin"));

    expect(h.steps.log).toEqual([
      "uow:begin",
      "override:put:customerMandate",
      "journal:feature_access.override_set",
      "uow:end",
    ]);
    expect(h.events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "feature_access",
      subjectId: "customerMandate",
      // Le nom de la fonctionnalité, figé depuis le catalogue fermé (lot B).
      payload: { subjectLabel: "Mandat SEPA client", value: "open", previousValue: null },
    });
  });

  it("fige l'auteur (id de fiche, nom, rôle) et l'instant du Clock", async () => {
    const h = harness();

    await h.set.execute(new SetFeatureOverrideCommand("customerMandate", "closed", "staff_admin"));

    const row = h.overrides.rows.get("customerMandate");
    expect(row?.author).toEqual({
      staffUserId: "staff_admin",
      name: "Camille Admin",
      role: "admin",
    });
    expect(row?.at).toBe(NOW);
  });

  it("garde l'id de fiche seul quand l'annuaire ne connaît pas l'agent", async () => {
    const h = harness();

    await h.set.execute(
      new SetFeatureOverrideCommand("customerMandate", "closed", "staff_inconnu"),
    );

    expect(h.overrides.rows.get("customerMandate")?.author).toEqual({
      staffUserId: "staff_inconnu",
      name: "",
      role: "",
    });
  });

  it("dit au journal la valeur remplacée", async () => {
    const h = harness();
    await h.set.execute(new SetFeatureOverrideCommand("customerMandate", "open", "staff_admin"));

    await h.set.execute(new SetFeatureOverrideCommand("customerMandate", "closed", "staff_admin"));

    expect(h.events.traced[1]?.journalFact().payload).toEqual({
      subjectLabel: "Mandat SEPA client",
      value: "closed",
      previousValue: "open",
    });
  });

  it("refuse une valeur hors catalogue AVANT toute écriture ni trace", async () => {
    const h = harness();

    await expect(
      h.set.execute(new SetFeatureOverrideCommand("customerMandate", "order", "staff_admin")),
    ).rejects.toThrow(UnknownFeatureLevelError);

    expect(h.steps.log).toEqual([]);
  });

  it("refuse une clé hors catalogue AVANT toute écriture", async () => {
    const h = harness();

    await expect(
      h.set.execute(new SetFeatureOverrideCommand("legacy_flag", "order", "staff_admin")),
    ).rejects.toThrow(UnknownFeatureError);

    expect(h.steps.log).toEqual([]);
  });
});

describe("ClearFeatureOverrideHandler", () => {
  it("supprime la dérogation et trace la valeur retirée", async () => {
    const h = harness();
    await h.set.execute(new SetFeatureOverrideCommand("customerMandate", "closed", "staff_admin"));
    h.steps.log.length = 0;

    await h.clear.execute(new ClearFeatureOverrideCommand("customerMandate"));

    expect(h.overrides.rows.has("customerMandate")).toBe(false);
    expect(h.steps.log).toEqual([
      "uow:begin",
      "override:remove:customerMandate",
      "journal:feature_access.override_cleared",
      "uow:end",
    ]);
    expect(h.events.traced[1]?.journalFact().payload).toEqual({
      subjectLabel: "Mandat SEPA client",
      previousValue: "closed",
    });
  });

  it("refuse en 404 quand la clé est déjà sur le défaut, sans trace", async () => {
    const h = harness();

    await expect(
      h.clear.execute(new ClearFeatureOverrideCommand("customerMandate")),
    ).rejects.toThrow(FeatureOverrideNotFoundError);

    expect(h.events.traced).toEqual([]);
  });
});

/**
 * Depuis le 2026-10-09, le catalogue n'a plus aucune clé exemptible : l'ajout
 * réussi et le retrait d'une exemption ne s'expriment plus avec une vraie clé.
 * Reste le refus, qui est désormais le seul chemin de l'ajout.
 */
describe("AddFeatureExemptionHandler", () => {
  /** Plan mandat client §8 (2026-09-14) : la clé ne s'ouvre pas adresse par adresse. */
  it("refuse d'exempter sur le mandat client, sans écriture ni trace", async () => {
    const h = harness();

    await expect(
      h.add.execute(
        new AddFeatureExemptionCommand("customerMandate", "testeur@exemple.fr", "staff_admin"),
      ),
    ).rejects.toThrow(FeatureNotExemptibleError);

    expect(h.steps.log).toEqual([]);
  });

  it("refuse d'exempter sur une clé retirée, sans écriture ni trace", async () => {
    const h = harness();

    await expect(
      h.add.execute(new AddFeatureExemptionCommand("shop", "testeur@exemple.fr", "staff_admin")),
    ).rejects.toThrow(UnknownFeatureError);

    expect(h.steps.log).toEqual([]);
  });
});

describe("RemoveFeatureExemptionHandler", () => {
  it("refuse en 404 un id inconnu, sans trace", async () => {
    const h = harness();

    await expect(
      h.remove.execute(new RemoveFeatureExemptionCommand("shop", "ex_inconnu")),
    ).rejects.toThrow(FeatureExemptionNotFoundError);
    expect(h.events.traced).toEqual([]);
  });
});
