import { MailerSendError, type MailReceipt } from "@lfd/mailer";

import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import type { MailDemand } from "../../../../../mail/channels/requests/mail.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import type { B2bMails } from "../../../../../mail/channels/templates/b2b-mails.js";
import { DocumentStorageUnavailableError } from "../../../../../platform/shared/errors/storage-errors.js";
import { KeptDocumentStore } from "../../../../../platform/storage/kept-document-store.js";
import type { StoredDocument } from "../../../../../platform/storage/document-store.js";
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
import { mandateCopyKey, SendMandateHandler } from "../send-mandate.handler.js";

class NoLogo extends LegalEntityLogoReader {
  logoKeyOf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

/**
 * La porte du bloc `mail`, doublée : range l'envoi immédiat dans le journal
 * des étapes (pour l'ordre envoi → fait), rend le reçu qu'on lui donne.
 */
class StepMail extends RecordingMail {
  constructor(
    private readonly steps: Steps,
    private readonly providerId: string | null,
  ) {
    super(new OpenableUnitOfWork());
  }

  override async sendAndAwaitReceipt<K extends keyof B2bMails>(
    demand: MailDemand<K>,
  ): Promise<MailReceipt> {
    this.steps.log.push(`mail:${String(demand.template)}`);
    await super.sendAndAwaitReceipt(demand);
    return { providerId: this.providerId };
  }
}

/** Le stockage des pièces client, qui tombe en panne sur demande. */
class FailingStore extends MemoryStore {
  failSaves = false;

  override save(key: string, document: StoredDocument): Promise<string> {
    if (this.failSaves) {
      return Promise.reject(new DocumentStorageUnavailableError("écriture refusée (doublé)."));
    }
    return super.save(key, document);
  }
}

const FIRST_INTENT = "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c";
const SECOND_INTENT = "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

function harness(providerId: string | null = "re_1") {
  const steps = new Steps();
  const mandates = new InMemoryMandates(steps);
  mandates.draft = mandate();
  const accounts = new InMemoryBankAccounts(steps);
  accounts.stored = bankAccount();
  const mails = new StepMail(steps, providerId);
  const kept = new FailingStore(steps);
  const events = new StepPublisher(steps);
  const handler = new SendMandateHandler(
    mandates,
    accounts,
    new FixedCreditors(),
    new NoLogo(),
    new MemoryStore(steps),
    new KeptDocumentStore(kept),
    mails,
    events,
    new FixedDebtors(mandates),
    new FixedClock(new Date("2026-09-14T09:00:00.000Z")),
    inMemoryIntents(),
  );
  return {
    steps,
    mandates,
    kept,
    mails,
    events,
    run: (mandateId = "mdt_1", intentKey = FIRST_INTENT) =>
      handler.execute(new SendMandateCommand("cmp_1", mandateId, "staff_1", intentKey)),
  };
}

describe("SendMandateHandler — le fait « mandat envoyé »", () => {
  /** Décision de Hugo (2026-09-19) : « je dois savoir mandat envoyé par mail ». */
  it("écrit le fait APRÈS l'envoi, avec le reçu du fournisseur", async () => {
    const h = harness("re_1");

    await h.run();

    expect(h.steps.log).toEqual([
      "store",
      "mail:customer.mandate-to-sign",
      "journal:payment_mandate.sent",
    ]);
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
  it("envoie par `sendAndAwaitReceipt` (jamais `send`), le PDF en pièce et la marque de la boutique", async () => {
    const h = harness();

    await h.run();

    expect(h.mails.queued).toEqual([]);
    expect(h.mails.awaitedReceipt).toHaveLength(1);
    expect(h.mails.awaitedReceipt[0]).toMatchObject({
      to: HOLDER.email,
      brand: "lfc",
      template: "customer.mandate-to-sign",
      data: { reference: "LFC-9P2X4B-260914-K7M3QT" },
    });
    expect(JSON.stringify(h.mails.awaitedReceipt[0]?.data)).not.toContain("pdfBase64");
  });

  /** Revue, cas 7 (Hugo, 2026-11-06) : tout document envoyé est l'exemplaire gardé. */
  it("range le PDF au stockage des pièces client AVANT l'envoi, et ne joint que sa place", async () => {
    const h = harness();

    await h.run();

    const key = `mandates/cmp_1/mdt_1/${FIRST_INTENT}.pdf`;
    expect(h.kept.objects.get(key)?.contentType).toBe("application/pdf");
    expect(h.kept.objects.get(key)?.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(h.mails.awaitedReceipt[0]?.data).toMatchObject({
      pdfStored: { store: "customer-documents", key },
    });
  });

  it("une place par envoi voulu : un renvoi ne réécrit pas l'exemplaire déjà envoyé", async () => {
    const h = harness();

    await h.run("mdt_1", FIRST_INTENT);
    await h.run("mdt_1", SECOND_INTENT);

    expect([...h.kept.objects.keys()]).toEqual([
      mandateCopyKey("cmp_1", "mdt_1", FIRST_INTENT),
      mandateCopyKey("cmp_1", "mdt_1", SECOND_INTENT),
    ]);
  });

  /** Le PDF porte l'IBAN : la clé ne nomme ni adresse, ni titulaire, ni RUM. */
  it("la clé ne porte que des identifiants opaques", () => {
    const key = mandateCopyKey("cmp_1", "mdt_1", FIRST_INTENT);

    expect(key).toBe(`mandates/cmp_1/mdt_1/${FIRST_INTENT}.pdf`);
    expect(key).not.toContain(HOLDER.email);
    expect(key).not.toContain("LFC-9P2X4B");
  });

  /** La pièce introuvable du côté du bloc a son test là-bas (`mail-attachments.spec`). */
  it("le rangement refusé : rien ne part, rien n'est écrit au journal", async () => {
    const h = harness();
    h.kept.failSaves = true;

    await expect(h.run()).rejects.toBeInstanceOf(DocumentStorageUnavailableError);
    expect(h.mails.awaitedReceipt).toEqual([]);
    expect(h.events.traced).toHaveLength(0);
  });

  /**
   * Le bloc garde une clé un an : une clé par mandat aurait fait qu'un second
   * « Envoyer » du même brouillon ne renvoie plus rien.
   */
  it("une clé par intention : deux envois voulus du même brouillon ont deux clés, sans adresse", async () => {
    const h = harness();

    await h.run("mdt_1", FIRST_INTENT);
    await h.run("mdt_1", SECOND_INTENT);

    const keys = h.mails.awaitedReceipt.map((mail) => mail.idempotencyKey);
    expect(keys).toEqual([
      `mandate-to-sign:mdt_1:${FIRST_INTENT}`,
      `mandate-to-sign:mdt_1:${SECOND_INTENT}`,
    ]);
    expect(keys.join()).not.toContain(HOLDER.email);
  });

  /**
   * Régression (revue de S2, cas 4) : la clé était tirée au hasard à chaque
   * requête, et un double clic envoyait deux courriels et deux faits.
   */
  it("un double clic de même intention n'envoie qu'un courriel et n'écrit qu'un fait", async () => {
    const h = harness();

    await h.run();
    await h.run();

    expect(h.mails.awaitedReceipt).toHaveLength(1);
    expect(h.events.traced).toHaveLength(1);
  });

  it("n'envoie rien et n'écrit rien pour un mandat déjà signé", async () => {
    const h = harness();
    h.mandates.draft = null;
    h.mandates.current = activeMandate();

    await expect(h.run("mdt_actif")).rejects.toBeInstanceOf(MandateNotSendableError);
    expect(h.steps.log).toEqual([]);
  });
});
