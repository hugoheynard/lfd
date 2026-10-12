import type { AdminOrderCancellability, OrderView } from "@lfd/contracts";

import {
  StaffAuthors,
  type StaffAuthorDirectory,
} from "../../../../../staff/directory/domain/staff-author-directory.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import type {
  AdminOrderAuthor,
  AdminOrderAuthorReader,
} from "../../../domain/ports/admin-order-author.reader.js";
import { OrderGuardReader, type OrderRole } from "../../../domain/ports/order-guard.reader.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";
import { OrderInscriptionReader } from "../../../../../production/channels/commerce/index.js";
import type { CancellationSubject } from "../../../domain/ports/cancellation-subject.reader.js";
import {
  cancellationSubject,
  FixedSubjects,
} from "../../commands/__tests__/cancellation-doubles.js";
import { orderView } from "../../handlers/__tests__/payment-failure-doubles.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { VoucherRestitution } from "../../../domain/ports/loyalty-voucher-redemption.js";
import { VoucherRestitutionPreview } from "../../../domain/ports/voucher-restitution-preview.js";
import { VoucherRestitutionRefusal } from "../../services/voucher-restitution-refusal.js";
import { GetAdminOrderHandler } from "../get-admin-order.handler.js";
import { GetAdminOrderQuery } from "../get-admin-order.query.js";
import { GetOrderHandler } from "../get-order.handler.js";
import { GetOrderQuery } from "../get-order.query.js";

const VIEW: OrderView = { ...orderView(), id: "ord_1", orderNumber: "CMD-0001" };

/** Lecteur doublé : rend la commande demandée (ou rien), et compte ses appels. */
function reader(owned: OwnedOrder | null): OrderReader {
  return {
    findAuthorByReference: () => Promise.resolve(null),
    findForPacking: () => Promise.reject(new Error("non utilisé")),
    listForProduction: () => Promise.resolve([]),
    listByCompany: () => Promise.resolve([]),
    listPersonal: () => Promise.resolve([]),
    findById: () => Promise.resolve(owned),
  };
}

/** Garde-fou doublé, qui note s'il a été interrogé (pour le cas personnel). */
function guard(role: OrderRole | null): OrderGuardReader & { asked: boolean } {
  const spy = {
    asked: false,
    roleOf: () => {
      spy.asked = true;
      return Promise.resolve(role);
    },
    companyStatusOf: () => Promise.resolve(null),
    paymentTermOf: () => Promise.resolve(null),
    settlesOnAccount: () => Promise.resolve("none" as const),
  };
  return spy;
}

function personal(placedByUserId: string): OwnedOrder {
  return {
    stripePaymentIntentId: null,
    clientele: "public",
    loyaltyVoucherId: null,
    billedCustomer: null,
    buyerPhone: null,
    view: VIEW,
    companyId: null,
    placedByUserId,
  };
}

function ofCompany(companyId: string): OwnedOrder {
  return {
    stripePaymentIntentId: null,
    clientele: "pro",
    loyaltyVoucherId: null,
    billedCustomer: null,
    buyerPhone: null,
    view: VIEW,
    companyId,
    placedByUserId: "usr_someone_else",
  };
}

describe("GetOrderHandler", () => {
  it("rend une commande personnelle à celui qui l'a passée", async () => {
    const handler = new GetOrderHandler(guard(null), reader(personal("usr_1")));

    await expect(handler.execute(new GetOrderQuery("usr_1", "ord_1"))).resolves.toBe(VIEW);
  });

  it("n'interroge pas le garde-fou pour une commande personnelle", async () => {
    const spy = guard(null);
    const handler = new GetOrderHandler(spy, reader(personal("usr_1")));

    await handler.execute(new GetOrderQuery("usr_1", "ord_1"));

    expect(spy.asked).toBe(false);
  });

  it("refuse la commande personnelle d'un autre client", async () => {
    const handler = new GetOrderHandler(guard(null), reader(personal("usr_1")));

    await expect(handler.execute(new GetOrderQuery("usr_2", "ord_1"))).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  it("rend une commande d'entreprise à l'un de ses membres", async () => {
    const handler = new GetOrderHandler(guard("orders"), reader(ofCompany("cmp_1")));

    await expect(handler.execute(new GetOrderQuery("usr_1", "ord_1"))).resolves.toBe(VIEW);
  });

  it("refuse la commande d'une entreprise dont on n'est pas membre", async () => {
    const handler = new GetOrderHandler(guard(null), reader(ofCompany("cmp_1")));

    await expect(handler.execute(new GetOrderQuery("usr_1", "ord_1"))).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  it("rend le même 404 pour une commande inexistante", async () => {
    const handler = new GetOrderHandler(guard(null), reader(null));

    await expect(handler.execute(new GetOrderQuery("usr_1", "ord_x"))).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });
});

/** Auteur doublé : la personne et sa société, ou rien (commande inconnue). */
function authors(author: AdminOrderAuthor | null): AdminOrderAuthorReader {
  return { authorOf: () => Promise.resolve(author) };
}

const CUSTOMER = {
  userId: "usr_1",
  firstName: "Léa",
  lastName: "Martin",
  email: "lea@example.test",
  phone: "0600000000",
} as const;

const COMPANY = { id: "cmp_1", raisonSociale: "Boulangerie SAS", enseigne: "Le Fournil" } as const;

/** Annuaire doublé : ne nomme que `stf_1`, et note ce qu'on lui demande. */
function directory(): StaffAuthorDirectory & { asked: (string | null)[] } {
  const spy = {
    asked: [] as (string | null)[],
    identify: (references: readonly (string | null)[]) => {
      spy.asked.push(...references);
      return Promise.resolve(
        new StaffAuthors(
          new Map([
            [
              "stf_1",
              {
                staffUserId: "stf_1",
                firstName: "Hugo",
                lastName: "H",
                role: "admin",
                roleLabel: "Admin",
                jobTitle: "",
              },
            ],
          ]),
        ),
      );
    },
  };
  return spy;
}

/** Le fournil doublé : le jour où il a inscrit la commande, ou rien. */
class FixedInscription extends OrderInscriptionReader {
  constructor(private readonly day: string | null = null) {
    super();
  }

  inscribedDayOf(): Promise<string | null> {
    return Promise.resolve(this.day);
  }
}

/** L'aperçu de la fidélité doublé : rend l'issue qu'on lui donne, et note le bon demandé. */
class FixedRestitutionPreview extends VoucherRestitutionPreview {
  readonly asked: string[] = [];

  constructor(private readonly restitution: VoucherRestitution) {
    super();
  }

  previewOf(voucherId: string): Promise<VoucherRestitution> {
    this.asked.push(voucherId);
    return Promise.resolve(this.restitution);
  }
}

/** Ce que l'aperçu dit en mots : la phrase du bon, ou la raison du refus. */
function said(cancellability: AdminOrderCancellability): string {
  return cancellability.cancellable
    ? (cancellability.voucher?.sentence ?? "")
    : cancellability.reason;
}

/** Une date limite sans rapport avec l'horloge du test : seule sa mise en forme est lue. */
const VOUCHER_EXPIRES = new Date(Date.UTC(2030, 10, 30, 12));

/** Le détail staff, avec ce que l'annulation lit d'elle (par défaut : annulable). */
function adminHandler(
  owned: OwnedOrder | null,
  author: AdminOrderAuthor | null,
  staff: StaffAuthorDirectory = directory(),
  subject: CancellationSubject | null = cancellationSubject(),
  inscribedDay: string | null = null,
  preview: VoucherRestitutionPreview = new FixedRestitutionPreview({ kind: "already" }),
  others: Readonly<Record<string, CancellationSubject>> = {},
): GetAdminOrderHandler {
  const subjects = new FixedSubjects(subject, others);
  const inscriptions = new FixedInscription(inscribedDay);
  return new GetAdminOrderHandler(
    reader(owned),
    authors(author),
    staff,
    subjects,
    inscriptions,
    preview,
    new VoucherRestitutionRefusal(subjects, inscriptions),
    new FixedClock(VOUCHER_EXPIRES),
  );
}

describe("GetAdminOrderHandler", () => {
  it("rend la commande avec sa clientèle, la personne et la société, sans demander de rôle", async () => {
    const handler = adminHandler(
      ofCompany("cmp_1"),
      { customer: CUSTOMER, company: COMPANY, placedByStaffId: null },
      directory(),
    );

    await expect(handler.execute(new GetAdminOrderQuery("ord_1"))).resolves.toEqual({
      ...VIEW,
      clientele: "pro",
      placedBy: { customer: CUSTOMER, company: COMPANY, staffName: null },
      cancellability: { cancellable: true, voucher: null },
    });
  });

  describe("ce que l'annulation fera du bon (lot C3b, C3b.7)", () => {
    const withVoucher = cancellationSubject({ loyaltyVoucherId: "bon_1" });
    const of = (restitution: VoucherRestitution, others = {}) => {
      const preview = new FixedRestitutionPreview(restitution);
      const handler = adminHandler(
        ofCompany("cmp_1"),
        { customer: CUSTOMER, company: COMPANY, placedByStaffId: null },
        directory(),
        withVoucher,
        null,
        preview,
        others,
      );
      return { preview, view: handler.execute(new GetAdminOrderQuery("ord_1")) };
    };

    it("rendu : la phrase dit la valeur et la date limite", async () => {
      const { preview, view } = of({
        kind: "returned",
        voucherValueCents: 1_200,
        remainderValueCents: null,
        expiresAt: VOUCHER_EXPIRES,
      });

      const { cancellability } = await view;
      expect(cancellability).toMatchObject({
        cancellable: true,
        voucher: {
          outcome: "returned",
          voucherValueCents: 1_200,
          expiresAt: VOUCHER_EXPIRES.toISOString(),
        },
      });
      expect(said(cancellability)).toMatch(
        /^Le bon de fidélité de 12,00\s€ utilisé sur cette commande sera rendu au client, valable jusqu'au 30\/11\.$/u,
      );
      expect(preview.asked).toEqual(["bon_1"]);
    });

    it("refondu : nomme le reliquat qui sera annulé", async () => {
      const { view } = of({
        kind: "merged",
        voucherValueCents: 1_200,
        remainderValueCents: 450,
        expiresAt: VOUCHER_EXPIRES,
      });

      const { cancellability } = await view;
      expect(cancellability).toMatchObject({
        cancellable: true,
        voucher: { outcome: "merged", remainderValueCents: 450 },
      });
      expect(said(cancellability)).toContain("avait laissé un reliquat de 4,50");
    });

    it("échu : dit qu'il ne sera pas rendu", async () => {
      const { view } = of({
        kind: "lapsed",
        voucherValueCents: 1_200,
        remainderValueCents: null,
        expiresAt: VOUCHER_EXPIRES,
      });

      const { cancellability } = await view;
      expect(cancellability).toMatchObject({ cancellable: true, voucher: { outcome: "lapsed" } });
      expect(said(cancellability)).toContain("il ne sera pas rendu");
    });

    it("reste engagé ailleurs : refus qui nomme l'autre commande", async () => {
      const { view } = of(
        {
          kind: "blocked",
          cause: "remainder_engaged",
          remainderValueCents: 450,
          order: { id: "ord_2", number: "C-2" },
        },
        { ord_2: cancellationSubject({ orderId: "ord_2", status: "ready" }) },
      );

      const { cancellability } = await view;
      expect(cancellability.cancellable).toBe(false);
      expect(said(cancellability)).toContain("C-2, qui ne peut plus être annulée");
    });

    it("une commande déjà refusée par sa règle ne demande rien à la fidélité", async () => {
      const preview = new FixedRestitutionPreview({ kind: "already" });
      const handler = adminHandler(
        ofCompany("cmp_1"),
        { customer: CUSTOMER, company: COMPANY, placedByStaffId: null },
        directory(),
        cancellationSubject({ loyaltyVoucherId: "bon_1", paymentStatus: "paid" }),
        null,
        preview,
      );

      await handler.execute(new GetAdminOrderQuery("ord_1"));

      expect(preview.asked).toEqual([]);
    });
  });

  it("dit pourquoi elle ne s'annule pas : le fournil l'a inscrite (C3.8)", async () => {
    const handler = adminHandler(
      ofCompany("cmp_1"),
      { customer: CUSTOMER, company: COMPANY, placedByStaffId: null },
      directory(),
      cancellationSubject(),
      "2026-10-13",
    );

    const view = await handler.execute(new GetAdminOrderQuery("ord_1"));

    expect(view.cancellability).toEqual({
      cancellable: false,
      reason:
        "Le fournil a déjà inscrit cette commande au compte à produire du 13/10 : elle sera fabriquée. Voyez avec le fournil.",
    });
  });

  it("dit pourquoi elle ne s'annule pas : payée par carte", async () => {
    const handler = adminHandler(
      ofCompany("cmp_1"),
      { customer: CUSTOMER, company: COMPANY, placedByStaffId: null },
      directory(),
      cancellationSubject({ paymentStatus: "paid" }),
    );

    const view = await handler.execute(new GetAdminOrderQuery("ord_1"));

    expect(view.cancellability).toMatchObject({ cancellable: false });
  });

  it("rend aussi une commande personnelle, qu'aucun mur d'entreprise ne couvre", async () => {
    const handler = adminHandler(
      personal("usr_1"),
      { customer: CUSTOMER, company: null, placedByStaffId: null },
      directory(),
    );

    const view = await handler.execute(new GetAdminOrderQuery("ord_1"));

    expect(view.clientele).toBe("public");
    expect(view.placedBy.company).toBeNull();
  });

  it("nomme le membre de l'équipe qui l'a saisie, par l'annuaire staff", async () => {
    const staff = directory();
    const handler = adminHandler(
      ofCompany("cmp_1"),
      { customer: CUSTOMER, company: COMPANY, placedByStaffId: "stf_1" },
      staff,
    );

    const view = await handler.execute(new GetAdminOrderQuery("ord_1"));

    expect(staff.asked).toEqual(["stf_1"]);
    expect(view.placedBy.staffName).toBe("Hugo H");
  });

  it("n'invente pas de nom quand l'annuaire ne connaît plus le membre", async () => {
    const handler = adminHandler(
      ofCompany("cmp_1"),
      { customer: CUSTOMER, company: COMPANY, placedByStaffId: "stf_parti" },
      directory(),
    );

    const view = await handler.execute(new GetAdminOrderQuery("ord_1"));

    expect(view.placedBy.staffName).toBeNull();
  });

  it("lève le même 404 sur une commande inexistante", async () => {
    const handler = adminHandler(null, null, directory(), null);

    await expect(handler.execute(new GetAdminOrderQuery("ord_x"))).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });
});
