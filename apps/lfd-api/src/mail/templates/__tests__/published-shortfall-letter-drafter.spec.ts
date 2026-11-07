import type { OrderShortfallDraftData } from "../../channels/templates/shortfall-letter-drafter.js";
import type { MailCopyOverlay } from "../copy/mail-copy-overlay.js";
import type { PublishedMailDocuments } from "../effective-copy/published-mail-documents.js";
import { PublishedMailCopyReader } from "../effective-copy/published-mail-copy.reader.js";
import { PublishedShortfallLetterDrafter } from "../published-shortfall-letter-drafter.js";
import type { MailSectionOrders } from "../sections/mail-layout-scope.js";

/*
 * La rédaction de la lettre de manque, sortie de
 * `b2b/orders/.../get-shortfall-letter-draft.handler.ts` au lot S3b : ses
 * assertions de texte y vivaient, elles vivent ici avec elle.
 */

const DRAFT: OrderShortfallDraftData = {
  reference: "ORD-0001",
  departed: [
    { product: "Croissant", quantity: 1 },
    { product: "Pain au chocolat", quantity: 2 },
  ],
  missing: [{ product: "Croissant", quantity: 2 }],
  locale: "fr",
};

class Published extends PublishedMailCopyReader {
  constructor(private readonly overlay: MailCopyOverlay | Error) {
    super();
  }

  read(): Promise<MailCopyOverlay> {
    return this.overlay instanceof Error
      ? Promise.reject(this.overlay)
      : Promise.resolve(this.overlay);
  }

  sectionOrders(): Promise<MailSectionOrders> {
    return Promise.resolve({});
  }

  documents(): Promise<PublishedMailDocuments> {
    return Promise.resolve({});
  }
}

const draft = (
  data: OrderShortfallDraftData,
  published: PublishedMailCopyReader | null = null,
): Promise<string> => new PublishedShortfallLetterDrafter(published).draft(data);

describe("la rédaction de la proposition « Écrire au client » (E6d)", () => {
  it("dit ce qui part, ce qui manque, et la suite", async () => {
    const message = await draft(DRAFT);

    expect(message).toContain("ORD-0001");
    expect(message).toContain("Ce qui part :\n– 1 × Croissant\n– 2 × Pain au chocolat");
    expect(message).toContain("Ce qui manque :\n– 2 × Croissant");
    expect(message).toContain("Contactez le service commercial.");
  });

  /** P6 de `pricing/vente-au-poids.md` : un manquant au poids se dit en grammes, pas en pièces. */
  it("dit un manquant au poids en grammes, et le lot parti en kilos", async () => {
    const message = await draft({
      ...DRAFT,
      departed: [
        { product: "Saumon gravlax", quantity: 1000, saleUnit: "weight" },
        { product: "Croissant", quantity: 3 },
      ],
      missing: [{ product: "Saumon gravlax", quantity: 250, saleUnit: "weight" }],
    });

    expect(message).toContain("Ce qui part :\n– 1 kg × Saumon gravlax\n– 3 × Croissant");
    expect(message).toContain("Ce qui manque :\n– 250 g × Saumon gravlax");
    expect(message).not.toContain("250 × Saumon");
  });

  it("parle la langue demandée", async () => {
    expect(await draft({ ...DRAFT, locale: "en" })).toContain("What leaves:");
  });

  it("suit les textes publiés, et le texte du code quand leur lecture échoue", async () => {
    const published = new Published({
      fr: { "customer.order-shortfall": { closing: "Pardon, vraiment." } },
    });
    expect(await draft(DRAFT, published)).toContain("Pardon, vraiment.");
    expect(await draft(DRAFT, new Published(new RangeError("base")))).toContain(
      "Toutes nos excuses",
    );
  });
});
