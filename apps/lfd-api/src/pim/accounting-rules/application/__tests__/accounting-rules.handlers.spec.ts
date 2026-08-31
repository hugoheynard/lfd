import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { AccountingRules } from "../../domain/entities/accounting-rules.js";
import { InvalidProPriceRatioError } from "../../domain/errors/accounting-rules-errors.js";
import {
  AccountingRulesRepository,
  type AccountingRulesRecord,
} from "../../domain/ports/accounting-rules.repository.js";
import { ReadAccountingRulesHandler } from "../read-accounting-rules.js";
import { SetProPriceRatioCommand, SetProPriceRatioHandler } from "../set-pro-price-ratio.js";

/**
 * Une date FIXE et relative à rien : le test n'affirme pas quand, il affirme
 * que la date rendue est celle du dépôt. Une date absolue « réelle » ferait
 * vieillir la suite (cf. la règle « aucune date absolue en test »).
 */
const STORED_AT = new Date(0);

/** Garde l'instantané et reconstitue à chaque lecture — comme la vraie base. */
class InMemoryRepo extends AccountingRulesRepository {
  private stored: number | null = null;

  read(): Promise<AccountingRulesRecord | null> {
    if (this.stored === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      rules: AccountingRules.reconstitute({ proPriceRatioBp: this.stored }),
      updatedAt: STORED_AT,
    });
  }

  save(rules: AccountingRules): Promise<void> {
    this.stored = rules.snapshot().proPriceRatioBp;
    return Promise.resolve();
  }

  at(): number | null {
    return this.stored;
  }

  seed(basisPoints: number): void {
    this.stored = basisPoints;
  }
}

describe("ReadAccountingRulesHandler", () => {
  /**
   * Le cas qui compte : rien réglé rend `null`, et non 100 %. Un rapport de
   * complaisance ferait afficher « le pro paie le prix public » — une phrase
   * que personne n'a prononcée, et indistinguable d'un réglage volontaire.
   */
  it("rend deux null quand rien n'a jamais été réglé", async () => {
    const view = await new ReadAccountingRulesHandler(new InMemoryRepo()).execute();

    expect(view).toEqual({ ratioBp: null, updatedAt: null });
  });

  it("rend le rapport posé et la date du dépôt", async () => {
    const repo = new InMemoryRepo();
    repo.seed(9_000);

    const view = await new ReadAccountingRulesHandler(repo).execute();

    expect(view).toEqual({ ratioBp: 9_000, updatedAt: STORED_AT.toISOString() });
  });
});

describe("SetProPriceRatioHandler", () => {
  function build(repo: InMemoryRepo) {
    const journal = new RecordingJournal();
    const handler = new SetProPriceRatioHandler(repo, journal, new DirectUnitOfWork());
    return { handler, journal };
  }

  it("pose le premier rapport et trace un « depuis rien »", async () => {
    const repo = new InMemoryRepo();
    const { handler, journal } = build(repo);

    await handler.execute(new SetProPriceRatioCommand(9_000));

    expect(repo.at()).toBe(9_000);
    expect(journal.types()).toEqual(["accounting_rules.pro_ratio_changed"]);
    expect(journal.entries[0]?.payload).toEqual({ from: null, to: 9_000 });
  });

  it("révise un rapport existant et trace le avant → après", async () => {
    const repo = new InMemoryRepo();
    repo.seed(9_000);
    const { handler, journal } = build(repo);

    await handler.execute(new SetProPriceRatioCommand(8_500));

    expect(repo.at()).toBe(8_500);
    expect(journal.entries[0]?.payload).toEqual({ from: 9_000, to: 8_500 });
  });

  /**
   * Reposer la même valeur n'affirme rien. Tracer ce non-événement noierait le
   * seul que quelqu'un cherchera : celui où le rapport a vraiment bougé.
   */
  it("ne trace rien quand le rapport est reposé à l'identique", async () => {
    const repo = new InMemoryRepo();
    repo.seed(9_000);
    const { handler, journal } = build(repo);

    await handler.execute(new SetProPriceRatioCommand(9_000));

    expect(journal.types()).toEqual([]);
    expect(repo.at()).toBe(9_000);
  });

  it("refuse un rapport impossible sans rien écrire ni tracer", async () => {
    const repo = new InMemoryRepo();
    repo.seed(9_000);
    const { handler, journal } = build(repo);

    await expect(handler.execute(new SetProPriceRatioCommand(12_000))).rejects.toThrow(
      InvalidProPriceRatioError,
    );
    expect(repo.at()).toBe(9_000);
    expect(journal.types()).toEqual([]);
  });
});
