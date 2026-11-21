import { ORDER_REVIEW_NOTE_MAX_LENGTH } from "@lfd/contracts";

import {
  OrderAlreadyReviewedError,
  OrderNotReviewedError,
  OrderReviewNoteTooLongError,
  OrderReviewOutOfScopeError,
} from "../../errors/order-review-errors.js";
import { ORDER_REVIEW_STARTS_AT } from "../../services/order-review-start.js";
import { OrderReviews, type OrderReviewRecord, type ReviewedOrder } from "../order-reviews.js";

/** Tous les instants sont tirés de la mise en service : aucun n'est comparé à l'horloge. */
const DAY_MS = 86_400_000;
const AFTER_START = new Date(ORDER_REVIEW_STARTS_AT.getTime() + DAY_MS);
const REVIEWED_AT = new Date(AFTER_START.getTime() + DAY_MS);
const LATER = new Date(REVIEWED_AT.getTime() + DAY_MS);

function order(overrides: Partial<ReviewedOrder> = {}): ReviewedOrder {
  return {
    orderId: "ord_1",
    orderNumber: "LFC-0001",
    placedByUserId: "user_1",
    companyId: "cmp_1",
    placedByStaffId: null,
    clientele: "pro",
    status: "placed",
    placedAt: AFTER_START,
    revision: 0,
    ...overrides,
  };
}

function current(overrides: Partial<OrderReviewRecord> = {}): OrderReviewRecord {
  return {
    id: "rev_1",
    reviewedRevision: 0,
    reviewedByStaffId: "stf_1",
    reviewedAt: REVIEWED_AT,
    note: null,
    withdrawn: null,
    ...overrides,
  };
}

const REVIEW = { id: "rev_2", byStaffId: "stf_2", note: null, at: LATER } as const;

describe("OrderReviews", () => {
  it("vise une commande passée par un client pro, à sa révision courante", () => {
    const reviews = OrderReviews.of(order({ revision: 3 }), []);

    const record = reviews.review({ ...REVIEW, note: "  RAS, quantités habituelles  " });

    expect(record).toEqual({
      id: "rev_2",
      reviewedRevision: 3,
      reviewedByStaffId: "stf_2",
      reviewedAt: LATER,
      note: "RAS, quantités habituelles",
      withdrawn: null,
    });
    expect(reviews.current()).toEqual(record);
    expect(reviews.changes()).toEqual({ created: record, withdrawn: null });
    expect(reviews.reviewable()).toBe(false);
  });

  it("une note faite d'espaces vaut « pas de note »", () => {
    const record = OrderReviews.of(order(), []).review({ ...REVIEW, note: "   " });

    expect(record.note).toBeNull();
  });

  it("refuse une note trop longue", () => {
    const note = "a".repeat(ORDER_REVIEW_NOTE_MAX_LENGTH + 1);

    expect(() => OrderReviews.of(order(), []).review({ ...REVIEW, note })).toThrow(
      OrderReviewNoteTooLongError,
    );
  });

  it.each<[string, Partial<ReviewedOrder>]>([
    ["saisie par l'équipe", { placedByStaffId: "stf_9" }],
    ["passée par un particulier", { clientele: "public" }],
    ["d'avant la distinction pro / particulier", { clientele: null }],
    ["annulée (tentative abandonnée comprise)", { status: "cancelled" }],
    ["un brouillon", { status: "draft" }],
    [
      "passée une milliseconde avant la mise en service",
      {
        placedAt: new Date(ORDER_REVIEW_STARTS_AT.getTime() - 1),
      },
    ],
  ])("refuse une commande %s, et ne la dit pas visable", (_case, overrides) => {
    const reviews = OrderReviews.of(order(overrides), []);

    expect(reviews.reviewable()).toBe(false);
    expect(() => reviews.review(REVIEW)).toThrow(OrderReviewOutOfScopeError);
    expect(reviews.changes().created).toBeNull();
  });

  it("vise une commande passée à l'instant même de la mise en service", () => {
    const reviews = OrderReviews.of(order({ placedAt: ORDER_REVIEW_STARTS_AT }), []);

    expect(reviews.reviewable()).toBe(true);
  });

  it("vise une commande d'abonnement passée seule", () => {
    // L'abonnement n'a pas de champ ici : seul `placedByStaffId` nul compte.
    expect(OrderReviews.of(order(), []).reviewable()).toBe(true);
  });

  it("refuse un double visa", () => {
    const reviews = OrderReviews.of(order(), [current()]);

    expect(() => reviews.review(REVIEW)).toThrow(OrderAlreadyReviewedError);
  });

  it("viser une commande révisée depuis son visa REMPLACE l'ancien, retiré au nom de qui vise", () => {
    const reviews = OrderReviews.of(order({ revision: 2 }), [current({ reviewedRevision: 1 })]);
    expect(reviews.revisedSinceReview()).toBe(true);
    expect(reviews.reviewable()).toBe(true);

    const fresh = reviews.review(REVIEW);

    const replaced = current({ reviewedRevision: 1, withdrawn: { byStaffId: "stf_2", at: LATER } });
    expect(reviews.changes()).toEqual({ created: fresh, withdrawn: replaced });
    expect(fresh.reviewedRevision).toBe(2);
    expect(reviews.current()).toEqual(fresh);
    expect(reviews.revisedSinceReview()).toBe(false);
  });

  it("refuse de viser une commande visée et NON révisée depuis", () => {
    const reviews = OrderReviews.of(order({ revision: 1 }), [current({ reviewedRevision: 1 })]);

    expect(reviews.reviewable()).toBe(false);
    expect(() => reviews.review(REVIEW)).toThrow(OrderAlreadyReviewedError);
    expect(reviews.changes()).toEqual({ created: null, withdrawn: null });
  });

  it("une commande non révisée depuis son visa n'est pas « modifiée depuis »", () => {
    const reviews = OrderReviews.of(order({ revision: 1 }), [current({ reviewedRevision: 1 })]);

    expect(reviews.revisedSinceReview()).toBe(false);
  });

  it("retire le visa en cours, par un autre que son auteur, et garde qui et quand", () => {
    const reviews = OrderReviews.of(order(), [current()]);

    const withdrawn = reviews.withdraw({ byStaffId: "stf_2", at: LATER });

    expect(withdrawn).toEqual(current({ withdrawn: { byStaffId: "stf_2", at: LATER } }));
    expect(reviews.current()).toBeNull();
    expect(reviews.reviewable()).toBe(true);
    expect(reviews.changes()).toEqual({ created: null, withdrawn });
  });

  it("refuse de retirer sans visa en cours, et un double retrait", () => {
    const withdrawn = current({ withdrawn: { byStaffId: "stf_1", at: LATER } });
    const reviews = OrderReviews.of(order(), [withdrawn]);

    expect(() => reviews.withdraw({ byStaffId: "stf_2", at: LATER })).toThrow(
      OrderNotReviewedError,
    );
  });

  it("vise à nouveau après un retrait : l'historique garde les deux, le plus récent en tête", () => {
    const old = current({ withdrawn: { byStaffId: "stf_1", at: LATER } });
    const reviews = OrderReviews.of(order(), [old]);

    const fresh = reviews.review({ ...REVIEW, at: new Date(LATER.getTime() + DAY_MS) });

    expect(reviews.history()).toEqual([fresh, old]);
    expect(reviews.current()).toEqual(fresh);
  });
});
