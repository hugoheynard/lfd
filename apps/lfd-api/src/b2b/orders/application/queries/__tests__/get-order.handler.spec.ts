import type { OrderView } from "@lfd/contracts";

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
import { orderView } from "../../handlers/__tests__/payment-failure-doubles.js";
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

describe("GetAdminOrderHandler", () => {
  it("rend la commande avec sa clientèle, la personne et la société, sans demander de rôle", async () => {
    const handler = new GetAdminOrderHandler(
      reader(ofCompany("cmp_1")),
      authors({ customer: CUSTOMER, company: COMPANY, placedByStaffId: null }),
      directory(),
    );

    await expect(handler.execute(new GetAdminOrderQuery("ord_1"))).resolves.toEqual({
      ...VIEW,
      clientele: "pro",
      placedBy: { customer: CUSTOMER, company: COMPANY, staffName: null },
    });
  });

  it("rend aussi une commande personnelle, qu'aucun mur d'entreprise ne couvre", async () => {
    const handler = new GetAdminOrderHandler(
      reader(personal("usr_1")),
      authors({ customer: CUSTOMER, company: null, placedByStaffId: null }),
      directory(),
    );

    const view = await handler.execute(new GetAdminOrderQuery("ord_1"));

    expect(view.clientele).toBe("public");
    expect(view.placedBy.company).toBeNull();
  });

  it("nomme le membre de l'équipe qui l'a saisie, par l'annuaire staff", async () => {
    const staff = directory();
    const handler = new GetAdminOrderHandler(
      reader(ofCompany("cmp_1")),
      authors({ customer: CUSTOMER, company: COMPANY, placedByStaffId: "stf_1" }),
      staff,
    );

    const view = await handler.execute(new GetAdminOrderQuery("ord_1"));

    expect(staff.asked).toEqual(["stf_1"]);
    expect(view.placedBy.staffName).toBe("Hugo H");
  });

  it("n'invente pas de nom quand l'annuaire ne connaît plus le membre", async () => {
    const handler = new GetAdminOrderHandler(
      reader(ofCompany("cmp_1")),
      authors({ customer: CUSTOMER, company: COMPANY, placedByStaffId: "stf_parti" }),
      directory(),
    );

    const view = await handler.execute(new GetAdminOrderQuery("ord_1"));

    expect(view.placedBy.staffName).toBeNull();
  });

  it("lève le même 404 sur une commande inexistante", async () => {
    const handler = new GetAdminOrderHandler(reader(null), authors(null), directory());

    await expect(handler.execute(new GetAdminOrderQuery("ord_x"))).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });
});
