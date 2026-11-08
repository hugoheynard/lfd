/**
 * La pièce jointe PAR RÉFÉRENCE, contre le vrai Postgres et le vrai stockage
 * (plan `documentation/mail/plan-service-e-mails.md`, C2, S2a).
 *
 * Ce qu'un test unitaire ne peut pas dire : que la boîte d'envoi ne porte que
 * la clé du PDF, que le bloc `mail` relit le fichier déposé au bucket des
 * pièces client au moment d'envoyer, et qu'une pièce introuvable laisse une
 * demande `refused` qui nomme la clé — jamais un e-mail sans sa pièce. Seul
 * le transport est doublé (le mailer), comme ailleurs.
 */
import { randomUUID } from "node:crypto";

import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { type DeferredMailDemand, Mail } from "../src/mail/channels/requests/mail.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { ORDER_CASES } from "../src/mail/templates/__tests__/rendering-golden/order-cases.js";
import type { B2bMails } from "../src/mail/templates/mail-templates.js";
import { MAILER, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";
import { CustomerDocumentStore } from "../src/platform/storage/customer-document-store.js";

import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

/** Le transport doublé : il garde les données telles que le gabarit les reçoit. */
class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: { readonly template: string; readonly data: unknown }[] = [];

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.sent.push({ template: args.template, data: args.data });
    return Promise.resolve({ providerId: `re_${this.sent.length}` });
  }
}

const PDF = Buffer.from("%PDF-1.7\n% bon de commande e2e\n");

/** Une feuille des empreintes de rendu : le bloc la transporte telle quelle. */
function sheet() {
  const placed = Object.values(ORDER_CASES["customer.order-placed"])[0];
  if (placed === undefined) {
    throw new TypeError("les empreintes de rendu n'ont plus de cas « order-placed »");
  }
  return placed.sheet;
}

/** Une demande dont le bon est à `key` ; la clé d'idempotence suit la pièce. */
function placedDemand(key: string): DeferredMailDemand<"customer.order-placed"> {
  return {
    template: "customer.order-placed",
    to: "client@example.test",
    idempotencyKey: `order.placed:${key}`,
    data: {
      sheet: sheet(),
      handoverToken: null,
      orderUrl: "",
      handoverUrl: "",
      document: {
        fileName: "confirmation-de-commande-ORD-E2E.pdf",
        pdfStored: { store: "customer-documents", key },
      },
      locale: "fr",
    },
  };
}

const mailer = new RecordingMailer();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: MAILER, value: mailer }] });
});

beforeEach(async () => {
  await ctx.reset();
  mailer.sent.length = 0;
});

afterAll(async () => {
  await ctx.close();
});

/** Une clé neuve par cas : le bucket n'est pas vidé entre deux tests. */
const freshKey = (): string => `orders/e2e-${randomUUID()}/bon-de-commande-r0-d2.pdf`;

async function request(key: string): Promise<string> {
  const requested = await ctx.app
    .get(UnitOfWork)
    .run(() => ctx.app.get(Mail).send(placedDemand(key)));
  return requested.requestId;
}

describe("la pièce jointe par référence (S2a)", () => {
  it("la boîte d'envoi ne porte que la clé ; le bloc relit le PDF déposé et le joint", async () => {
    const key = freshKey();
    await ctx.app.get(CustomerDocumentStore).save(key, {
      bytes: PDF,
      contentType: "application/pdf",
    });

    const id = await request(key);
    const fact = await ctx.prisma.outboxMessage.findFirstOrThrow();
    expect(JSON.stringify(fact.payload)).toContain(key);
    expect(JSON.stringify(fact.payload)).not.toContain(PDF.toString("base64"));

    await ctx.drain();

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.data).toMatchObject({
      document: {
        fileName: "confirmation-de-commande-ORD-E2E.pdf",
        pdfBase64: PDF.toString("base64"),
      },
    });
    const row = await ctx.prisma.mailRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("sent");
  });

  it("introuvable au moment d'envoyer : rien ne part, la demande est `refused` et nomme la clé", async () => {
    const key = freshKey();

    const id = await request(key);
    await ctx.drain();

    expect(mailer.sent).toEqual([]);
    const row = await ctx.prisma.mailRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("refused");
    expect(row.failureReason).toContain(key);
  });

  it("`send` rend l'identifiant de la demande, le même pour une clé déjà connue", async () => {
    const key = freshKey();

    const first = await request(key);
    const again = await request(key);

    expect(again).toBe(first);
    expect(await ctx.prisma.mailRequest.count()).toBe(1);
  });
});
