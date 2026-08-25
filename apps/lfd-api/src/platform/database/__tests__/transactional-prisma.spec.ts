import { transactionalPrisma } from "../transactional-prisma.js";
import { runInTransaction } from "../transaction.store.js";
import { UnitOfWork } from "../unit-of-work.js";

/**
 * Le routage vers la transaction ambiante.
 *
 * C'est un chemin **invisible à la lecture** : un dépôt écrit `prisma.produit
 * .update(...)` et ne sait pas où ça part. S'il partait à côté de la
 * transaction, rien ne le dirait — l'écriture réussirait, la trace aussi, et
 * elles ne seraient simplement plus solidaires. Ces vérifications sont ce qui
 * remplace la lecture.
 */
interface FakeClient {
  readonly product: { readonly source: string };
  readonly $transaction: (work: (tx: object) => Promise<unknown>) => Promise<unknown>;
  readonly $connect: () => string;
}

function base(): FakeClient {
  return {
    product: { source: "base" },
    $transaction: async (work) => work({ product: { source: "transaction" } }),
    $connect: () => "base",
  };
}

describe("transactionalPrisma", () => {
  it("vise la BASE hors transaction", () => {
    const client = transactionalPrisma(base());
    expect(client.product.source).toBe("base");
  });

  it("vise la TRANSACTION dès qu'il y en a une", async () => {
    const client = transactionalPrisma(base());

    const seen = await runInTransaction({ product: { source: "transaction" } }, () =>
      Promise.resolve(client.product.source),
    );

    expect(seen).toBe("transaction");
  });

  it("laisse le CYCLE DE VIE à la base, même sous transaction", async () => {
    // `$connect`, `$disconnect`, `$transaction` n'appartiennent pas à une unité
    // de travail — et le client de transaction de Prisma ne les porte pas.
    const client = transactionalPrisma(base());

    const seen = await runInTransaction({ $connect: () => "transaction" }, () =>
      Promise.resolve(client.$connect()),
    );

    expect(seen).toBe("base");
  });

  it("relâche la transaction en sortant", async () => {
    const client = transactionalPrisma(base());
    await runInTransaction({ product: { source: "transaction" } }, () => Promise.resolve());

    expect(client.product.source).toBe("base");
  });
});

describe("UnitOfWork", () => {
  it("ouvre une transaction et l'expose au client", async () => {
    const client = transactionalPrisma(base());
    const uow = new UnitOfWork(client as never);

    const seen = await uow.run(() => Promise.resolve(client.product.source));

    expect(seen).toBe("transaction");
  });

  it("REJOINT celle en cours au lieu d'en ouvrir une seconde", async () => {
    // Prisma ne sait pas imbriquer ; et deux unités de travail sur le même flux
    // voudraient dire qu'une moitié peut être annulée sans l'autre.
    let opened = 0;
    const client = transactionalPrisma({
      ...base(),
      $transaction: async (work: (tx: object) => Promise<unknown>) => {
        opened += 1;
        return work({ product: { source: "transaction" } });
      },
    });
    const uow = new UnitOfWork(client as never);

    await uow.run(() => uow.run(() => Promise.resolve()));

    expect(opened).toBe(1);
  });
});
