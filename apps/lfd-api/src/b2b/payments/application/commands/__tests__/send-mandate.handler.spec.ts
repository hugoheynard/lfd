import { MailerSendError, type MailReceipt } from "@lfd/mailer";

import {
  OpenableUnitOfWork,
  RecordingMailRequests,
} from "../../../../../mail/channels/requests/__tests__/recording-mail-requests.js";
import type { MailDemand } from "../../../../../mail/channels/requests/mail-requests.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import type { B2bMails } from "../../../../../mail/channels/templates/b2b-mails.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityLogoReader } from "../../../../accounting/domain/ports/legal-entity-logo.reader.js";
import { MandateNotSendableError } from "../../../domain/errors/mandate-errors.js";
import {
  FixedDebtors,
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

/**
 * La porte du bloc `mail`, doublée : range l'envoi immédiat dans le journal
 * des étapes (pour l'ordre envoi → fait), rend le reçu qu'on lui donne.
 */
class StepMailRequests extends RecordingMailRequests {
  constructor(
    private readonly steps: Steps,
    private readonly providerId: string | null,
  ) {
    super(new OpenableUnitOfWork());
  }

  override async sendNow<K extends keyof B2bMails>(demand: MailDemand<K>): Promise<MailReceipt> {
    this.steps.log.push(`mail:${String(demand.template)}`);
    await super.sendNow(demand);
    return { providerId: this.providerId };
  }
}

function harness(providerId: string | null = "re_1") {
  const steps = new Steps();
  const mandates = new InMemoryMandates(steps);
  mandates.draft = mandate();
  const accounts = new InMemoryBankAccounts(steps);
  accounts.stored = bankAccount();
  const mails = new StepMailRequests(steps, providerId);
  const events = new StepPublisher(steps);
  const handler = new SendMandateHandler(
    mandates,
    accounts,
    new FixedCreditors(),
    new NoLogo(),
    new MemoryStore(steps),
    mails,
    events,
    new FixedDebtors(mandates),
    new FixedClock(new Date("2026-09-14T09:00:00.000Z")),
    new FixedIdGenerator("send"),
  );
  return {
    steps,
    mandates,
    mails,
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
    h.mails.failWith = new MailerSendError("envoi refusé (doublé).");

    await expect(h.run()).rejects.toBeInstanceOf(MailerSendError);
    expect(h.events.traced).toHaveLength(0);
  });

  /** Lot S2e : le mandat passe par le bloc `mail`, sur-le-champ et hors transaction. */
  it("envoie par `sendNow` (jamais `request`), le PDF en pièce et la marque de la boutique", async () => {
    const h = harness();

    await h.run();

    expect(h.mails.requested).toEqual([]);
    expect(h.mails.sentNow).toHaveLength(1);
    expect(h.mails.sentNow[0]).toMatchObject({
      to: HOLDER.email,
      brand: "lfc",
      template: "customer.mandate-to-sign",
      data: { reference: "LFC-9P2X4B-260914-K7M3QT" },
    });
    expect(JSON.stringify(h.mails.sentNow[0]?.data)).toContain('"pdfBase64":"');
    expect(JSON.stringify(h.mails.sentNow[0]?.data)).not.toContain("pdfStored");
  });

  /**
   * Le bloc garde une clé un an : une clé par mandat aurait fait qu'un second
   * « Envoyer » du même brouillon ne renvoie plus rien.
   */
  it("une clé par geste : deux envois du même brouillon ont deux clés, sans adresse", async () => {
    const h = harness();

    await h.run();
    await h.run();

    const keys = h.mails.sentNow.map((mail) => mail.idempotencyKey);
    expect(keys).toEqual([
      "mandate-to-sign:mdt_1:send_000001",
      "mandate-to-sign:mdt_1:send_000002",
    ]);
    expect(keys.join()).not.toContain(HOLDER.email);
  });

  it("n'envoie rien et n'écrit rien pour un mandat déjà signé", async () => {
    const h = harness();
    h.mandates.draft = null;
    h.mandates.current = activeMandate();

    await expect(h.run("mdt_actif")).rejects.toBeInstanceOf(MandateNotSendableError);
    expect(h.steps.log).toEqual([]);
  });
});
