import type { OrderDraftPayload, OrderDraftView } from "@lfd/contracts";

import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  OrderDraftRepository,
  type OrderDraftSummary,
} from "../../../domain/ports/order-draft.repository.js";
import { ListOrderDraftSummariesHandler } from "../list-order-draft-summaries.handler.js";

/**
 * **La pastille « Brouillon » du comptoir** : les brouillons en attente, leur
 * instant, et l'auteur nommé par l'annuaire — en une seule lecture.
 *
 * Les instants ne sont que des données rendues telles quelles.
 */

class ListedDrafts extends OrderDraftRepository {
  constructor(private readonly summaries: readonly OrderDraftSummary[]) {
    super();
  }

  find(): Promise<OrderDraftView | null> {
    return Promise.resolve(null);
  }

  listSummaries(): Promise<readonly OrderDraftSummary[]> {
    return Promise.resolve(this.summaries);
  }

  save(companyId: string, payload: OrderDraftPayload): Promise<OrderDraftView> {
    return Promise.resolve({ ...payload, companyId, savedAt: "", savedByStaffId: null });
  }

  discard(): Promise<void> {
    return Promise.resolve();
  }
}

const SAVED_AT = new Date("2026-11-03T13:32:00.000Z");

describe("ListOrderDraftSummariesHandler", () => {
  it("rend chaque brouillon avec son instant ISO et le nom de qui l'a enregistré", async () => {
    const staff = new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Léa", lastName: "Martin" }, "staff_1"),
    );
    const handler = new ListOrderDraftSummariesHandler(
      new ListedDrafts([{ companyId: "cmp_1", savedAt: SAVED_AT, savedByStaffId: "staff_1" }]),
      staff,
    );

    const views = await handler.execute();

    expect(views).toEqual([
      { companyId: "cmp_1", savedAt: SAVED_AT.toISOString(), savedByName: "Léa Martin" },
    ]);
  });

  it("rend un auteur null plutôt qu'un nom inventé quand la fiche a disparu", async () => {
    const handler = new ListOrderDraftSummariesHandler(
      new ListedDrafts([
        { companyId: "cmp_1", savedAt: SAVED_AT, savedByStaffId: "staff_parti" },
        { companyId: "cmp_2", savedAt: SAVED_AT, savedByStaffId: null },
      ]),
      new FixedStaffAuthorDirectory(),
    );

    const views = await handler.execute();

    expect(views.map((view) => view.savedByName)).toEqual([null, null]);
  });

  it("nomme tous les auteurs en une seule lecture de l'annuaire", async () => {
    const staff = new FixedStaffAuthorDirectory();
    const handler = new ListOrderDraftSummariesHandler(
      new ListedDrafts([
        { companyId: "cmp_1", savedAt: SAVED_AT, savedByStaffId: "staff_1" },
        { companyId: "cmp_2", savedAt: SAVED_AT, savedByStaffId: "staff_2" },
      ]),
      staff,
    );

    await handler.execute();

    expect(staff.asked).toEqual([["staff_1", "staff_2"]]);
  });
});
