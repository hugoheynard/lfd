import type { CreateSubscriptionPayload } from "@lfd/contracts";

import { noSaleOperations } from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import {
  SUBSCRIPTION_CREATED,
  SUBSCRIPTION_DELETED,
  SUBSCRIPTION_STATUS_CHANGED,
} from "../../../../account/domain/events/site-gesture.fact.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { SubscriptionSiteMembershipLostError } from "../../../domain/errors/subscription-errors.js";
import { CreateSubscriptionCommand } from "../create-subscription.command.js";
import { CreateSubscriptionHandler } from "../create-subscription.handler.js";
import { DeleteSubscriptionCommand } from "../delete-subscription.command.js";
import { DeleteSubscriptionHandler } from "../delete-subscription.handler.js";
import { SetSubscriptionStatusCommand } from "../set-subscription-status.command.js";
import { SetSubscriptionStatusHandler } from "../set-subscription-status.handler.js";
import { UpsertOccurrenceOverrideCommand } from "../upsert-occurrence-override.command.js";
import { UpsertOccurrenceOverrideHandler } from "../upsert-occurrence-override.handler.js";
import { activeSubscription, FakeSubscriptionRepository } from "./fake-subscription-repository.js";
import { subscriptionGestures } from "./subscription-gesture-doubles.js";

/**
 * N4e (`plan-notifications-sous-comptes.md`) : la société de l'espace sur le
 * panier, un fait durable par geste annoncé au principal du site, et le mur
 * du rattachement ACTUEL sur un panier de société.
 */
const payload: CreateSubscriptionPayload = {
  fromOrderId: null,
  recurrence: "weekly",
  startDate: "2026-08-10",
  endDate: null,
  fulfillmentMethod: "pickup",
  deliveryAddress: null,
  pickupAddressId: null,
  lines: [{ sku: "SKU-1", quantity: 2 }],
  note: "",
};

function build(options: { readonly member?: boolean } = {}) {
  const repo = new FakeSubscriptionRepository();
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  const doubles = subscriptionGestures(repo, options);
  return {
    repo,
    durable: doubles.durable,
    create: new CreateSubscriptionHandler(
      repo,
      events,
      noSaleOperations(new Date("2026-08-01T08:00:00.000Z")),
      uow,
      doubles.gestures,
    ),
    status: new SetSubscriptionStatusHandler(repo, events, uow, doubles.gestures),
    remove: new DeleteSubscriptionHandler(repo, events, uow, doubles.gestures),
    override: new UpsertOccurrenceOverrideHandler(repo, events, uow, doubles.gestures),
  };
}

describe("la création porte la société de l'espace (N4e)", () => {
  it("dans l'espace d'un site : le panier porte la société, le fait part avec l'id créé", async () => {
    const { create, repo, durable } = build();
    await create.execute(new CreateSubscriptionCommand("user_1", payload, "chalet"));

    expect(repo.created[0]?.toPersistence().companyId).toBe("chalet");
    expect(durable.facts.map((fact) => fact.type)).toEqual([SUBSCRIPTION_CREATED]);
    expect(durable.facts[0]?.payload).toMatchObject({
      subjectId: "sub_created",
      siteCompanyId: "chalet",
      siteName: "Chalet Gentiane",
      principalCompanyId: "alpes",
      authorUserId: "user_1",
      byTeam: false,
    });
  });

  it("en perso : société nulle, aucun fait (pas de site)", async () => {
    const { create, repo, durable } = build();
    await create.execute(new CreateSubscriptionCommand("user_1", payload, null));
    expect(repo.created[0]?.toPersistence().companyId).toBeNull();
    expect(durable.facts).toEqual([]);
  });

  it("une société dont l'acteur n'est pas membre : refus, rien de créé", async () => {
    const { create, repo } = build({ member: false });
    await expect(
      create.execute(new CreateSubscriptionCommand("user_1", payload, "chalet")),
    ).rejects.toBeInstanceOf(SubscriptionSiteMembershipLostError);
    expect(repo.created).toEqual([]);
  });
});

describe("les gestes sur un panier de société (N4e)", () => {
  it("pause puis reprise : un fait chacun, l'état d'arrivée dans la charge", async () => {
    const { status, repo, durable } = build();
    repo.loadResult = activeSubscription("sub_1", "chalet");

    await status.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "paused"));
    await status.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "active"));

    expect(durable.facts.map((fact) => [fact.type, fact.payload["status"]])).toEqual([
      [SUBSCRIPTION_STATUS_CHANGED, "paused"],
      [SUBSCRIPTION_STATUS_CHANGED, "active"],
    ]);
  });

  it("arrêt : le fait vient de l'état chargé, sans relire la ligne", async () => {
    const { remove, repo, durable } = build();
    repo.loadResult = activeSubscription("sub_9", "chalet");
    await remove.execute(new DeleteSubscriptionCommand("user_1", "sub_9"));
    expect(repo.removed).toEqual(["sub_9"]);
    expect(durable.facts[0]).toMatchObject({
      type: SUBSCRIPTION_DELETED,
      payload: { subjectId: "sub_9", siteCompanyId: "chalet" },
    });
  });

  it("une échéance dérogée ne prévient pas (décision de Hugo, 2026-10-20)", async () => {
    const { override, repo, durable } = build();
    repo.loadResult = activeSubscription("sub_1", "chalet");
    await override.execute(
      new UpsertOccurrenceOverrideCommand("user_1", "sub_1", "2026-08-17", {
        skipped: true,
        lines: [],
        note: "",
      }),
    );
    expect(repo.saved).toHaveLength(1);
    expect(durable.facts).toEqual([]);
  });

  it("un panier perso : les gestes passent sans mur de société ni fait", async () => {
    const { status, repo, durable } = build({ member: false });
    repo.loadResult = activeSubscription("sub_1", null);
    await status.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "paused"));
    expect(repo.saved).toHaveLength(1);
    expect(durable.facts).toEqual([]);
  });
});

/** Le trou du mur : une personne qui a quitté la société gardait la main sur le panier du site. */
describe("le mur du rattachement actuel (N4e)", () => {
  it.each([
    [
      "pause",
      (h: ReturnType<typeof build>) =>
        h.status.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "paused")),
    ],
    [
      "arrêt",
      (h: ReturnType<typeof build>) =>
        h.remove.execute(new DeleteSubscriptionCommand("user_1", "sub_1")),
    ],
    [
      "dérogation",
      (h: ReturnType<typeof build>) =>
        h.override.execute(
          new UpsertOccurrenceOverrideCommand("user_1", "sub_1", "2026-08-17", {
            skipped: true,
            lines: [],
            note: "",
          }),
        ),
    ],
  ])("%s par un ancien membre : refus nommé, rien d'écrit", async (_geste, act) => {
    const h = build({ member: false });
    h.repo.loadResult = activeSubscription("sub_1", "chalet");

    const refused = act(h);
    await expect(refused).rejects.toBeInstanceOf(SubscriptionSiteMembershipLostError);
    await expect(act(h)).rejects.toThrow(
      "Vous n'êtes plus membre de Chalet Gentiane : cet abonnement ne se gère plus depuis votre compte.",
    );
    expect(h.repo.saved).toEqual([]);
    expect(h.repo.removed).toEqual([]);
    expect(h.durable.facts).toEqual([]);
  });

  it("un membre actuel passe", async () => {
    const h = build();
    h.repo.loadResult = activeSubscription("sub_1", "chalet");
    await h.status.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "paused"));
    expect(h.repo.saved).toHaveLength(1);
  });
});
