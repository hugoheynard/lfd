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
  cardWillBeRefunded: false,
  locale: "fr" as const,
};

describe("la proposition d'« Écrire au client »", () => {
  it("nomme la commande, les articles partis, les articles manquants et la suite", () => {
    const draft = draftOrderShortfallMessage(DRAFT);

    expect(draft).toContain("ORD-0042");
    expect(draft).toContain("Ce qui part :\n– 1 × Croissant");
    expect(draft).toContain("Ce qui manque :\n– 2 × Croissant\n– 6 × Pain au chocolat");
    expect(draft).toContain("Contactez le service commercial.");
    expect(draft).not.toContain("Le reste ne sera pas livré");
  });

  it("ne promet aucun remboursement quand la carte n'est pas encaissée", () => {
    expect(draftOrderShortfallMessage(DRAFT)).not.toContain("remboursé");
  });

  /** Plan E9, § 7 : une carte encaissée — le reste sera rendu au solde, sans montant. */
  it("dit que le reste sera remboursé sur la carte, sans montant, avant la suite", () => {
    const draft = draftOrderShortfallMessage({ ...DRAFT, cardWillBeRefunded: true });

    expect(draft).toContain(
      "– 6 × Pain au chocolat\n\nLe reste vous sera remboursé sur votre carte.\n\nContactez le service commercial.",
    );
    expect(draft).not.toMatch(/€|\d+,\d{2}/u);
  });

  it.each([
    ["en", "The rest will be refunded to your card."],
    ["it", "Il resto ti sarà rimborsato sulla carta."],
  ] as const)("le dit en %s", (locale, sentence) => {
    expect(draftOrderShortfallMessage({ ...DRAFT, cardWillBeRefunded: true, locale })).toContain(
      sentence,
    );
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

describe("customer.order-shortfall-refunded", () => {
  const refunded = (locale: "fr" | "en" | "it") =>
    REGISTRY["customer.order-shortfall-refunded"]({
      reference: "ORD-0042",
      amountCents: 1_140,
      locale,
    });

  it("dit le montant rendu sur la carte, dans le corps et sur la ligne du montant", () => {
    const mail = refunded("fr");

    expect(mail.subject).toBe("Commande ORD-0042 : le reste vous est remboursé");
    // `Intl` sépare le montant de « € » par une espace insécable.
    expect(mail.text).toMatch(/11,40\s€ vous ont été remboursés sur votre carte, pour ce qui/u);
    expect(mail.text).toMatch(/Montant remboursé — 11,40\s€/u);
    expect(mail.html).toContain("ORD-0042");
  });

  it("écrit le montant dans la langue du destinataire", () => {
    expect(refunded("en").text).toContain("€11.40 has been refunded to your card");
    expect(refunded("it").subject).toBe("Ordine ORD-0042: il resto ti è rimborsato");
    expect(refunded("it").text).toContain("11,40");
  });

  it("suit le texte publié quand le périmètre est ouvert", () => {
    const mail = withMailCopyOverlay(
      { fr: { "customer.order-shortfall-refunded": { delay: "Sous trois jours." } } },
      () => refunded("fr"),
    );

    expect(mail.text).toContain("Sous trois jours.");
  });
});
