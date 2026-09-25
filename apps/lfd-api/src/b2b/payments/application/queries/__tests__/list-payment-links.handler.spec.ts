import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  PaymentLinkReader,
  type PaymentLinkEntry,
} from "../../../domain/ports/payment-link.reader.js";
import { ListPaymentLinksHandler } from "../list-payment-links.handler.js";

const CREATED = new Date("2026-01-10T09:00:00.000Z");
const CANCELLED = new Date("2026-01-10T10:00:00.000Z");

class FixedLinks extends PaymentLinkReader {
  constructor(private readonly entries: readonly PaymentLinkEntry[]) {
    super();
  }

  list(): Promise<readonly PaymentLinkEntry[]> {
    return Promise.resolve(this.entries);
  }
}

const CANCELLED_LINK: PaymentLinkEntry = {
  id: "pl_1",
  companyId: "co_1",
  companyName: "Les Halles",
  amountCents: 12_000,
  label: "Régularisation août",
  status: "cancelled",
  url: "https://checkout.stripe.test/cs_1",
  createdAt: CREATED,
  createdByStaffId: "staff_1",
  paidAt: null,
  cancelledAt: CANCELLED,
  cancelledByStaffId: "staff_gone",
};

describe("ListPaymentLinksHandler", () => {
  it("nomme les auteurs en une lecture, et rend null pour une fiche inconnue", async () => {
    const authors = new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Inès", lastName: "Compta" }, "staff_1"),
    );
    const views = await new ListPaymentLinksHandler(
      new FixedLinks([CANCELLED_LINK]),
      authors,
    ).execute();

    expect(authors.asked).toHaveLength(1);
    expect(views).toEqual([
      {
        id: "pl_1",
        companyId: "co_1",
        companyName: "Les Halles",
        amountCents: 12_000,
        label: "Régularisation août",
        status: "cancelled",
        url: "https://checkout.stripe.test/cs_1",
        createdAt: CREATED.toISOString(),
        createdByName: "Inès Compta",
        paidAt: null,
        cancelledAt: CANCELLED.toISOString(),
        // Jamais un nom inventé pour une fiche qui n'est plus à l'annuaire.
        cancelledByName: null,
      },
    ]);
  });
});
