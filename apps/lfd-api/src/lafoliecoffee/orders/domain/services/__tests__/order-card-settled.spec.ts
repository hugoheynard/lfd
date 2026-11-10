import { orderCardSettled } from "../order-card-settled.js";

/** Le règlement qu'une commande dit au bloc `card-payment` (plan M2, §3.3, §4.3 ; lot P0.c2). */
describe("orderCardSettled", () => {
  it.each([
    ["placed", "paid", "paid"],
    ["fulfilled", "refunded", "paid"],
    ["cancelled", "paid", "paid"],
    ["cancelled", "refunded", "paid"],
    ["placed", "failed", "failed"],
    // Une annulée non payée porte `failed` (C3.4) mais son intention est
    // fermée : elle se dit `closed`, comme dans la reprise SQL — sinon le
    // rattrapage horaire la signalerait en écart à chaque passage.
    ["cancelled", "failed", "closed"],
    ["cancelled", "pending", "closed"],
    ["placed", "pending", "pending"],
    ["confirmed", "not_required", "pending"],
  ] as const)("statut %s, règlement %s → %s", (status, paymentStatus, expected) => {
    expect(orderCardSettled(status, paymentStatus)).toBe(expected);
  });
});
