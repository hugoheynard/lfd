import { withMailCopyOverlay } from "../copy/mail-copy-overlay.js";
import { b2bMailTemplates } from "../mail-templates.js";
import { draftOrderShortfallMessage } from "../order-shortfall-mail.js";

/**
 * « Écrire au client » après un départ incomplet (plan E6d) : la proposition
 * dit ce qui part et ce qui manque ; le courriel rend le texte RELU, jamais
 * la proposition.
 */
const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

const DRAFT = {
  reference: "ORD-0042",
  departed: [{ product: "Croissant", quantity: 1 }],
  missing: [
    { product: "Croissant", quantity: 2 },
    { product: "Pain au chocolat", quantity: 6 },
  ],
  locale: "fr" as const,
};

describe("la proposition d'« Écrire au client »", () => {
  it("nomme la commande, les articles partis, les articles manquants et la suite", () => {
    const draft = draftOrderShortfallMessage(DRAFT);

    expect(draft).toContain("ORD-0042");
    expect(draft).toContain("Ce qui part :\n– 1 × Croissant");
    expect(draft).toContain("Ce qui manque :\n– 2 × Croissant\n– 6 × Pain au chocolat");
    expect(draft).toContain("Le reste ne sera pas livré");
  });

  it("parle la langue demandée", () => {
    expect(draftOrderShortfallMessage({ ...DRAFT, locale: "en" })).toContain("What is missing:");
  });

  it("suit le texte publié quand le périmètre est ouvert", () => {
    const draft = withMailCopyOverlay(
      { fr: { "customer.order-shortfall": { closing: "Pardon, vraiment." } } },
      () => draftOrderShortfallMessage(DRAFT),
    );

    expect(draft.endsWith("Pardon, vraiment.")).toBe(true);
  });
});

describe("customer.order-shortfall", () => {
  it("rend le texte relu, échappé, et pas la proposition", () => {
    const mail = REGISTRY["customer.order-shortfall"]({
      reference: "ORD-0042",
      message: "Il manque <b>deux</b> croissants.",
      locale: "fr",
    });

    expect(mail.subject).toBe("Commande ORD-0042 : elle part incomplète");
    expect(mail.html).toContain("Il manque &lt;b&gt;deux&lt;/b&gt; croissants.");
    expect(mail.html).not.toContain("Ce qui part");
  });
});
