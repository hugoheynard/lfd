import { AmbientAfterCommit } from "../after-commit.js";
import { currentTransaction } from "../transaction.store.js";
import { transactionalPrisma } from "../transactional-prisma.js";
import { PrismaUnitOfWork } from "../unit-of-work.js";

/*
 * « Exécuter après la validation » (a-la-porte.md, B0 et § 10 bis) : la
 * file vit dans le store de transaction, appartient à l'unité la plus externe,
 * et ne part qu'une fois `$transaction` résolu — hors de son contexte.
 */

/** Un client dont la validation réussit, ou échoue APRÈS le travail. */
function client(commitFails = false): {
  readonly $transaction: (work: (tx: object) => Promise<unknown>) => Promise<unknown>;
} {
  return transactionalPrisma({
    $transaction: async (work: (tx: object) => Promise<unknown>) => {
      const result = await work({ tx: true });
      if (commitFails) {
        throw new RangeError("validation refusée");
      }
      return result;
    },
  });
}

function unitOfWork(commitFails = false): PrismaUnitOfWork {
  return new PrismaUnitOfWork(client(commitFails) as never);
}

/** Laisse partir les rappels lancés sans être attendus. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("AfterCommit", () => {
  const afterCommit = new AmbientAfterCommit();

  it("n'exécute rien pendant l'unité, tout après sa validation, hors transaction", async () => {
    const seen: string[] = [];
    const uow = unitOfWork();

    await uow.run(() => {
      afterCommit.defer(() => {
        seen.push(currentTransaction() === undefined ? "hors" : "dedans");
      }, "témoin");
      seen.push("travail");
      return Promise.resolve();
    });

    expect(seen).toEqual(["travail", "hors"]);
  });

  it("une unité imbriquée s'accroche à la plus externe : rien ne part à la fin du bloc interne", async () => {
    const seen: string[] = [];
    const uow = unitOfWork();

    await uow.run(async () => {
      await uow.run(() => {
        afterCommit.defer(() => {
          seen.push("rappel");
        }, "imbriqué");
        return Promise.resolve();
      });
      seen.push("fin de l'interne");
    });

    expect(seen).toEqual(["fin de l'interne", "rappel"]);
  });

  it("n'exécute rien si le travail échoue", async () => {
    const seen: string[] = [];

    await expect(
      unitOfWork().run(() => {
        afterCommit.defer(() => {
          seen.push("rappel");
        }, "perdu");
        return Promise.reject(new RangeError("travail refusé"));
      }),
    ).rejects.toThrow("travail refusé");
    await settle();

    expect(seen).toEqual([]);
  });

  it("n'exécute rien si la VALIDATION échoue après l'inscription", async () => {
    const seen: string[] = [];

    await expect(
      unitOfWork(true).run(() => {
        afterCommit.defer(() => {
          seen.push("rappel");
        }, "perdu");
        return Promise.resolve();
      }),
    ).rejects.toThrow("validation refusée");
    await settle();

    expect(seen).toEqual([]);
  });

  it("hors de toute transaction, le rappel s'exécute tout de suite", () => {
    const seen: string[] = [];

    afterCommit.defer(() => {
      seen.push("rappel");
    }, "immédiat");

    expect(seen).toEqual(["rappel"]);
  });

  it("un rappel en échec n'empêche ni les suivants, ni l'unité déjà validée", async () => {
    const seen: string[] = [];

    const result = await unitOfWork().run(() => {
      afterCommit.defer(() => {
        throw new RangeError("lève");
      }, "lève");
      afterCommit.defer(() => Promise.reject(new RangeError("rejette")), "rejette");
      afterCommit.defer(() => {
        seen.push("suivant");
      }, "suivant");
      return Promise.resolve("validé");
    });
    await settle();

    expect(result).toBe("validé");
    expect(seen).toEqual(["suivant"]);
  });
});
