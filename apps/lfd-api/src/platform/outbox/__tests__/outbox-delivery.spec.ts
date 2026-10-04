import { OutboxDelivery, type OutboxDeliveryState } from "../outbox-delivery.js";
import { OutboxDeliveryAlreadyDeliveredError } from "../outbox-errors.js";

const NOW = new Date(1_800_000_000_000);
const EARLIER = new Date(NOW.getTime() - 3_600_000);

function dead(overrides: Partial<OutboxDeliveryState> = {}): OutboxDelivery {
  return OutboxDelivery.rehydrate({
    eventId: "outbox_1",
    subscriber: "commerce.order-ready",
    attempts: 10,
    nextAttemptAt: EARLIER,
    claimedUntil: EARLIER,
    deliveredAt: null,
    lastError: "commande introuvable",
    ...overrides,
  });
}

describe("le rejeu d'une livraison", () => {
  it("remet les essais à zéro, la rend due maintenant et libère le bail", () => {
    const delivery = dead();
    delivery.replay(NOW);
    expect(delivery.toState()).toMatchObject({
      attempts: 0,
      nextAttemptAt: NOW,
      claimedUntil: null,
    });
  });

  it("garde la dernière erreur : c'est le seul témoin de ce qui a bloqué", () => {
    const delivery = dead();
    delivery.replay(NOW);
    expect(delivery.toState().lastError).toBe("commande introuvable");
  });

  it("refuse de rejouer une livraison déjà faite — l'effet partirait deux fois", () => {
    const delivery = dead({ deliveredAt: EARLIER });
    expect(() => {
      delivery.replay(NOW);
    }).toThrow(OutboxDeliveryAlreadyDeliveredError);
  });
});
