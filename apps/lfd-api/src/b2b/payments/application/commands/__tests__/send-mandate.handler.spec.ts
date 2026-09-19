import { MailerSendError, type MailReceipt, type SendMailArgs } from "@lfd/mailer";

import { LegalEntityLogoReader } from "../../../../accounting/domain/ports/legal-entity-logo.reader.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import { MandateNotSendableError } from "../../../domain/errors/mandate-errors.js";
import {
  activeMandate,
  bankAccount,
  FixedCreditors,
  HOLDER,
  InMemoryBankAccounts,
  InMemoryMandates,
  mandate,
  MemoryStore,
  StepPublisher,
  Steps,
} from "../../__tests__/payment-doubles.js";
import { SendMandateCommand } from "../send-mandate.command.js";
import { SendMandateHandler } from "../send-mandate.handler.js";

class NoLogo extends LegalEntityLogoReader {
  logoKeyOf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

/** Le courrier : rend le reçu qu'on lui donne, ou refuse l'envoi sur demande. */
class StepMailer implements B2bMailer {
  readonly enabled = true;
  failing = false;

  constructor(
    private readonly steps: Steps,
    private readonly providerId: string | null,
  ) {}

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.steps.log.push(`mail:${String(args.template)}`);
    if (this.failing) {
      return Promise.reject(new MailerSendError("envoi refusé (doublé)."));
    }
    return Promise.resolve({ providerId: this.providerId });
  }
}

function harness(providerId: string | null = "re_1") {
  const steps = new Steps();
  const mandates = new InMemoryMandates(steps);
  mandates.draft = mandate();
  const accounts = new InMemoryBankAccounts(steps);
  accounts.stored = bankAccount();
  const mailer = new StepMailer(steps, providerId);
  const events = new StepPublisher(steps);
  const handler = new SendMandateHandler(
    mandates,
    accounts,
    new FixedCreditors(),
    new NoLogo(),
    new MemoryStore(steps),
    mailer,
    events,
  );
  return {
    steps,
    mandates,
    mailer,
    events,
    run: (mandateId = "mdt_1") => handler.execute(new SendMandateCommand("cmp_1", mandateId)),
  };
}

describe("SendMandateHandler — le fait « mandat envoyé »", () => {
  /** Décision de Hugo (2026-09-19) : « je dois savoir mandat envoyé par mail ». */
  it("écrit le fait APRÈS l'envoi, avec le reçu du fournisseur", async () => {
    const h = harness("re_1");

    await h.run();

    expect(h.steps.log).toEqual(["mail:customer.mandate-to-sign", "journal:payment_mandate.sent"]);
    expect(h.events.traced[0]?.journalFact()).toEqual({
      type: "payment_mandate.sent",
      subjectType: "payment_mandate",
      subjectId: "mdt_1",
      payload: {
        subjectLabel: "LFC-9P2X4B-260914-K7M3QT",
        company: { id: "cmp_1", name: "Le Refuge du Col" },
        reference: "LFC-9P2X4B-260914-K7M3QT",
        providerId: "re_1",
      },
    });
  });

  it("garde `providerId` à null en mode à blanc — il n'est pas inventé", async () => {
    const h = harness(null);

    await h.run();

    expect(h.events.traced[0]?.journalFact().payload).toMatchObject({ providerId: null });
  });

  /** 🔴 Le journal se relit des années après : l'adresse du client n'y entre pas. */
  it("ne porte jamais l'adresse e-mail du destinataire", async () => {
    const h = harness();

    await h.run();

    expect(JSON.stringify(h.events.traced.map((event) => event.journalFact()))).not.toContain(
      HOLDER.email,
    );
  });

  it("n'écrit aucun fait quand le fournisseur refuse l'envoi", async () => {
    const h = harness();
    h.mailer.failing = true;

    await expect(h.run()).rejects.toBeInstanceOf(MailerSendError);
    expect(h.events.traced).toHaveLength(0);
  });

  it("n'envoie rien et n'écrit rien pour un mandat déjà signé", async () => {
    const h = harness();
    h.mandates.draft = null;
    h.mandates.current = activeMandate();

    await expect(h.run("mdt_actif")).rejects.toBeInstanceOf(MandateNotSendableError);
    expect(h.steps.log).toEqual([]);
  });
});
