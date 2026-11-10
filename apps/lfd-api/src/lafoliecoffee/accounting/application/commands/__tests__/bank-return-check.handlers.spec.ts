import { addDays, instantToLocal } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  BankReturnCheckDay,
  type BankReturnCheckEntry,
} from "../../../domain/entities/bank-return-check.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  BankReturnCheckAlreadyAttestedError,
  BankReturnCheckNotAttestedError,
} from "../../../domain/errors/bank-return-check-errors.js";
import { BankReturnCheckRepository } from "../../../domain/ports/bank-return-check.repository.js";
import { AttestBankReturnCheckCommand } from "../attest-bank-return-check.command.js";
import { AttestBankReturnCheckHandler } from "../attest-bank-return-check.handler.js";
import { WithdrawBankReturnCheckCommand } from "../withdraw-bank-return-check.command.js";
import { WithdrawBankReturnCheckHandler } from "../withdraw-bank-return-check.handler.js";
import { NOW, OneEntity, entityRecord } from "./mandate-bank-export-doubles.js";

/** Le registre en mémoire : les lignes s'ajoutent, aucune ne se modifie. */
class MemoryChecks extends BankReturnCheckRepository {
  readonly rows: (BankReturnCheckEntry & { readonly legalEntityId: string })[] = [];

  load(legalEntityId: string, day: string): Promise<BankReturnCheckDay> {
    const entries = this.rows.filter(
      (row) => row.legalEntityId === legalEntityId && row.day === day,
    );
    return Promise.resolve(BankReturnCheckDay.rehydrate({ legalEntityId, day, entries }));
  }

  save(checkDay: BankReturnCheckDay): Promise<void> {
    for (const entry of checkDay.newEntries()) {
      this.rows.push({ ...entry, legalEntityId: checkDay.legalEntityId });
    }
    return Promise.resolve();
  }
}

/** « Aujourd'hui » à Paris, lu de l'horloge fixe — jamais écrit en dur. */
const TODAY = instantToLocal(NOW).day;

function world(clock = new FixedClock(NOW)) {
  const entities = new OneEntity(entityRecord());
  const checks = new MemoryChecks();
  const events = new RecordingPublisher();
  const ids = new FixedIdGenerator();
  const uow = new DirectUnitOfWork();
  const id = entities.record.id;
  return {
    id,
    checks,
    events,
    attest: new AttestBankReturnCheckHandler(entities, checks, ids, clock, events, uow),
    withdraw: new WithdrawBankReturnCheckHandler(entities, checks, ids, clock, events, uow),
  };
}

describe("« Retours contrôlés » — poser (P3)", () => {
  it("atteste aujourd'hui par défaut, avec l'auteur, et le journalise", async () => {
    const w = world();

    await w.attest.execute(new AttestBankReturnCheckCommand(w.id, null, "staff_1"));

    expect(w.checks.rows).toEqual([
      expect.objectContaining({ day: TODAY, at: NOW, staffId: "staff_1", withdrawn: false }),
    ]);
    expect(w.events.factTypes()).toEqual(["bank_return_check.attested"]);
    expect(w.events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "legal_entity",
      subjectId: w.id,
      payload: { day: TODAY },
    });
  });

  it("rattrape un jour passé oublié", async () => {
    const w = world();
    const yesterday = addDays(TODAY, -1);

    await w.attest.execute(new AttestBankReturnCheckCommand(w.id, yesterday, "staff_1"));

    expect(w.checks.rows[0]?.day).toBe(yesterday);
  });

  it("refuse un second contrôle du même jour, sans rien écrire ni journaliser", async () => {
    const w = world();
    await w.attest.execute(new AttestBankReturnCheckCommand(w.id, null, "staff_1"));

    await expect(
      w.attest.execute(new AttestBankReturnCheckCommand(w.id, null, "staff_2")),
    ).rejects.toThrow(BankReturnCheckAlreadyAttestedError);
    expect(w.checks.rows).toHaveLength(1);
    expect(w.events.factTypes()).toEqual(["bank_return_check.attested"]);
  });

  it("une entité inconnue est un 404 qui la nomme", async () => {
    const w = world();
    await expect(
      w.attest.execute(new AttestBankReturnCheckCommand("ailleurs", null, "s")),
    ).rejects.toThrow(LegalEntityNotFoundError);
  });
});

describe("« Retours contrôlés » — retirer (la dernière ligne fait foi)", () => {
  it("ajoute une ligne de retrait avec sa note, et rien ne s'efface", async () => {
    const w = world();
    await w.attest.execute(new AttestBankReturnCheckCommand(w.id, null, "staff_1"));

    await w.withdraw.execute(
      new WithdrawBankReturnCheckCommand(w.id, TODAY, "fichier de la veille", "staff_2"),
    );

    expect(w.checks.rows.map((row) => [row.withdrawn, row.note])).toEqual([
      [false, null],
      [true, "fichier de la veille"],
    ]);
    expect((await w.checks.load(w.id, TODAY)).standing).toBeNull();
    expect(w.events.factTypes()).toEqual([
      "bank_return_check.attested",
      "bank_return_check.withdrawn",
    ]);
  });

  it("retiré, le jour s'atteste de nouveau, et c'est la dernière ligne qui fait foi", async () => {
    const w = world();
    await w.attest.execute(new AttestBankReturnCheckCommand(w.id, null, "staff_1"));
    await w.withdraw.execute(new WithdrawBankReturnCheckCommand(w.id, TODAY, "erreur", "s"));
    const later = world(new FixedClock(new Date(NOW.getTime() + 60_000)));
    later.checks.rows.push(...w.checks.rows);

    await later.attest.execute(new AttestBankReturnCheckCommand(w.id, null, "staff_3"));

    expect((await later.checks.load(w.id, TODAY)).standing?.staffId).toBe("staff_3");
  });

  it("refuse de retirer un jour qui n'est pas attesté", async () => {
    const w = world();
    await expect(
      w.withdraw.execute(new WithdrawBankReturnCheckCommand(w.id, TODAY, "erreur", "s")),
    ).rejects.toThrow(BankReturnCheckNotAttestedError);
    expect(w.events.factTypes()).toEqual([]);
  });
});
