import { FixedClock } from "../../time/fixed-clock.js";
import { OutboxDelivery } from "../outbox-delivery.js";
import {
  OutboxDeliveryAlreadyDeliveredError,
  OutboxDeliveryNotFoundError,
} from "../outbox-errors.js";
import { ReplayOutboxDeliveryCommand } from "../replay-outbox-delivery.command.js";
import { ReplayOutboxDeliveryHandler } from "../replay-outbox-delivery.handler.js";
import { CountingTrigger, InMemoryDeliveryRepository } from "./outbox-doubles.js";

const NOW = new Date(1_800_000_000_000);
const EARLIER = new Date(NOW.getTime() - 3_600_000);

function dead(deliveredAt: Date | null = null): OutboxDelivery {
  return OutboxDelivery.rehydrate({
    eventId: "outbox_1",
    subscriber: "test.counter",
    attempts: 10,
    nextAttemptAt: EARLIER,
    claimedUntil: null,
    deliveredAt,
    lastError: "panne",
  });
}

const COMMAND = new ReplayOutboxDeliveryCommand("outbox_1", "test.counter");

describe("le rejeu manuel d'une lettre morte", () => {
  it("remet les essais à zéro, sauve l'agrégat, puis réveille le relais", async () => {
    const repository = new InMemoryDeliveryRepository(dead());
    const trigger = new CountingTrigger();
    await new ReplayOutboxDeliveryHandler(repository, trigger, new FixedClock(NOW)).execute(
      COMMAND,
    );

    expect(repository.saved[0]?.toState()).toMatchObject({ attempts: 0, nextAttemptAt: NOW });
    expect(trigger.wakes).toBe(1);
  });

  it("refuse un couple inconnu, sans réveiller personne", async () => {
    const trigger = new CountingTrigger();
    const handler = new ReplayOutboxDeliveryHandler(
      new InMemoryDeliveryRepository(null),
      trigger,
      new FixedClock(NOW),
    );
    await expect(handler.execute(COMMAND)).rejects.toThrow(OutboxDeliveryNotFoundError);
    expect(trigger.wakes).toBe(0);
  });

  it("refuse une livraison déjà faite, sans rien sauver", async () => {
    const repository = new InMemoryDeliveryRepository(dead(EARLIER));
    const handler = new ReplayOutboxDeliveryHandler(
      repository,
      new CountingTrigger(),
      new FixedClock(NOW),
    );
    await expect(handler.execute(COMMAND)).rejects.toThrow(OutboxDeliveryAlreadyDeliveredError);
    expect(repository.saved).toHaveLength(0);
  });
});
