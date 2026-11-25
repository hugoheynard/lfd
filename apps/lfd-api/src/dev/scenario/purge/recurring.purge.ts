import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/** Le geste d'ouverture d'un panier, dans le registre des intentions (`open-basket.handler.ts`). */
const OPEN_BASKET_GESTURE = "subscriptions.create";
/** L'acteur d'une intention de client (`customerIntentActor`). */
const CUSTOMER_ACTOR_PREFIX = "customer:";
/** L'ouverture, au journal de la personne (`on-subscription-created.handler.ts`). */
const SUBSCRIPTION_CREATED = "subscription.created";

/** Ce que la purge des paniers a emporté. */
export interface RecurringPurgeReport {
  /** Paniers, lignes, échéances et intentions d'ouverture. */
  readonly rows: number;
  /** Les lignes du journal d'activité qui les racontaient. */
  readonly journal: number;
}

/**
 * **Les paniers récurrents du scénario** (schéma `recurring`) : ceux de ses
 * acheteurs ou de ses sociétés, leurs échéances et leurs lignes, les
 * intentions de leur ouverture et ce que le journal d'activité en dit.
 *
 * Aucune clé ne relie ces tables au commerce : la purge les retrouve par
 * l'acheteur et la société, comme `reset.seed.ts`. Échéances et lignes avant
 * le panier (clés `Restrict` internes au schéma). Les commandes qu'ils ont
 * passées partent avec celles du scénario (`commerce.purge.ts`), et leurs
 * faits d'outbox par la société ou la journée (`outbox.purge.ts`).
 */
export async function purgeRecurring(
  tx: PurgeClient,
  scope: ScenarioScope,
): Promise<RecurringPurgeReport> {
  const users = [...scope.userIds];
  const ofBaskets = {
    OR: [{ buyerUserId: { in: users } }, { companyId: { in: [...scope.companyIds] } }],
  };
  const baskets = await tx.basket.findMany({ where: ofBaskets, select: { id: true } });
  const basketIds = baskets.map((basket) => basket.id);
  const counts = [
    await tx.occurrence.deleteMany({ where: { basketId: { in: basketIds } } }),
    await tx.basketLine.deleteMany({ where: { basketId: { in: basketIds } } }),
    await tx.basket.deleteMany({ where: { id: { in: basketIds } } }),
    await tx.gestureIntent.deleteMany({
      where: {
        gesture: OPEN_BASKET_GESTURE,
        actorId: { in: users.map((user) => `${CUSTOMER_ACTOR_PREFIX}${user}`) },
      },
    }),
  ];
  const journal = await tx.activityEvent.deleteMany({
    where: {
      OR: [
        { subjectId: { in: basketIds } },
        { type: SUBSCRIPTION_CREATED, subjectType: "user", subjectId: { in: users } },
      ],
    },
  });
  return {
    rows: counts.reduce((total, { count }) => total + count, 0),
    journal: journal.count,
  };
}
