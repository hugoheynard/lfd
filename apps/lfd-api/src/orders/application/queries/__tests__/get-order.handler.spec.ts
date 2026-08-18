import type { OrderView } from "@lfd/contracts";

import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderGuardReader, type OrderRole } from "../../../domain/ports/order-guard.reader.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";
import { GetAdminOrderHandler } from "../get-admin-order.handler.js";
import { GetAdminOrderQuery } from "../get-admin-order.query.js";
import { GetOrderHandler } from "../get-order.handler.js";
import { GetOrderQuery } from "../get-order.query.js";

const VIEW = { id: "ord_1", orderNumber: "CMD-0001" } as unknown as OrderView;

/** Lecteur doublé : rend la commande demandée (ou rien), et compte ses appels. */
function reader(owned: OwnedOrder | null): OrderReader {
  return {
    listByCompany: () => Promise.resolve([]),
    listPersonal: () => Promise.resolve([]),
    listForAdmin: () => Promise.resolve([]),
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
  };
  return spy;
}

function personal(placedByUserId: string): OwnedOrder {
  return { view: VIEW, companyId: null, placedByUserId };
}

function ofCompany(companyId: string): OwnedOrder {
  return { view: VIEW, companyId, placedByUserId: "usr_someone_else" };
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
    const handler = new GetOrderHandler(guard("member"), reader(ofCompany("cmp_1")));

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

describe("GetAdminOrderHandler", () => {
  it("rend la commande sans demander de rôle : le staff n'est ni client ni membre", async () => {
    const handler = new GetAdminOrderHandler(reader(ofCompany("cmp_1")));

    await expect(handler.execute(new GetAdminOrderQuery("ord_1"))).resolves.toBe(VIEW);
  });

  it("rend aussi une commande personnelle, qu'aucun mur d'entreprise ne couvre", async () => {
    const handler = new GetAdminOrderHandler(reader(personal("usr_1")));

    await expect(handler.execute(new GetAdminOrderQuery("ord_1"))).resolves.toBe(VIEW);
  });

  it("lève le même 404 sur une commande inexistante", async () => {
    const handler = new GetAdminOrderHandler(reader(null));

    await expect(handler.execute(new GetAdminOrderQuery("ord_x"))).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });
});
