import type { OrderCutoffPayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { GeneralOrderCutoffRule } from "../../domain/general-order-cutoff.js";
import { GeneralOrderCutoffRepository } from "../../domain/general-order-cutoff.repository.js";
import { OrderCutoffScopeRetiredError } from "../../domain/order-cutoff-errors.js";
import { DefineGeneralOrderCutoffCommand } from "../define-general-order-cutoff.command.js";
import { DefineGeneralOrderCutoffHandler } from "../define-general-order-cutoff.handler.js";

const VEILLE_17H: OrderCutoffPayload = {
  pickupAddressId: null,
  weekday: null,
  daysBefore: 1,
  time: "17:00",
  graceMinutes: 0,
};

/** La règle rangée, en mémoire : ce qui a été écrit, dans l'ordre. */
class Stored extends GeneralOrderCutoffRepository {
  readonly saved: GeneralOrderCutoffRule[] = [];
  constructor(private current: GeneralOrderCutoffRule | null = null) {
    super();
  }
  load(): Promise<GeneralOrderCutoffRule | null> {
    return Promise.resolve(this.current);
  }
  save(rule: GeneralOrderCutoffRule): Promise<void> {
    this.saved.push(rule);
    this.current = rule;
    return Promise.resolve();
  }
}

function define(
  stored: Stored,
  events: RecordingPublisher,
  payload: OrderCutoffPayload = VEILLE_17H,
): Promise<void> {
  return new DefineGeneralOrderCutoffHandler(
    stored,
    new FixedIdGenerator("cutoff"),
    events,
    new DirectUnitOfWork(),
  ).execute(new DefineGeneralOrderCutoffCommand(payload));
}

describe("DefineGeneralOrderCutoffHandler", () => {
  it("pose la règle générale et journalise la règle ENTIÈRE — chaque champ change la réponse", async () => {
    const stored = new Stored();
    const events = new RecordingPublisher();

    await define(stored, events);

    expect(stored.saved.map((rule) => [rule.id, rule.terms])).toEqual([
      ["cutoff_000001", { daysBefore: 1, time: "17:00", graceMinutes: 0 }],
    ]);
    const fact = events.traced[0]?.journalFact();
    expect(fact?.type).toBe("order_cutoff.created");
    expect(fact?.subjectId).toBe("cutoff_000001");
    // `null` n'est pas une absence : c'est « tous les points » et « tous les
    // jours », la forme des faits passés.
    expect(fact?.payload).toEqual({
      pickupAddress: null,
      weekday: null,
      daysBefore: 1,
      time: "17:00",
      graceMinutes: 0,
    });
  });

  it("règle la règle en place sans en créer une seconde", async () => {
    const stored = new Stored(
      GeneralOrderCutoffRule.rehydrate("c1", { daysBefore: 1, time: "18:00", graceMinutes: 0 }),
    );
    const events = new RecordingPublisher();

    await define(stored, events, { ...VEILLE_17H, time: "23:00", graceMinutes: 30 });

    expect(stored.saved.map((rule) => [rule.id, rule.terms])).toEqual([
      ["c1", { daysBefore: 1, time: "23:00", graceMinutes: 30 }],
    ]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "order_cutoff.updated",
      subjectId: "c1",
    });
  });

  /** 2026-10-21 : une règle par point ou par jour ne se crée plus, ni ne s'écrit. */
  it("refuse un point ou un jour sans rien écrire ni journaliser", async () => {
    const stored = new Stored();
    const events = new RecordingPublisher();

    await expect(
      define(stored, events, { ...VEILLE_17H, pickupAddressId: "labo" }),
    ).rejects.toBeInstanceOf(OrderCutoffScopeRetiredError);
    await expect(define(stored, events, { ...VEILLE_17H, weekday: "sat" })).rejects.toBeInstanceOf(
      OrderCutoffScopeRetiredError,
    );

    expect(stored.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});
