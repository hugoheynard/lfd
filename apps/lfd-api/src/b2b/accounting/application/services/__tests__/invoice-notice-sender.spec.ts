import { Buffer } from "node:buffer";

import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { Invoice } from "../../../domain/entities/invoice.js";
import { issueInput } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import { InvoiceMailOrigins } from "../../../domain/ports/invoice-mail-origins.js";
import { InvoiceSiteContactsReader } from "../../../domain/ports/invoice-site-contacts.reader.js";
import type { PayerNoticeContacts } from "../../../domain/services/collection-notice-recipient.js";
import type { BillingCycle } from "../../../domain/services/billing-cycle.js";
import { InvoiceNoticeSender } from "../invoice-notice-sender.js";
import {
  FixedInvoicePeriods,
  SEPTEMBER_2026,
  FixedPayerContacts,
  MemoryInvoiceReader,
} from "./issued-invoice-doubles.js";

/** Comparé au tampon du fait seulement, jamais au mur. */
const NOW = new Date("2026-09-30T20:05:00.000Z");

/** La clé sous laquelle le rendu Factur-X a rangé la pièce. */
const DOCUMENT_KEY = "invoices/le_1/FA-LFD-2026-000001.pdf";

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

function monthly(): Invoice {
  return Invoice.issue(
    issueInput({ paymentMeans: { code: "59", mandateReference: "RUM-PORT-1" } }),
  );
}

function setup(
  options: {
    readonly payer?: PayerNoticeContacts;
    readonly sites?: readonly string[];
    readonly origin?: string | null;
    readonly period?: BillingCycle;
    readonly documented?: boolean;
  } = {},
) {
  const invoice = monthly();
  if (options.documented === true) {
    invoice.attachDocument(DOCUMENT_KEY, "a".repeat(64));
  }
  const uow = new OpenableUnitOfWork();
  const mails = new RecordingMail(uow);
  const events = new RecordingPublisher();
  const sites = new FixedSites(options.sites ?? []);
  const payerId = invoice.toState().buyer.companyId;
  const sender = new InvoiceNoticeSender(
    new MemoryInvoiceReader([invoice]),
    new FixedInvoicePeriods(new Map([[invoice.id, options.period ?? SEPTEMBER_2026]])),
    new FixedPayerContacts(
      new Map([
        [
          payerId,
          options.payer ?? {
            billingContactEmails: ["compta@port.test"],
            ownerEmail: "patron@port.test",
          },
        ],
      ]),
    ),
    sites,
    new FixedOrigins(options.origin === undefined ? "https://boutique.test" : options.origin),
    new FixedClock(NOW),
    events,
    uow,
    mails,
  );
  return { sender, mails, events, sites, invoice };
}

const PDF = { fileName: "FA-LFD-2026-000001.pdf", bytes: Buffer.from("%PDF-1.7 rendu") };

describe("« Votre facture » est demandée à l'émission (E6, Q3 ; S2d)", () => {
  it("dit la période rangée du payeur — une semaine, pas le mois où elle s'achève (M4a)", async () => {
    const h = setup({
      period: {
        startsAt: new Date("2026-10-04T22:00:00.000Z"),
        closesAt: new Date("2026-10-11T22:00:00.000Z"),
      },
    });

    await h.sender.send(h.invoice.id, null);

    expect(h.mails.queued[0]?.data).toMatchObject({ period: "du 5 au 11 octobre 2026" });
  });

  it("au payeur et aux sous-comptes, une clé par facture et par RANG (jamais l'adresse), puis le journal", async () => {
    const h = setup({ sites: ["compta@chalet.test"] });

    const recipients = await h.sender.send(h.invoice.id, null);

    expect(recipients?.map((r) => r.email)).toEqual(["compta@port.test", "compta@chalet.test"]);
    expect(h.sites.asked).toEqual([{ orderIds: ["o_1", "o_2"], payer: "c_port" }]);
    expect(
      h.mails.queued.map((mail) => [mail.to, mail.template, mail.brand, mail.idempotencyKey]),
    ).toEqual([
      ["compta@port.test", "customer.invoice-issued", "lfc", `invoice.notice:${h.invoice.id}:1`],
      ["compta@chalet.test", "customer.invoice-issued", "lfc", `invoice.notice:${h.invoice.id}:2`],
    ]);
    expect(h.mails.awaitedReceipt).toEqual([]);
    expect(h.mails.queued[0]?.data).toMatchObject({
      invoiceNumber: "FA-LFD-2026-000001",
      period: "du 1er au 30 septembre 2026",
      total: "16,55 €",
      paymentMeans: "Prélèvement SEPA — mandat RUM-PORT-1",
      invoicesUrl: "https://boutique.test/mon-compte#compte-invoices",
    });
    expect(h.events.traced.map((event) => event.journalFact())).toEqual([
      expect.objectContaining({
        type: "invoice.notice_sent",
        subjectId: h.invoice.id,
        occurredAt: NOW,
        payload: {
          subjectLabel: "FA-LFD-2026-000001",
          payer: { id: "c_port", name: "Boulangerie du Port" },
          recipientCount: 2,
        },
      }),
    ]);
  });

  it("joint la facture PAR RÉFÉRENCE à la clé où le rendu l'a rangée, jamais ses octets", async () => {
    const h = setup({ documented: true });

    await h.sender.send(h.invoice.id, PDF);

    expect(h.mails.queued[0]?.data).toMatchObject({
      document: {
        fileName: "FA-LFD-2026-000001.pdf",
        pdfStored: { store: "customer-documents", key: DOCUMENT_KEY },
      },
    });
    expect(JSON.stringify(h.mails.queued[0]?.data)).not.toContain("pdfBase64");
  });

  it("sans PDF (rendu en échec), l'e-mail est demandé quand même, sans pièce", async () => {
    const h = setup({ documented: true });

    await h.sender.send(h.invoice.id, null);

    expect(h.mails.queued[0]?.data).toMatchObject({ document: null });
  });

  it("un PDF reçu sans clé rangée sur la facture part sans pièce plutôt qu'une référence vide", async () => {
    const h = setup();

    await h.sender.send(h.invoice.id, PDF);

    expect(h.mails.queued[0]?.data).toMatchObject({ document: null });
  });

  it("une adresse commune au payeur et à un sous-compte ne reçoit qu'un message", async () => {
    const h = setup({ sites: ["COMPTA@port.test"] });

    await h.sender.send(h.invoice.id, null);

    expect(h.mails.queued.map((mail) => mail.to)).toEqual(["compta@port.test"]);
  });

  it("rejoué, il redemande sous les mêmes clés : le bloc dédoublonne, aucun second message", async () => {
    const h = setup();

    await h.sender.send(h.invoice.id, null);
    await h.sender.send(h.invoice.id, null);

    const keys = h.mails.queued.map((mail) => mail.idempotencyKey);
    expect(new Set(keys).size).toBe(1);
  });

  it("personne à prévenir : rien n'est demandé, et le journal le signale en nommant le geste", async () => {
    const h = setup({ payer: { billingContactEmails: [], ownerEmail: null } });

    expect(await h.sender.send(h.invoice.id, null)).toEqual([]);

    expect(h.mails.queued).toEqual([]);
    const [fact] = h.events.traced.map((event) => event.journalFact());
    expect(fact?.type).toBe("invoice.notice_failed");
    expect(fact?.payload).toMatchObject({ recipientCount: 0 });
    expect(String(fact?.payload["failure"])).toContain("contact de facturation");
  });

  it("une demande refusée lève, et rien n'est journalisé avec elle", async () => {
    const h = setup();
    h.mails.failWith = new Error("boîte d'envoi indisponible");

    await expect(h.sender.send(h.invoice.id, null)).rejects.toThrow("boîte d'envoi");

    expect(h.events.traced).toEqual([]);
  });

  it("sans origine de boutique, le lien est vide (le gabarit omet le bouton)", async () => {
    const h = setup({ origin: null });

    await h.sender.send(h.invoice.id, null);

    expect(h.mails.queued[0]?.data).toMatchObject({ invoicesUrl: "" });
  });

  it("une facture introuvable : rien n'est demandé, rien n'est journalisé", async () => {
    const h = setup();

    expect(await h.sender.send("absente", null)).toBeNull();
    expect(h.mails.queued).toEqual([]);
    expect(h.events.traced.map((event) => event.journalFact())).toEqual([]);
  });
});

describe("le renvoi de « Votre facture » (E6, suite (b)) — envoyé sur-le-champ", () => {
  it("une clé propre au renvoi et au rang, jamais celle de l'envoi d'origine, et le fait `invoice.notice_resent`", async () => {
    const h = setup();

    const outcome = await h.sender.resend(h.invoice.id, null, "rs_1");

    expect(outcome).toEqual({
      recipients: [expect.objectContaining({ email: "compta@port.test" })],
      failure: null,
    });
    expect(h.mails.queued).toEqual([]);
    expect(h.mails.awaitedReceipt.map((mail) => mail.idempotencyKey)).toEqual([
      "invoice.notice-resend:rs_1:1",
    ]);
    const facts = h.events.traced.map((event) => event.journalFact());
    expect(facts.map((fact) => fact.type)).toEqual(["invoice.notice_resent"]);
    expect(facts[0]?.payload).toMatchObject({ recipientCount: 1, failure: null });
  });

  it("joint les octets du PDF rendu : un envoi immédiat ne passe pas par la boîte d'envoi", async () => {
    const h = setup();

    await h.sender.resend(h.invoice.id, PDF, "rs_4");

    expect(h.mails.awaitedReceipt[0]?.data).toMatchObject({
      document: { fileName: PDF.fileName, pdfBase64: PDF.bytes.toString("base64") },
    });
  });

  it("un refus du fournisseur n'empêche pas les autres, est rendu et journalisé sous le même fait", async () => {
    const h = setup({ sites: ["compta@chalet.test"] });
    h.mails.failWith = new Error("rebond dur");

    const outcome = await h.sender.resend(h.invoice.id, null, "rs_2");

    expect(h.mails.awaitedReceipt.map((mail) => mail.to)).toEqual(["compta@chalet.test"]);
    expect(outcome?.failure).toMatch(/1 envoi\(s\) refusé\(s\) sur 2 : rebond dur/u);
    expect(h.events.traced.map((event) => event.journalFact().type)).toEqual([
      "invoice.notice_resent",
    ]);
  });

  it("personne à prévenir : rien ne part, rien n'est journalisé", async () => {
    const h = setup({ payer: { billingContactEmails: [], ownerEmail: null } });

    const outcome = await h.sender.resend(h.invoice.id, null, "rs_3");

    expect(outcome?.recipients).toEqual([]);
    expect(h.mails.awaitedReceipt).toEqual([]);
    expect(h.events.traced).toEqual([]);
  });
});
