import type { OrderView } from "@lfd/contracts";

import { CommerceOrderPlacedFact } from "../../../../../delivery/channels/commerce/commerce-order-placed.fact.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { CustomerCancellationSubject } from "../../../domain/ports/customer-cancellation-subject.reader.js";
import {
  customerSubject,
  FixedCustomerSubjects,
  ReadableSigner,
} from "../../commands/__tests__/customer-cancellation-doubles.js";
import { sheetAttachment } from "../../services/__tests__/order-sheet-doubles.js";
import { OrderManageLink } from "../../services/order-manage-link.js";
import { OrderPlacedMail } from "../../services/order-placed-mail.service.js";
import { SendOrderPlacedMail } from "../send-order-placed-mail.handler.js";
import {
  FixedOrigins,
  readerOf,
  recipientOf,
  RecordingMailer,
  view,
} from "./order-placed-mail-doubles.js";

/**
 * **Le lien « Gérer ou annuler ma commande » est dans TOUS les accusés de
 * réception** (doc `annulation-par-le-client.md`, règle de Hugo du
 * 2026-10-13) : les deux chemins d'envoi — l'abonné de passation pour ce qui
 * n'a rien à encaisser (au compte, total nul), le service appelé sur
 * `order.paid` pour une carte — et chaque client : pro, particulier, invité,
 * commande saisie par l'équipe. Un invité reçoit la page `/annuler` et son
 * jeton ; un compte reçoit SA commande dans « Mes commandes ».
 */

const CLIENT = "https://app.lfc.test";
const ORDER_ID = "order_1";

type Kind = "pro" | "particulier" | "invité" | "saisie par l'équipe";

const SUBJECTS: Readonly<Record<Kind, CustomerCancellationSubject>> = {
  pro: customerSubject({ orderId: ORDER_ID, companyId: "cmp_1" }),
  particulier: customerSubject({ orderId: ORDER_ID }),
  invité: customerSubject({ orderId: ORDER_ID, buyer: { hasAccount: false, active: true } }),
  "saisie par l'équipe": customerSubject({ orderId: ORDER_ID, companyId: "cmp_1" }),
};

const EXPECTED: Readonly<Record<Kind, string>> = {
  pro: `${CLIENT}/mes-commandes/${ORDER_ID}`,
  particulier: `${CLIENT}/mes-commandes/${ORDER_ID}`,
  invité: `${CLIENT}/annuler#${ORDER_ID}.sig-${ORDER_ID}`,
  "saisie par l'équipe": `${CLIENT}/mes-commandes/${ORDER_ID}`,
};

const KINDS = Object.keys(SUBJECTS) as Kind[];

function orderOf(kind: Kind, overrides: Partial<OrderView>): OrderView {
  return view({
    ...(kind === "saisie par l'équipe"
      ? { origin: "back_office", placedByStaffId: "staff_1" }
      : {}),
    ...overrides,
  });
}

function wiring(kind: Kind, order: OrderView) {
  const mailer = new RecordingMailer();
  const args = [
    readerOf(order),
    recipientOf("camille@halles.test"),
    new FixedOrigins(CLIENT, "https://admin.lfc.test"),
    sheetAttachment({ admin: "https://admin.lfc.test" }),
    new OrderManageLink(new FixedCustomerSubjects(SUBJECTS[kind]), new ReadableSigner()),
    mailer,
  ] as const;
  return { mailer, args };
}

function manageUrlOf(mailer: RecordingMailer): string | undefined {
  return (mailer.sent?.data as B2bMails["customer.order-placed"] | undefined)?.manageUrl;
}

const PLACED = { eventId: "evt_1", ...new CommerceOrderPlacedFact(ORDER_ID).durableFact() };

describe.each(KINDS)("l'accusé de réception porte le lien de gestion — %s", (kind) => {
  it("au compte (rien à encaisser), par l'abonné de passation", async () => {
    const { mailer, args } = wiring(
      kind,
      orderOf(kind, { paymentStatus: "not_required", totalCents: 1_367 }),
    );
    await new SendOrderPlacedMail(...args).handle(PLACED);

    expect(manageUrlOf(mailer)).toBe(EXPECTED[kind]);
  });

  it("total nul, par l'abonné de passation", async () => {
    const { mailer, args } = wiring(
      kind,
      orderOf(kind, { paymentStatus: "not_required", totalCents: 0 }),
    );
    await new SendOrderPlacedMail(...args).handle(PLACED);

    expect(manageUrlOf(mailer)).toBe(EXPECTED[kind]);
  });

  it("carte payée, par le service que `order.paid` appelle", async () => {
    const { mailer, args } = wiring(kind, orderOf(kind, { paymentStatus: "paid" }));

    await expect(new OrderPlacedMail(...args).send(ORDER_ID)).resolves.toBe(true);
    expect(manageUrlOf(mailer)).toBe(EXPECTED[kind]);
  });
});
