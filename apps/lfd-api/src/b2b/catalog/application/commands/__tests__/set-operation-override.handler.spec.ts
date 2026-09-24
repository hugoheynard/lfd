import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CatalogOperation } from "../../../domain/entities/catalog-operation.js";
import type { OperationRestriction } from "../../../domain/entities/catalog-operation-override.js";
import {
  CatalogOperationNotFoundError,
  InvalidOperationOverrideError,
} from "../../../domain/errors/catalog-operation-errors.js";
import { SetOperationOverrideCommand } from "../set-operation-override.command.js";
import { SetOperationOverrideHandler } from "../set-operation-override.handler.js";
import { InMemoryOperations, InMemoryOverrides, receivedNoel } from "./operation-doubles.js";

const DECIDED_AT = new Date("2026-09-24T10:00:00.000Z");

const nothing: OperationRestriction = {
  isHidden: false,
  orderUntil: null,
  audience: null,
  hiddenSkus: [],
};

function build(
  operations: readonly CatalogOperation[] = [CatalogOperation.receive(receivedNoel())],
) {
  const overrides = new InMemoryOverrides();
  const events = new RecordingPublisher();
  const handler = new SetOperationOverrideHandler(
    new InMemoryOperations(operations),
    overrides,
    new FixedClock(DECIDED_AT),
    events,
    new DirectUnitOfWork(),
  );
  const decide = (restriction: OperationRestriction, key = "noel-2026") =>
    handler.execute(new SetOperationOverrideCommand(key, restriction, "staff_1"));
  return { overrides, events, decide };
}

describe("SetOperationOverrideHandler — restreindre une opération reçue (D9)", () => {
  it("pose la surcharge, son auteur, sa date, et la journalise", async () => {
    const { overrides, events, decide } = build();
    const orderUntil = new Date("2026-12-19T17:00:00.000Z");

    await decide({ ...nothing, orderUntil, audience: "pro", hiddenSkus: ["VIE-001-1"] });

    expect(overrides.rows.get("noel-2026")).toEqual({
      operationKey: "noel-2026",
      restriction: { isHidden: false, orderUntil, audience: "pro", hiddenSkus: ["VIE-001-1"] },
      decidedBy: "staff_1",
      decidedAt: DECIDED_AT,
    });
    expect(events.factTypes()).toEqual(["catalog_operation.override_set"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "catalog_operation",
      subjectId: "noel-2026",
      payload: {
        subjectLabel: "Noël",
        isHidden: false,
        orderUntil: "2026-12-19T17:00:00.000Z",
        audience: "pro",
        hiddenSkus: ["VIE-001-1"],
      },
    });
  });

  /**
   * D9 : la surcharge ne se vérifie PAS contre le référentiel. Une clôture plus
   * tardive que la sienne s'enregistre ; elle n'aura simplement aucun effet.
   */
  it("accepte une clôture plus tardive que celle du référentiel", async () => {
    const { overrides, decide } = build();

    await decide({ ...nothing, orderUntil: new Date("2026-12-23T11:00:00.000Z") });

    expect(overrides.saves).toBe(1);
  });

  it("se pose sur une opération RETIRÉE — elle se relit, et reviendra peut-être", async () => {
    const withdrawn = CatalogOperation.receive(receivedNoel());
    withdrawn.withdraw(new Date("2026-09-20T00:00:00.000Z"));
    const { overrides, decide } = build([withdrawn]);

    await decide({ ...nothing, isHidden: true });

    expect(overrides.rows.get("noel-2026")?.restriction.isHidden).toBe(true);
  });

  it("refuse une opération jamais reçue, sans rien écrire", async () => {
    const { overrides, events, decide } = build();

    await expect(decide(nothing, "paques-2027")).rejects.toBeInstanceOf(
      CatalogOperationNotFoundError,
    );
    expect(overrides.saves).toBe(0);
    expect(events.factTypes()).toEqual([]);
  });

  it("refuse une forme fausse, sans rien écrire", async () => {
    const { overrides, events, decide } = build();

    await expect(decide({ ...nothing, hiddenSkus: ["A", "A"] })).rejects.toBeInstanceOf(
      InvalidOperationOverrideError,
    );
    expect(overrides.saves).toBe(0);
    expect(events.factTypes()).toEqual([]);
  });

  it("n'écrit aucun fait quand la décision est réenregistrée à l'identique", async () => {
    const { overrides, events, decide } = build();
    await decide({ ...nothing, audience: "pro" });

    await decide({ ...nothing, audience: "pro" });

    expect(overrides.saves).toBe(1);
    expect(events.factTypes()).toEqual(["catalog_operation.override_set"]);
  });
});
