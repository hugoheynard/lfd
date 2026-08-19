import { Subscription } from "../../../domain/entities/subscription.js";
import {
  type CreatedSubscription,
  SubscriptionRepository,
} from "../../../domain/ports/subscription.repository.js";
import { IsoDate } from "../../../domain/value-objects/iso-date.js";
import { SubscriptionLine } from "../../../domain/value-objects/subscription-line.js";

/**
 * Double de test du port d'écriture : capture ce qu'on lui passe (pas de jest.fn
 * pour rester typé sans `as`). `loadResult` fixe ce que `load` renvoie.
 */
export class FakeSubscriptionRepository implements SubscriptionRepository {
  readonly created: Subscription[] = [];
  readonly saved: Subscription[] = [];
  readonly removed: string[] = [];
  loadResult: Subscription | null = null;

  create(subscription: Subscription): Promise<CreatedSubscription> {
    this.created.push(subscription);
    return Promise.resolve({ id: "sub_created" });
  }

  load(): Promise<Subscription | null> {
    return Promise.resolve(this.loadResult);
  }

  save(subscription: Subscription): Promise<void> {
    this.saved.push(subscription);
    return Promise.resolve();
  }

  remove(subscriptionId: string): Promise<void> {
    this.removed.push(subscriptionId);
    return Promise.resolve();
  }
}

/** Un abonnement **actif** reconstitué (comme s'il venait de la base). */
export function activeSubscription(id = "sub_1"): Subscription {
  return Subscription.reconstitute({
    id,
    placedByUserId: "user_1",
    fromOrderId: null,
    recurrence: "weekly",
    status: "active",
    startDate: IsoDate.fromString("2026-08-10"),
    endDate: IsoDate.fromString("2026-12-10"),
    routing: { method: "pickup", deliveryAddress: null, pickupAddressId: null },
    note: "",
    lines: [SubscriptionLine.create("SKU-1", 2)],
    overrides: [],
  });
}
