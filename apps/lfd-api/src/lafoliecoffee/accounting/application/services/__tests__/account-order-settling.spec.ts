import { MemoryOrderCollections } from "../../commands/__tests__/collection-doubles.js";
import { OrderCollection } from "../../../domain/entities/order-collection.js";
import { AccountOrderSettling } from "../account-order-settling.js";

/**
 * La comptabilité répond au solde d'une commande au compte (plan E6c2, § 4
 * BLOQUANT 5). L'instant n'est que recopié.
 */

const AT = new Date("2026-10-25T09:00:00.000Z");
const LATER = new Date("2026-10-25T10:00:00.000Z");

/** Compte les écritures : une ligne inchangée ne se réécrit pas. */
class CountingCollections extends MemoryOrderCollections {
  writes = 0;

  override saveAll(collections: readonly OrderCollection[]): Promise<void> {
    this.writes += 1;
    return super.saveAll(collections);
  }
}

describe("AccountOrderSettling — l'encaissement suit le solde", () => {
  it("recale la ligne due sur le montant facturable", async () => {
    const collections = new CountingCollections();
    collections.saved.set("o1", OrderCollection.due("o1", 1_000, AT));

    await new AccountOrderSettling(collections).alignOnSettlement("o1", 400, LATER);

    expect(collections.saved.get("o1")?.toPersistence().amountCents).toBe(400);
    expect(collections.writes).toBe(1);
  });

  it("sans ligne, rien à écrire : elle naîtra du montant facturable", async () => {
    const collections = new CountingCollections();

    await new AccountOrderSettling(collections).alignOnSettlement("o1", 400, LATER);

    expect(collections.saved.size).toBe(0);
    expect(collections.writes).toBe(0);
  });

  it("une ligne déjà au bon montant n'est pas réécrite", async () => {
    const collections = new CountingCollections();
    collections.saved.set("o1", OrderCollection.due("o1", 400, AT));

    await new AccountOrderSettling(collections).alignOnSettlement("o1", 400, LATER);

    expect(collections.writes).toBe(0);
  });
});
