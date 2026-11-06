import {
  assertOutsideTransaction,
  configureNetworkCallGuard,
  NetworkCallInsideTransactionError,
  type NetworkCallViolation,
  onNetworkCallViolation,
} from "../outside-transaction.js";
import {
  CommitQueue,
  deferUntilCommit,
  runInTransaction,
  runWithCommitQueue,
  traceTransactionOrigins,
} from "../transaction.store.js";

/*
 * La garde du réseau (todo-reseau-hors-transaction.md) : un appel sortant
 * dans une transaction — unité de travail OU transaction directe — est
 * constaté ; hors transaction, et après la validation, il ne l'est pas.
 */

function collect(): { readonly seen: NetworkCallViolation[]; readonly stop: () => void } {
  const seen: NetworkCallViolation[] = [];
  return { seen, stop: onNetworkCallViolation((violation) => seen.push(violation)) };
}

describe("assertOutsideTransaction", () => {
  afterEach(() => {
    configureNetworkCallGuard("report");
    traceTransactionOrigins(false);
  });

  it("ne dit rien hors transaction, même en enforce", () => {
    configureNetworkCallGuard("enforce");
    const { seen, stop } = collect();
    expect(() => assertOutsideTransaction("Stripe.refunds.create")).not.toThrow();
    stop();
    expect(seen).toEqual([]);
  });

  it("report : constate l'appel dans une unité de travail, sans le refuser", async () => {
    const { seen, stop } = collect();
    await runInTransaction({}, () => {
      assertOutsideTransaction("Stripe.refunds.create");
      return Promise.resolve();
    });
    stop();
    expect(seen.map((violation) => violation.what)).toEqual(["Stripe.refunds.create"]);
    expect(seen[0]?.stack).toContain("outside-transaction.spec");
  });

  /** Régression possible : `currentTransaction()` rend `undefined` dans une transaction directe. */
  it("voit aussi la transaction DIRECTE, dont le cadre n'a pas de client", async () => {
    const { seen, stop } = collect();
    await runWithCommitQueue(new CommitQueue(), () => {
      assertOutsideTransaction("R2.media.put");
      return Promise.resolve();
    });
    stop();
    expect(seen).toHaveLength(1);
  });

  it("enforce : refuse en nommant l'appel et les deux sorties", async () => {
    configureNetworkCallGuard("enforce");
    const work = runInTransaction({}, () =>
      Promise.resolve().then(() => assertOutsideTransaction("Auth0.management")),
    );
    await expect(work).rejects.toBeInstanceOf(NetworkCallInsideTransactionError);
    await expect(work).rejects.toThrow(/« Auth0\.management ».*AVANT.*APRÈS sa validation/s);
  });

  it("off : ne constate rien", async () => {
    configureNetworkCallGuard("off");
    const { seen, stop } = collect();
    await runInTransaction({}, () => {
      assertOutsideTransaction("BAN.geocode");
      return Promise.resolve();
    });
    stop();
    expect(seen).toEqual([]);
  });

  it("après la validation, le rappel n'est plus dans la transaction", async () => {
    configureNetworkCallGuard("enforce");
    const commits = new CommitQueue();
    let afterCommit: unknown = "pas exécuté";
    await runInTransaction(
      {},
      () => {
        deferUntilCommit(() => {
          try {
            assertOutsideTransaction("Resend.emails.send");
            afterCommit = null;
          } catch (error) {
            afterCommit = error;
          }
        }, "test");
        return Promise.resolve();
      },
      commits,
    );
    commits.flush();
    expect(afterCommit).toBeNull();
  });

  it("cite l'ouverture de la transaction quand la mesure la demande", async () => {
    traceTransactionOrigins(true);
    const { seen, stop } = collect();
    await runInTransaction({}, () => {
      assertOutsideTransaction("OSRM.table");
      return Promise.resolve();
    });
    stop();
    expect(seen[0]?.transactionOrigin).toContain("outside-transaction.spec");
  });

  it("ne relève pas l'ouverture par défaut", async () => {
    const { seen, stop } = collect();
    await runInTransaction({}, () => {
      assertOutsideTransaction("OSRM.table");
      return Promise.resolve();
    });
    stop();
    expect(seen[0]?.transactionOrigin).toBeUndefined();
  });
});
