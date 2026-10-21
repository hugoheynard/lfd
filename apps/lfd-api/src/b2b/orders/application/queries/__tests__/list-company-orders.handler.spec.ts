import { OrderCompanyNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  CompanyOrderListReader,
  type CompanyOrderEntry,
  type CompanyOrderListScope,
} from "../../../domain/ports/company-order-list.reader.js";
import {
  OrderGuardReader,
  type AccountSettlementStanding,
  type OrderCompanyStatus,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import { ListCompanyOrdersHandler } from "../list-company-orders.handler.js";
import { ListCompanyOrdersQuery } from "../list-company-orders.query.js";

/** Le rôle PROPRE dans la société listée — seul ce que le handler lit. */
class OwnRole extends OrderGuardReader {
  constructor(private readonly role: OrderRole | null) {
    super();
  }

  roleOf(): Promise<OrderRole | null> {
    return Promise.resolve(this.role);
  }

  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.reject(new Error("non utilisé"));
  }

  settlesOnAccount(): Promise<AccountSettlementStanding> {
    return Promise.reject(new Error("non utilisé"));
  }
}

class RecordingList extends CompanyOrderListReader {
  readonly scopes: CompanyOrderListScope[] = [];

  listFor(scope: CompanyOrderListScope): Promise<readonly CompanyOrderEntry[]> {
    this.scopes.push(scope);
    return Promise.resolve([]);
  }
}

describe("ListCompanyOrdersHandler (lot C1 de plan-commandes-des-sites)", () => {
  it("passe au lecteur le demandeur, la société et le filtre de site — le mur des sites est dans SA requête", async () => {
    const list = new RecordingList();
    const handler = new ListCompanyOrdersHandler(new OwnRole("admin"), list);

    await handler.execute(new ListCompanyOrdersQuery("usr_1", "co_principal", "co_site"));

    expect(list.scopes).toEqual([
      { actorUserId: "usr_1", companyId: "co_principal", site: "co_site" },
    ]);
  });

  it("sans rattachement à la société listée : 404, et rien n'est lu", async () => {
    const list = new RecordingList();
    const handler = new ListCompanyOrdersHandler(new OwnRole(null), list);

    await expect(
      handler.execute(new ListCompanyOrdersQuery("usr_1", "co_principal")),
    ).rejects.toBeInstanceOf(OrderCompanyNotFoundError);
    expect(list.scopes).toEqual([]);
  });
});
