import type { Mailer, MailReceipt, SendMailArgs, TemplateMap } from "@lfd/mailer";

import { AfterCommit } from "../../../database/after-commit.js";
import type { AfterCommitCallback } from "../../../database/transaction.store.js";
import { BackgroundWork } from "../../../events/background-work.js";
import { Clock } from "../../../time/clock.js";
import { JournalingMailer } from "../journaling-mailer.js";
import { MailJournal, type MailOutcome, type MailSendRecord } from "../mail-journal.port.js";

interface Mails extends TemplateMap {
  readonly hello: { readonly name: string };
}

const AT = new Date("2026-10-10T08:00:00.000Z");

class FixedClock extends Clock {
  now(): Date {
    return AT;
  }
}

class RecordingJournal extends MailJournal {
  readonly sends: MailSendRecord[] = [];
  recordSend(record: MailSendRecord): Promise<void> {
    this.sends.push(record);
    return Promise.resolve();
  }
  recordOutcome(_outcome: MailOutcome): Promise<void> {
    return Promise.resolve();
  }
  rememberEvent(_provider: string, _externalId: string): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/** Une transaction ouverte : les rappels attendent qu'on la « valide ». */
class HeldAfterCommit extends AfterCommit {
  readonly pending: AfterCommitCallback[] = [];
  defer(callback: AfterCommitCallback): void {
    this.pending.push(callback);
  }
  async commit(): Promise<void> {
    for (const callback of this.pending.splice(0)) {
      await callback();
    }
  }
}

class InlineWork extends BackgroundWork {
  override track(work: Promise<void>): Promise<void> {
    return work;
  }
}

const inner: Mailer<Mails> = {
  enabled: true,
  send: (_args: SendMailArgs<Mails, "hello">): Promise<MailReceipt> =>
    Promise.resolve({ providerId: "re_1", sent: true }),
};

describe("JournalingMailer", () => {
  /**
   * Régression : l'écriture du journal héritait de la transaction d'une
   * livraison durable, s'exécutait après sa validation, échouait et était
   * avalée — le courriel partait, sa trace jamais (2026-10-10).
   */
  it("n'écrit la trace d'un envoi qu'APRÈS la validation de la transaction", async () => {
    const journal = new RecordingJournal();
    const afterCommit = new HeldAfterCommit();
    const mailer = new JournalingMailer(
      inner,
      journal,
      new FixedClock(),
      new InlineWork(),
      afterCommit,
    );

    await mailer.send({ to: "a@b.test", template: "hello", data: { name: "A" } });
    expect(journal.sends).toEqual([]);

    await afterCommit.commit();
    expect(journal.sends).toEqual([
      { providerId: "re_1", template: "hello", recipient: "a@b.test", at: AT },
    ]);
  });
});
