import { Test } from "@nestjs/testing";

import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { AccountingRulesRepository } from "../../../../accounting-rules/domain/ports/accounting-rules.repository.js";
import { PimJournal, type PimJournalEntry } from "../../../../journal/pim-journal.js";
import { RevisionHashAlreadyTakenError } from "../../domain/errors/revision-errors.js";
import {
  CatalogRevisionRepository,
  type RevisionRecord,
} from "../../domain/ports/catalog-revision.repository.js";
import { CatalogRevisionSource } from "../../domain/ports/catalog-revision.source.js";
import {
  TakeCatalogRevisionCommand,
  TakeCatalogRevisionHandler,
} from "../take-catalog-revision.js";

/**
 * Ce que ces cas tiennent : **la course perdue**, et elle ne se joue nulle part
 * ailleurs. Deux pushs simultanés lisent tous deux « cette ancre n'existe pas »,
 * calculent la même empreinte et écrivent tous deux ; la lecture est hors
 * transaction, aucune rédaction applicative n'y changerait rien. C'est la base
 * qui refuse — et ce qui se passe APRÈS le refus décide entre une erreur rendue
 * à l'appelant et le résultat qu'il demandait.
 *
 * Un e2e ne peut pas la produire : il faudrait deux écritures réellement
 * concurrentes sur la même milliseconde.
 */

/** Le journal réel, sans écriture : `trace` frappe un vrai laissez-passer. */
class SilentJournal extends PimJournal {
  readonly traced: PimJournalEntry[] = [];

  protected record(entry: PimJournalEntry): Promise<void> {
    this.traced.push(entry);
    return Promise.resolve();
  }
}

const GAGNANTE: RevisionRecord = {
  id: "rev_gagnante",
  reference: "R-AAAAAA",
  label: null,
  hash: "peu-importe",
  takenAt: new Date("2026-01-01T09:00:00.000Z"),
  takenBy: "staff_1",
  articles: 0,
};

/**
 * Le dépôt de la course : `byHash` ne voit rien au premier appel — c'est ce qui
 * fait passer la garde —, `save` se fait refuser par la base, et la relecture
 * trouve enfin l'ancre du gagnant.
 */
class RacingRepository extends CatalogRevisionRepository {
  byHashCalls = 0;
  saveCalls = 0;

  constructor(private readonly winner: RevisionRecord | null) {
    super();
  }

  byHash(): Promise<RevisionRecord | null> {
    this.byHashCalls += 1;
    return Promise.resolve(this.byHashCalls === 1 ? null : this.winner);
  }

  save(): Promise<{ readonly id: string; readonly reference: string }> {
    this.saveCalls += 1;
    return Promise.reject(new RevisionHashAlreadyTakenError("empreinte"));
  }

  lastPublished(): Promise<RevisionRecord | null> {
    throw new Error("La pose ne lit jamais la dernière publication.");
  }

  list(): Promise<readonly RevisionRecord[]> {
    throw new Error("Non utilisé.");
  }

  byReference(): Promise<RevisionRecord | null> {
    throw new Error("Non utilisé.");
  }

  indexOf(): never {
    throw new Error("Non utilisé.");
  }

  recordPublication(): Promise<void> {
    throw new Error("Non utilisé.");
  }

  payloadsOf(): never {
    throw new Error("Non utilisé.");
  }
}

async function build(winner: RevisionRecord | null) {
  const revisions = new RacingRepository(winner);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TakeCatalogRevisionHandler,
      { provide: CatalogRevisionRepository, useValue: revisions },
      // Un catalogue VIDE : ces cas parlent de la course, pas du contenu.
      { provide: CatalogRevisionSource, useValue: { snapshotItems: () => Promise.resolve([]) } },
      { provide: AccountingRulesRepository, useValue: { read: () => Promise.resolve(null) } },
      { provide: PimJournal, useValue: new SilentJournal() },
      { provide: Clock, useValue: { now: () => new Date("2026-01-02T09:00:00.000Z") } },
      { provide: UnitOfWork, useValue: { run: (work: () => Promise<unknown>) => work() } },
    ],
  }).compile();
  return { handler: moduleRef.get(TakeCatalogRevisionHandler), revisions };
}

describe("TakeCatalogRevisionHandler — la course", () => {
  /**
   * 🔴 Celui qui perd voulait CETTE ancre-là. Elle existe. Il l'a. Rendre une
   * erreur pour un résultat déjà présent ferait échouer un push légitime, sur
   * une collision qui n'a rien à voir avec le catalogue.
   */
  it("rattrape l’ancre du gagnant au lieu de rendre une erreur", async () => {
    const { handler, revisions } = await build(GAGNANTE);

    const taken = await handler.execute(new TakeCatalogRevisionCommand(null));

    expect(taken).toMatchObject({ id: "rev_gagnante", reference: "R-AAAAAA", created: false });
    expect(revisions.saveCalls).toBe(1);
  });

  /**
   * Le refus sans gagnant à rattraper n'est plus une course : c'est une
   * incohérence, et l'avaler la rendrait invisible. On relaie.
   */
  it("relaie le refus quand la relecture ne trouve personne", async () => {
    const { handler } = await build(null);

    await expect(handler.execute(new TakeCatalogRevisionCommand(null))).rejects.toBeInstanceOf(
      RevisionHashAlreadyTakenError,
    );
  });
});
