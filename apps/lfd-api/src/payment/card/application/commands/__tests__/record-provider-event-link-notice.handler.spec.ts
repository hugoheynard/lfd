import { harness, PAID, payment } from "./record-provider-event-harness.js";

/** L'avis à l'équipe d'un paiement venu d'un lien (§2.4 du plan des liens). */
describe("RecordProviderEventHandler — l'avis d'un paiement par lien", () => {
  it("avise l'équipe après l'écriture et le fait, pour un paiement venu d'un lien", async () => {
    const { timeline, repo, notice, receive } = harness();
    repo.seed(payment("pending", "link_1"));

    await receive(PAID);

    expect(timeline.steps).toEqual([
      "channel.onPaid:ord_1:pay_known:2340:first",
      "repo.load:pay_known",
      "repo.save:pay_known:paid",
      "fact:card_payment.settled",
      "notice:pay_known",
    ]);
    expect(notice.receipts).toEqual([
      {
        paymentId: "pay_known",
        payLinkId: "link_1",
        subjectType: "order",
        subjectId: "ord_1",
        account: "lfc-stripe",
        amountCents: 2_340,
        refused: false,
      },
    ]);
  });

  it("dit le refus du sujet : encaissé, puis refusé", async () => {
    const { repo, settlement, notice, receive } = harness();
    repo.seed(payment("pending", "link_1"));
    settlement.paidOutcome = "refused";

    await receive(PAID);

    expect(notice.receipts.map((receipt) => receipt.refused)).toEqual([true]);
  });

  it("n'avise personne pour un paiement qui ne vient pas d'un lien", async () => {
    const { repo, notice, receive } = harness();
    repo.seed(payment("pending"));

    await receive(PAID);

    expect(repo.state("pay_known")).toBe("paid");
    expect(notice.receipts).toEqual([]);
  });

  it("n'avise pas deux fois : un encaissement rejoué ne fait rien", async () => {
    const { repo, notice, receive } = harness();
    repo.seed(payment("paid", "link_1"));

    await receive(PAID);

    expect(notice.receipts).toEqual([]);
  });

  it("n'avise pas quand la ligne relue sous verrou était déjà encaissée (markPaid faux)", async () => {
    const { repo, settlement, notice, durable, receive } = harness();
    repo.seed(payment("pending", "link_1"));
    settlement.duringPaid = () => repo.seed(payment("paid", "link_1"));

    await receive(PAID);

    expect(durable.facts).toEqual([]);
    expect(notice.receipts).toEqual([]);
  });
});
