import {
  CustomerAccessOverviewReader,
  type CustomerAccessRowView,
} from "../../../domain/ports/customer-access-overview.reader.js";
import { ListCustomerAccessHandler } from "../list-customer-access.handler.js";

class FixedOverview extends CustomerAccessOverviewReader {
  calls = 0;
  constructor(private readonly rows: readonly CustomerAccessRowView[]) {
    super();
  }
  list(): Promise<readonly CustomerAccessRowView[]> {
    this.calls += 1;
    return Promise.resolve(this.rows);
  }
}

const WITHOUT_HOLDER: CustomerAccessRowView = {
  companyId: "c1",
  companyName: "Le Comptoir",
  parent: null,
  holder: null,
  state: "no_holder",
  activatedAt: null,
  lastInvitedAt: null,
  otherMembers: 0,
  otherMembersActive: 0,
};

describe("ListCustomerAccessHandler", () => {
  it("rend la table du reader telle quelle, en une seule lecture", async () => {
    const overview = new FixedOverview([WITHOUT_HOLDER]);

    await expect(new ListCustomerAccessHandler(overview).execute()).resolves.toEqual([
      WITHOUT_HOLDER,
    ]);
    expect(overview.calls).toBe(1);
  });
});
