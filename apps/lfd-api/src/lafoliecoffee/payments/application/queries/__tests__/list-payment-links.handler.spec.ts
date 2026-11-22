import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  PaymentLinkReader,
  type PaymentLinkEntry,
} from "../../../domain/ports/payment-link.reader.js";
import { ListPaymentLinksHandler } from "../list-payment-links.handler.js";
import { RecordingPayLinks } from "../../commands/__tests__/payment-link-doubles.js";

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
  checkoutUrl: "https://checkout.stripe.test/cs_1",
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
      new RecordingPayLinks(),
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
        // Un lien annulé n'a plus d'adresse à envoyer.
        url: null,
        createdAt: CREATED.toISOString(),
        createdByName: "Inès Compta",
        paidAt: null,
        cancelledAt: CANCELLED.toISOString(),
        // Jamais un nom inventé pour une fiche qui n'est plus à l'annuaire.
        cancelledByName: null,
      },
    ]);
  });

  it("sert l'adresse d'une ligne ouverte : la colonne d'un ancien lien, urlsOf pour un neuf", async () => {
    const payLinks = new RecordingPayLinks();
    await payLinks.open({ type: "free_charge", id: "pl_door" }, OPENING);
    await payLinks.open({ type: "free_charge", id: "pl_paid" }, OPENING);
    const views = await handlerOf(
      [
        { ...CANCELLED_LINK, id: "pl_old", status: "open", cancelledAt: null },
        { ...CANCELLED_LINK, id: "pl_door", status: "open", checkoutUrl: null, cancelledAt: null },
        { ...CANCELLED_LINK, id: "pl_paid", status: "paid", checkoutUrl: null, paidAt: CANCELLED },
      ],
      payLinks,
    ).execute();

    expect(views.map((view) => [view.id, view.url])).toEqual([
      ["pl_old", "https://checkout.stripe.test/cs_1"],
      ["pl_door", "https://app.lfc.test/payer/tok_1"],
      ["pl_paid", null],
    ]);
    // Une lecture pour toute la page, et pour les seules lignes ouvertes.
    expect(payLinks.urlsOfCalls).toBe(1);
  });

  it("une adresse qui ne se compose pas laisse sa ligne nulle, sans faire tomber la liste", async () => {
    const payLinks = new RecordingPayLinks();
    await payLinks.open({ type: "free_charge", id: "pl_a" }, OPENING);
    await payLinks.open({ type: "free_charge", id: "pl_b" }, OPENING);
    payLinks.brokenUrls.add("pl_a");
    const open = {
      ...CANCELLED_LINK,
      status: "open" as const,
      checkoutUrl: null,
      cancelledAt: null,
    };
    const views = await handlerOf(
      [
        { ...open, id: "pl_a" },
        { ...open, id: "pl_b" },
      ],
      payLinks,
    ).execute();
    expect(views.map((view) => view.url)).toEqual([null, "https://app.lfc.test/payer/tok_2"]);
  });
});

const OPENING = { origin: "lafoliecoffee", payerLabel: "Les Halles", by: "staff_1", byLabel: null };

function handlerOf(
  entries: readonly PaymentLinkEntry[],
  payLinks: RecordingPayLinks,
): ListPaymentLinksHandler {
  return new ListPaymentLinksHandler(
    new FixedLinks(entries),
    new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Inès", lastName: "Compta" }, "staff_1"),
    ),
    payLinks,
  );
}
