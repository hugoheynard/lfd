import type { VitrineElementKeys } from "@lfd/contracts";

import {
  VitrineDeliveryEmptyError,
  VitrineDeliveryNotPendingError,
  VitrineDeliveryNotResendableError,
} from "../errors/vitrine-errors.js";
import { VitrineChanges } from "../vitrine-changes.js";
import { VitrineDelivery } from "../vitrine-delivery.js";
import { AT, LATER } from "./vitrine-fixtures.js";

const NONE: VitrineElementKeys = { items: [], operations: [], shelves: [], texts: [] };
const SOME = VitrineChanges.of({ changed: { ...NONE, items: ["CRO-01"] }, removed: NONE });

function prepared(): VitrineDelivery {
  return VitrineDelivery.prepare({
    id: "d1",
    subscriberId: "s1",
    sequence: 3,
    changes: SOME,
    at: AT,
  });
}

describe("une livraison à un abonné", () => {
  it("n'est jamais vide", () => {
    expect(() =>
      VitrineDelivery.prepare({
        id: "d",
        subscriberId: "s",
        sequence: 1,
        changes: VitrineChanges.none(),
        at: AT,
      }),
    ).toThrow(VitrineDeliveryEmptyError);
  });

  it("porte un signal : l'abonné, la séquence, l'instant, les identifiants", () => {
    expect(prepared().notification()).toEqual({
      subscriber: "s1",
      sequence: 3,
      at: AT.toISOString(),
      changed: { ...NONE, items: ["CRO-01"] },
      removed: NONE,
    });
  });

  it("absorbe la suivante tant qu'elle attend, en gardant sa séquence et ses essais", () => {
    const delivery = prepared();
    delivery.recordFailure({ status: 503, reason: "indisponible" }, LATER, AT);
    delivery.absorb(
      VitrineChanges.of({ changed: { ...NONE, texts: ["t"] }, removed: NONE }),
      LATER,
      "d1-bis",
    );
    expect(delivery.attempts).toBe(1);
    expect(delivery.notification()).toMatchObject({
      sequence: 3,
      changed: { items: ["CRO-01"], texts: ["t"] },
    });
  });

  /**
   * Régression (2026-10-18) : une livraison qui absorbait de nouveaux
   * changements repartait sous le même `Vitrine-Delivery` — l'agence qui
   * écarte les doublons par lui perdait les ajouts.
   */
  it("une agence qui écarte les doublons par Vitrine-Delivery ne perd plus les ajouts absorbés", () => {
    const delivery = prepared();
    expect(delivery.dispatchId).toBe("d1");
    delivery.recordFailure({ status: 504, reason: "délai" }, LATER, AT);
    delivery.absorb(SOME, LATER, "d1-bis");
    expect(delivery.dispatchId).toBe("d1-bis");
    // La ligne du journal et la séquence restent.
    expect(delivery.id).toBe("d1");
    expect(delivery.notification().sequence).toBe(3);
  });

  it("épuisée, passe en échec ; partie, n'absorbe plus", () => {
    const delivery = prepared();
    delivery.recordFailure({ status: null, reason: "x".repeat(500) }, null, LATER);
    expect(delivery.isFailed).toBe(true);
    expect(delivery.toPersistence().lastError).toHaveLength(300);
    expect(() => delivery.absorb(SOME, LATER, "d2")).toThrow(VitrineDeliveryNotPendingError);
  });

  it("se renvoie une fois partie, essais remis à zéro ; jamais pendant qu'elle attend", () => {
    const delivery = prepared();
    expect(() => delivery.requeue(LATER)).toThrow(VitrineDeliveryNotResendableError);
    delivery.recordSuccess(204, LATER);
    delivery.requeue(LATER);
    expect(delivery.toPersistence()).toMatchObject({ state: "pending", attempts: 0 });
  });

  it("un essai n'est jamais relancé, et ne se renvoie pas", () => {
    const test = VitrineDelivery.test({ id: "t", subscriberId: "s1", at: AT });
    expect(test.notification()).toMatchObject({ sequence: 0, test: true });
    test.recordFailure({ status: 500, reason: "x" }, LATER, LATER);
    expect(test.isFailed).toBe(true);
    expect(() => test.requeue(LATER)).toThrow(VitrineDeliveryNotResendableError);
  });
});
