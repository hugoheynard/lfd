import { ProviderCardRefunds } from "../provider-card-refunds.js";
import { RecordingCardProvider, StaticCardProviders } from "./card-payment-doubles.js";

const PARAMS = { key: "lfd-order-refund:ord_1:1:1", requestId: "ord_1", generation: 1 };

function harness() {
  const provider = new RecordingCardProvider();
  const refunds = new ProviderCardRefunds(
    new StaticCardProviders(new Map([["lfc-stripe", provider]]), ["lfc-stripe", "lfc-vide"]),
  );
  return { provider, refunds };
}

describe("ProviderCardRefunds (transitoire, P0)", () => {
  it("rembourse chez le prestataire DU COMPTE, sur la référence donnée", async () => {
    const { provider, refunds } = harness();

    await expect(refunds.refundRemainder("lfc-stripe", "pi_1", PARAMS)).resolves.toEqual({
      kind: "nothing_left",
    });
    await expect(refunds.findRefund("lfc-stripe", "pi_1", PARAMS)).resolves.toEqual({
      kind: "none",
    });
    expect(provider.calls).toEqual([
      "refund:pi_1:lfd-order-refund:ord_1:1:1",
      "findRefund:pi_1:ord_1:1",
    ]);
  });

  it("🔴 rembourse le RESTE (sans montant), et garde `lfd_order_id` = la demande d'`orders` jusqu'à P1.c", async () => {
    const { provider, refunds } = harness();

    await refunds.refundRemainder("lfc-stripe", "pi_1", PARAMS);

    expect(provider.refunds).toEqual([{ ...PARAMS, subjectLabel: "ord_1", amountCents: null }]);
  });

  it.each(["lfc-inconnu", "lfc-vide", "MAL FORMÉ"])(
    "un compte %p rend `unavailable`, jamais une exception",
    async (account) => {
      const { provider, refunds } = harness();

      await expect(refunds.refundRemainder(account, "pi_1", PARAMS)).resolves.toMatchObject({
        kind: "unavailable",
      });
      await expect(refunds.findRefund(account, "pi_1", PARAMS)).resolves.toMatchObject({
        kind: "unavailable",
      });
      expect(provider.calls).toEqual([]);
    },
  );
});
