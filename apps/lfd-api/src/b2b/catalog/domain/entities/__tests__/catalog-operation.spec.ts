import { CatalogOperation, type CatalogOperationFacts } from "../catalog-operation.js";

const RECEIVED = new Date("2026-09-24T08:00:00.000Z");
const NEXT = new Date("2026-09-25T08:00:00.000Z");

const facts = (over: Partial<CatalogOperationFacts> = {}): CatalogOperationFacts => ({
  key: "noel-2026",
  name: { fr: "Noël" },
  lede: null,
  image: null,
  announceFrom: new Date("2026-10-31T23:00:00.000Z"),
  orderFrom: null,
  orderUntil: new Date("2026-12-21T11:00:00.000Z"),
  pickupFrom: "2026-12-20",
  pickupUntil: "2026-12-24",
  audience: "both",
  skus: ["PAT-9-1"],
  receivedAt: RECEIVED,
  ...over,
});

describe("une opération reçue au miroir", () => {
  it("naît tenue", () => {
    expect(CatalogOperation.receive(facts()).isWithdrawn).toBe(false);
  });

  it("se marque retirée, et garde la date du premier retrait", () => {
    const operation = CatalogOperation.receive(facts());

    operation.withdraw(RECEIVED);
    operation.withdraw(NEXT);

    expect(operation.toPersistence().withdrawnAt).toEqual(RECEIVED);
  });

  /** Une opération qui revient dans un envoi est remise en tenue par l'envoi lui-même. */
  it("revient tenue quand un envoi la rapporte", () => {
    const operation = CatalogOperation.receive(facts());
    operation.withdraw(RECEIVED);

    const back = operation.refreshFromPim(facts({ receivedAt: NEXT }));

    expect(back.isWithdrawn).toBe(false);
    expect(back.received.receivedAt).toEqual(NEXT);
  });
});
