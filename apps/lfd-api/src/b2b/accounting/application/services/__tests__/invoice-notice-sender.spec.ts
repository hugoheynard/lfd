import { Buffer } from "node:buffer";

import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { Invoice } from "../../../domain/entities/invoice.js";
import { issueInput } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import { InvoiceMailOrigins } from "../../../domain/ports/invoice-mail-origins.js";
import { InvoiceSiteContactsReader } from "../../../domain/ports/invoice-site-contacts.reader.js";
import type { PayerNoticeContacts } from "../../../domain/services/collection-notice-recipient.js";
import { InvoiceNoticeSender } from "../invoice-notice-sender.js";
import {
  FixedInvoicePeriods,
  FixedPayerContacts,
  MemoryInvoiceReader,
} from "./issued-invoice-doubles.js";

/** Comparé au tampon du fait seulement, jamais au mur. */
const NOW = new Date("2026-09-30T20:05:00.000Z");

class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SendMailArgs<B2bMails>[] = [];
  readonly refused = new Set<string>();
  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    if (this.refused.has(args.to)) {
      return Promise.reject(new Error(`rebond dur : ${args.to}`));
    }
    this.sent.push(args);
    return Promise.resolve({ providerId: "re_1" });
  }
}

class FixedSites extends InvoiceSiteContactsReader {
  readonly asked: { orderIds: readonly string[]; payer: string }[] = [];
  constructor(private readonly emails: readonly string[]) {
    super();
  }
  billingEmailsOf(orderIds: readonly string[], payerCompanyId: string): Promise<readonly string[]> {
    this.asked.push({ orderIds, payer: payerCompanyId });
    return Promise.resolve(this.emails);
  }
}

class FixedOrigins extends InvoiceMailOrigins {
  constructor(private readonly client: string | null) {
    super();
  }
  clientBaseUrl(): string | null {
    return this.client;
  }
}

const MONTHLY = Invoice.issue(
  issueInput({ paymentMeans: { code: "59", mandateReference: "RUM-PORT-1" } }),
);

function setup(
  options: {
    readonly payer?: PayerNoticeContacts;
    readonly sites?: readonly string[];
    readonly origin?: string | null;
  } = {},
) {
  const mailer = new RecordingMailer();
  const events = new RecordingPublisher();
  const sites = new FixedSites(options.sites ?? []);
  const sender = new InvoiceNoticeSender(
    new MemoryInvoiceReader([MONTHLY]),
    new FixedInvoicePeriods(new Map([[MONTHLY.id, "2026-09"]])),
    new FixedPayerContacts(
      new Map(
        options.payer === undefined
          ? [
              [
                MONTHLY.toState().buyer.companyId,
                { billingContactEmails: ["compta@port.test"], ownerEmail: "patron@port.test" },
              ],
            ]
          : [[MONTHLY.toState().buyer.companyId, options.payer]],
      ),
    ),
    sites,
    new FixedOrigins(options.origin === undefined ? "https://boutique.test" : options.origin),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
    mailer,
  );
  return { sender, mailer, events, sites };
}

describe("« Votre facture » part à l'émission (E6, Q3)", () => {
  it("au payeur et aux sous-comptes, une clé par facture et par adresse, puis le journal", async () => {
    const h = setup({ sites: ["compta@chalet.test"] });

    const recipients = await h.sender.send(MONTHLY.id, null);

    expect(recipients?.map((r) => r.email)).toEqual(["compta@port.test", "compta@chalet.test"]);
    expect(h.sites.asked).toEqual([{ orderIds: ["o_1", "o_2"], payer: "c_port" }]);
    expect(h.mailer.sent.map((mail) => [mail.to, mail.template, mail.idempotencyKey])).toEqual([
      [
        "compta@port.test",
        "customer.invoice-issued",
        `invoice.notice:${MONTHLY.id}:compta@port.test`,
      ],
      [
        "compta@chalet.test",
        "customer.invoice-issued",
        `invoice.notice:${MONTHLY.id}:compta@chalet.test`,
      ],
    ]);
    expect(h.mailer.sent[0]?.data).toMatchObject({
      invoiceNumber: "FA-2026-000001",
      period: "septembre 2026",
      total: "16,55\u00A0€",
      paymentMeans: "Prélèvement SEPA — mandat RUM-PORT-1",
      invoicesUrl: "https://boutique.test/mon-compte#compte-invoices",
    });
    expect(h.events.traced.map((event) => event.journalFact())).toEqual([
      expect.objectContaining({
        type: "invoice.notice_sent",
        subjectId: MONTHLY.id,
        occurredAt: NOW,
        payload: {
          subjectLabel: "FA-2026-000001",
          payer: { id: "c_port", name: "Boulangerie du Port" },
          recipientCount: 2,
        },
      }),
    ]);
  });

  it("joint le PDF Factur-X rendu à chaque message, sous le nom de la pièce", async () => {
    const h = setup();
    const pdf = Buffer.from("%PDF-1.7 rendu");

    await h.sender.send(MONTHLY.id, { fileName: "FA-2026-000001.pdf", bytes: pdf });

    expect(h.mailer.sent[0]?.data).toMatchObject({
      document: { fileName: "FA-2026-000001.pdf", pdfBase64: pdf.toString("base64") },
    });
  });

  it("sans PDF (rendu en échec), l'e-mail part quand même, sans pièce", async () => {
    const h = setup();

    await h.sender.send(MONTHLY.id, null);

    expect(h.mailer.sent[0]?.data).toMatchObject({ document: null });
  });

  it("une adresse commune au payeur et à un sous-compte ne reçoit qu'un message", async () => {
    const h = setup({ sites: ["COMPTA@port.test"] });

    await h.sender.send(MONTHLY.id, null);

    expect(h.mailer.sent.map((mail) => mail.to)).toEqual(["compta@port.test"]);
  });

  it("rejoué, il renvoie les mêmes clés : le fournisseur dédoublonne, aucun second message", async () => {
    const h = setup();

    await h.sender.send(MONTHLY.id, null);
    await h.sender.send(MONTHLY.id, null);

    const keys = h.mailer.sent.map((mail) => mail.idempotencyKey);
    expect(new Set(keys).size).toBe(1);
  });

  it("personne à prévenir : rien ne part, et le journal le signale en nommant le geste", async () => {
    const h = setup({ payer: { billingContactEmails: [], ownerEmail: null } });

    expect(await h.sender.send(MONTHLY.id, null)).toEqual([]);

    expect(h.mailer.sent).toEqual([]);
    const [fact] = h.events.traced.map((event) => event.journalFact());
    expect(fact?.type).toBe("invoice.notice_failed");
    expect(fact?.payload).toMatchObject({ recipientCount: 0 });
    expect(String(fact?.payload["failure"])).toContain("contact de facturation");
  });

  it("un refus du fournisseur n'empêche pas les autres, et se journalise", async () => {
    const h = setup({ sites: ["compta@chalet.test"] });
    h.mailer.refused.add("compta@port.test");

    await h.sender.send(MONTHLY.id, null);

    expect(h.mailer.sent.map((mail) => mail.to)).toEqual(["compta@chalet.test"]);
    const [fact] = h.events.traced.map((event) => event.journalFact());
    expect(fact?.type).toBe("invoice.notice_failed");
    expect(String(fact?.payload["failure"])).toContain("1 envoi(s) refusé(s) sur 2");
  });

  it("sans origine de boutique, le lien est vide (le gabarit omet le bouton)", async () => {
    const h = setup({ origin: null });

    await h.sender.send(MONTHLY.id, null);

    expect(h.mailer.sent[0]?.data).toMatchObject({ invoicesUrl: "" });
  });

  it("une facture introuvable : rien ne part, rien n'est journalisé", async () => {
    const h = setup();

    expect(await h.sender.send("absente", null)).toBeNull();
    expect(h.mailer.sent).toEqual([]);
    expect(h.events.traced.map((event) => event.journalFact())).toEqual([]);
  });
});
