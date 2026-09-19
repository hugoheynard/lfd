import { NotFoundException } from "@nestjs/common";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { OccurrenceOutsideWindowError } from "../../../domain/errors/subscription-errors.js";
import { UpsertOccurrenceOverrideCommand } from "../upsert-occurrence-override.command.js";
import { UpsertOccurrenceOverrideHandler } from "../upsert-occurrence-override.handler.js";
import { activeSubscription, FakeSubscriptionRepository } from "./fake-subscription-repository.js";

function build() {
  const repo = new FakeSubscriptionRepository();
  const events = new RecordingPublisher();
  const handler = new UpsertOccurrenceOverrideHandler(repo, events, new DirectUnitOfWork());
  return { repo, events, handler };
}

/** Une échéance dans la fenêtre du panier témoin — comparée à elle seule, jamais à l'horloge. */
const DATE = "2026-09-01";

describe("UpsertOccurrenceOverrideHandler", () => {
  it("404 quand l'abonnement n'est pas au mur — ni écriture, ni fait", async () => {
    const { events, handler } = build();

    await expect(
      handler.execute(
        new UpsertOccurrenceOverrideCommand("user_1", "sub_1", DATE, {
          skipped: true,
          lines: [],
          note: "",
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(events.traced).toHaveLength(0);
  });

  it("déroge à l'échéance, sauve l'agrégat, et journalise la dérogation sans sa note", async () => {
    const { repo, events, handler } = build();
    repo.loadResult = activeSubscription();

    await handler.execute(
      new UpsertOccurrenceOverrideCommand("user_1", "sub_1", DATE, {
        skipped: false,
        lines: [{ sku: "SKU-2", quantity: 3 }],
        note: "Sonner au 06 12 34 56 78",
      }),
    );

    const overrides = repo.saved[0]?.toPersistence().overrides ?? [];
    expect(overrides).toHaveLength(1);
    expect(overrides[0]?.lines).toEqual([{ sku: "SKU-2", quantity: 3 }]);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "subscription.occurrence_overridden",
        subjectType: "subscription",
        subjectId: "sub_1",
        payload: {
          date: DATE,
          before: null,
          after: { skipped: false, lines: [{ sku: "SKU-2", quantity: 3 }] },
        },
      },
    ]);
  });

  it("une seconde dérogation sur la même date dit celle qu'elle remplace", async () => {
    const { repo, events, handler } = build();
    repo.loadResult = activeSubscription();
    await handler.execute(
      new UpsertOccurrenceOverrideCommand("user_1", "sub_1", DATE, {
        skipped: true,
        lines: [],
        note: "",
      }),
    );

    await handler.execute(
      new UpsertOccurrenceOverrideCommand("user_1", "sub_1", DATE, {
        skipped: false,
        lines: [{ sku: "SKU-2", quantity: 5 }],
        note: "",
      }),
    );

    expect(events.traced[1]?.journalFact().payload).toEqual({
      date: DATE,
      before: { skipped: true, lines: [] },
      after: { skipped: false, lines: [{ sku: "SKU-2", quantity: 5 }] },
    });
  });

  it("une échéance hors fenêtre est refusée par l'agrégat, sans fait", async () => {
    const { repo, events, handler } = build();
    repo.loadResult = activeSubscription();

    await expect(
      handler.execute(
        new UpsertOccurrenceOverrideCommand("user_1", "sub_1", "2030-01-01", {
          skipped: true,
          lines: [],
          note: "",
        }),
      ),
    ).rejects.toBeInstanceOf(OccurrenceOutsideWindowError);
    expect(repo.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });
});
