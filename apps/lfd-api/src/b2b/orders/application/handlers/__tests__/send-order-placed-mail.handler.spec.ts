import { Buffer } from "node:buffer";

import type { OrderView } from "@lfd/contracts";

import { CommerceOrderPlacedFact } from "../../../../../delivery/channels/commerce/commerce-order-placed.fact.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import { OrderSheetLogoSource } from "../../../domain/ports/order-sheet-logo.source.js";
import { MissingLogo, sheetAttachment } from "../../services/__tests__/order-sheet-doubles.js";
import { SendOrderPlacedMail } from "../send-order-placed-mail.handler.js";
import {
  FixedOrigins,
  readerOf,
  recipientOf,
  RecordingMailer,
  view,
} from "./order-placed-mail-doubles.js";
import { OrderManageLink } from "../../services/order-manage-link.js";
import {
  FixedCustomerSubjects,
  ReadableSigner,
} from "../../commands/__tests__/customer-cancellation-doubles.js";

/**
 * Ce qui compte ici n'est pas qu'un e-mail parte — c'est **ce qu'il emporte**,
 * et surtout ce qu'il n'emporte pas. Un abonné qui passerait la vue au lieu de
 * la feuille ferait descendre les SKU et la trace du prix chez le client, dans
 * un canal qu'on relit encore moins qu'un écran.
 */

const DELIVERY = { eventId: "evt_1", ...new CommerceOrderPlacedFact("order_1").durableFact() };

function handler(options: {
  order?: OrderView | null;
  email?: string | null;
  client?: string | null;
  admin?: string | null;
  logo?: OrderSheetLogoSource;
}): { readonly run: SendOrderPlacedMail; readonly mailer: RecordingMailer } {
  const mailer = new RecordingMailer();
  const run = new SendOrderPlacedMail(
    readerOf(options.order === undefined ? view() : options.order),
    recipientOf(options.email === undefined ? "camille@halles.test" : options.email),
    new FixedOrigins(
      options.client === undefined ? "https://app.lfc.test" : options.client,
      options.admin === undefined ? "https://admin.lfc.test" : options.admin,
    ),
    sheetAttachment({
      ...(options.logo === undefined ? {} : { logo: options.logo }),
      admin: options.admin === undefined ? "https://admin.lfc.test" : options.admin,
    }),
    // Lot C6 : aucune fiche lisible ici → le lien de compte, sans secret.
    new OrderManageLink(new FixedCustomerSubjects(null), new ReadableSigner()),
    mailer,
  );
  return { run, mailer };
}

/** Joue l'abonné comme la boîte d'envoi le livre. */
async function fire(subject: ReturnType<typeof handler>): Promise<void> {
  await subject.run.handle(DELIVERY);
}

describe("l'accusé de réception d'une commande", () => {
  it("écrit au client, avec la feuille PROJETÉE et son jeton à part", async () => {
    const subject = handler({});
    await fire(subject);

    expect(subject.mailer.sent?.to).toBe("camille@halles.test");
    expect(subject.mailer.sent?.template).toBe("customer.order-placed");
    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(data.sheet.audience).toBe("client");
    expect(data.handoverToken).toBe("tok_secret_42");
  });

  it("ne fait pas descendre la GRILLE dans le courriel", async () => {
    // 🔴 Ce cas portait sur le SKU — « la vue en porte un ; la feuille du
    // client, non ». Il est passé côté client le 2026-09-07, parce que le bon de
    // commande dessiné lui donne une colonne.
    //
    // Ce qui reste, et qui était le vrai objet de la règle : la grille
    // tarifaire. Un prix d'entrée et un plancher disent COMMENT un prix a été
    // fabriqué, et le courriel est le canal qu'on relit le moins.
    const subject = handler({});
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(JSON.stringify(data.sheet)).toContain("PAIN-TRAD");
    expect(JSON.stringify(data.sheet)).not.toContain("entryPriceMillicents");
    expect(JSON.stringify(data.sheet)).not.toContain("floored");
  });

  it("dédoublonne par commande — un rejeu n'écrit pas deux fois au client", async () => {
    const subject = handler({});
    await fire(subject);

    expect(subject.mailer.sent?.idempotencyKey).toBe("order.placed:order_1");
  });

  it("compose l'URL du QR sur le BACK-OFFICE : c'est l'équipe qui scanne", async () => {
    const subject = handler({});
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(data.handoverUrl).toBe("https://admin.lfc.test/retrait/tok_secret_42");
  });

  it("n'invente pas de QR sur une LIVRAISON — il n'y a pas de comptoir", async () => {
    const subject = handler({
      order: view({ fulfillmentMethod: "delivery", handoverToken: null }),
    });
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(data.handoverUrl).toBe("");
  });

  it("se tait sur les URL quand l'origine n'est pas configurée", async () => {
    // Un lien relatif est inerte dans une boîte mail, et un bouton qui ne mène
    // nulle part coûte plus qu'une absence de bouton.
    const subject = handler({ client: null, admin: null });
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(data.orderUrl).toBe("");
    expect(data.handoverUrl).toBe("");
  });

  it("N'ENVOIE RIEN quand le client n'a pas d'adresse, sans lever", async () => {
    // Une commande valide ne doit pas remplir les journaux d'alertes qui ne
    // désignent rien à corriger.
    const subject = handler({ email: null });
    await fire(subject);

    expect(subject.mailer.sent).toBeNull();
  });

  it("n'envoie rien si la commande est introuvable", async () => {
    const subject = handler({ order: null });
    await fire(subject);

    expect(subject.mailer.sent).toBeNull();
  });

  it("joint le BON DE COMMANDE en PDF — le même que l'archive", async () => {
    const subject = handler({});
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(data.document?.fileName).toBe("bon-de-commande-ORD-4812.pdf");
    expect(
      Buffer.from(data.document?.pdfBase64 ?? "", "base64")
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
  });

  it("part SANS pièce jointe quand le rendu échoue — le courriel n'attend pas le bon", async () => {
    const subject = handler({ logo: new MissingLogo() });
    await fire(subject);

    expect(subject.mailer.sent?.template).toBe("customer.order-placed");
    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(data.document).toBeNull();
  });

  it("n'envoie RIEN tant qu'une commande carte attend son règlement", async () => {
    // L'accusé d'une commande carte part sur `order.paid` (`SendOrderSettledMail`).
    const subject = handler({ order: view({ paymentStatus: "pending" }) });
    await fire(subject);

    expect(subject.mailer.sent).toBeNull();
  });

  /**
   * Régression : abonné devenu durable, il pouvait tourner APRÈS le règlement
   * Stripe. La commande carte se lisait alors `paid`, et il envoyait un second
   * accusé à côté de celui d'`order.paid` (corrigé le 2026-10-10).
   */
  it.each(["paid", "failed", "refunded"] as const)(
    "laisse l'accusé d'une commande carte à `order.paid`, même déjà %s quand le fait arrive",
    async (paymentStatus) => {
      const subject = handler({ order: view({ paymentStatus }) });
      await fire(subject);

      expect(subject.mailer.sent).toBeNull();
    },
  );

  it("lève sur un fait illisible — le message reste visible dans la boîte d'envoi", async () => {
    const subject = handler({});

    await expect(
      subject.run.handle({ eventId: "evt_2", type: "commerce.order_placed", payload: {} }),
    ).rejects.toThrow("illisible");
    expect(subject.mailer.sent).toBeNull();
  });
});
