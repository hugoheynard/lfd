import type { OrderView } from "@lfd/contracts";

import type { ByReference } from "../../../../../../mail/channels/requests/mail.js";
import type { B2bMails } from "../../../../../../mail/channels/templates/b2b-mails.js";
import type { RevisionActor } from "../../../domain/entities/order-revision.js";
import {
  OrderRevisedEvent,
  type RevisionOrigin,
} from "../../../domain/events/order-revised.event.js";
import {
  MemoryCustomerDocuments,
  sheetAttachment,
} from "../../../../application/services/__tests__/order-sheet-doubles.js";
import { OrderManageLink } from "../../../../application/services/order-manage-link.js";
import {
  FixedCustomerSubjects,
  ReadableSigner,
} from "../../../../cancellation/application/commands/__tests__/customer-cancellation-doubles.js";
import { SendOrderRevisedMail } from "../send-order-revised-mail.handler.js";
import {
  FixedOrigins,
  LastMailRequest,
  OneOrderReader,
  recipientOf,
  view,
} from "../../../../application/handlers/__tests__/order-placed-mail-doubles.js";

/** Les données de la demande : le bon y est une référence au stockage. */
type RevisedDemandData = ByReference<B2bMails["customer.order-revised"]>;

/**
 * **« Votre commande est modifiée »** — l'abonné de `order.revised`. Il écrit
 * pour toute révision écrite hors d'une demande M4 (M1 client ou équipe, la
 * hausse carte appliquée), une fois par révision, et dit ce que devient
 * l'argent selon le règlement.
 */

const CUSTOMER: RevisionActor = { kind: "customer", userId: "user_7" };
const STAFF: RevisionActor = { kind: "staff", staffId: "staff_1" };
/** La révision que le fait annonce, et que la commande porte. */
const REVISION = 2;

function fact(options: {
  readonly author?: RevisionActor;
  readonly origin?: RevisionOrigin;
  readonly before?: number;
  readonly after?: number;
  readonly revision?: number;
  readonly pretax?: readonly [number, number] | null;
}) {
  const pretax = options.pretax === undefined ? ([1_106, 1_296] as const) : options.pretax;
  const event = new OrderRevisedEvent(
    "order_1",
    "ORD-4812",
    "user_7",
    options.revision ?? REVISION,
    options.author ?? CUSTOMER,
    ["lines"],
    options.before ?? 1_167,
    options.after ?? 1_367,
    options.origin ?? "direct",
    pretax === null ? null : pretax[0],
    pretax === null ? null : pretax[1],
  );
  return { eventId: "evt_1", ...event.durableFact() };
}

function subscriber(options: { order?: OrderView | null; email?: string | null } = {}) {
  const mailer = new LastMailRequest();
  const order = options.order === undefined ? view() : options.order;
  const documents = new MemoryCustomerDocuments();
  const run = new SendOrderRevisedMail(
    new OneOrderReader(
      order === null
        ? null
        : {
            view: order,
            companyId: order.companyId,
            placedByUserId: "user_7",
            stripePaymentIntentId: null,
            clientele: "pro",
            entryOrigin: null,
            loyaltyVoucherId: null,
            billedCustomer: null,
            buyerPhone: null,
            revision: { revision: REVISION, revisedAt: "2026-09-07T08:00:00.000Z" },
          },
    ),
    recipientOf(options.email === undefined ? "camille@halles.test" : options.email),
    new FixedOrigins("https://app.lfc.test", "https://admin.lfc.test"),
    sheetAttachment({ documents }),
    new OrderManageLink(new FixedCustomerSubjects(null), new ReadableSigner()),
    mailer,
  );
  return { run, mailer, documents };
}

function dataOf(mailer: LastMailRequest): RevisedDemandData | null {
  const last = mailer.last;
  return last === null ? null : (last.data as RevisedDemandData);
}

describe("SendOrderRevisedMail — « votre commande est modifiée »", () => {
  it.each([
    ["le client (M1)", CUSTOMER],
    ["l'équipe (M1)", STAFF],
  ] as const)("écrit au titulaire quand %s modifie", async (_label, author) => {
    const { run, mailer } = subscriber({ order: view({ settlement: "account" }) });

    await run.handle(fact({ author }));

    expect(mailer.last).toMatchObject({
      to: "camille@halles.test",
      template: "customer.order-revised",
      subjects: [{ type: "order", id: "order_1" }],
    });
    expect(dataOf(mailer)).toMatchObject({
      previousTotalCents: 1_167,
      totalCents: 1_367,
      moneyNote: "invoice",
      orderUrl: "https://app.lfc.test/mes-commandes/order_1",
      locale: "fr",
    });
  });

  it("écrit pour une hausse carte appliquée : « réglée par carte »", async () => {
    const { run, mailer } = subscriber({ order: view({ settlement: "paid" }) });

    await run.handle(fact({ before: 1_167, after: 1_367 }));

    expect(dataOf(mailer)?.moneyNote).toBe("card_charged");
  });

  it("une baisse carte annonce le remboursement", async () => {
    const { run, mailer } = subscriber({ order: view({ settlement: "paid" }) });

    await run.handle(fact({ before: 1_567, after: 1_367 }));

    expect(dataOf(mailer)?.moneyNote).toBe("card_refunded");
  });

  it.each(["account", "paid"] as const)(
    "à total égal (%s), rien sur l'argent",
    async (settlement) => {
      const { run, mailer } = subscriber({ order: view({ settlement }) });

      await run.handle(fact({ before: 1_367, after: 1_367 }));

      expect(dataOf(mailer)?.moneyNote).toBe("none");
    },
  );

  it("une commande à total nul se dit comme au compte : la facture", async () => {
    const { run, mailer } = subscriber({ order: view({ settlement: "free" }) });

    await run.handle(fact({ before: 0, after: 450 }));

    expect(dataOf(mailer)?.moneyNote).toBe("invoice");
  });

  it("se tait pour une demande M4 appliquée — `contact` a déjà écrit au client", async () => {
    const { run, mailer } = subscriber();

    await run.handle(fact({ origin: "change_request" }));

    expect(mailer.last).toBeNull();
  });

  it("dédoublonne par révision : la clé porte la commande et la révision, sans adresse", async () => {
    const { run, mailer } = subscriber();

    await run.handle(fact({ revision: 3 }));

    expect(mailer.last?.idempotencyKey).toBe("order.revised:order_1:3");
    expect(mailer.last?.idempotencyKey).not.toContain("@");
  });

  it("joint le bon de la révision courante, par référence", async () => {
    const { run, mailer } = subscriber();

    await run.handle(fact({}));

    const data = dataOf(mailer);
    expect(data?.sheet.revision).toBe(REVISION);
    expect(data?.document?.pdfStored.store).toBe("customer-documents");
    expect(data?.document).not.toHaveProperty("pdfBase64");
  });

  it("n'envoie rien, sans lever, quand le destinataire manque", async () => {
    const { run, mailer } = subscriber({ email: null });

    await run.handle(fact({}));

    expect(mailer.last).toBeNull();
  });

  it("n'envoie rien quand la commande est introuvable", async () => {
    const { run, mailer } = subscriber({ order: null });

    await run.handle(fact({}));

    expect(mailer.last).toBeNull();
  });

  it("lit `direct` un fait écrit avant l'origine — il écrit au client", async () => {
    const { run, mailer } = subscriber();
    const { origin: _dropped, ...older } = fact({}).payload;

    await run.handle({ eventId: "evt_0", type: "order.revised", payload: older });

    expect(mailer.last?.template).toBe("customer.order-revised");
  });

  it("passe le HT avant et après du fait : l'e-mail d'un pro le dit", async () => {
    const { run, mailer } = subscriber({ order: view({ settlement: "paid" }) });

    await run.handle(fact({ pretax: [1_106, 1_296] }));

    expect(dataOf(mailer)).toMatchObject({ previousPretaxCents: 1_106, pretaxCents: 1_296 });
  });

  it("un fait sans HT n'en invente pas : l'e-mail dira le TTC seul", async () => {
    const { run, mailer } = subscriber();

    await run.handle(fact({ pretax: null }));

    expect(dataOf(mailer)).toMatchObject({ previousPretaxCents: null, pretaxCents: null });
  });

  it.each([
    ["une société : un pro", "co_1", "pro"],
    ["sans société : un particulier", null, "public"],
  ] as const)("la clientèle se lit sur la commande — %s", async (_label, companyId, variant) => {
    const { run, mailer } = subscriber({ order: view({ companyId }) });

    await run.handle(fact({}));

    expect(dataOf(mailer)?.sheet.variant).toBe(variant);
  });
});
