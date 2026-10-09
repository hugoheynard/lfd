import { b2bMailTemplates } from "../mail-templates.js";

const render = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
})["staff.customer-request"];

describe("le courriel d'une demande client", () => {
  const data = {
    requestId: "q1",
    formLabel: "Nous écrire",
    reasonLabel: "Devenir client pro",
    urgent: false,
    authorName: "Jean\r\nBcc: victime@exemple.fr",
    authorEmail: "jean@exemple.fr",
    authorPhone: "",
    originLabel: "Particulier",
    clientLabel: "",
    orderNumber: "",
    photoCount: 0,
    message: "<script>alert(1)</script>",
  };

  it("assainit l'objet : un nom saisi n'injecte pas d'en-tête", () => {
    expect(render(data).subject).toBe(
      "Nous écrire — Devenir client pro · Jean Bcc: victime@exemple.fr",
    );
  });

  it("seul un motif urgent l'annonce en tête de l'objet du courriel", () => {
    expect(render({ ...data, urgent: true }).subject).toMatch(/^\[Urgent\] Nous écrire — /u);
    expect(render(data).subject).toMatch(/^Nous écrire — /u);
  });

  it("échappe le texte libre, et tait les lignes vides", () => {
    const { html } = render(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("Téléphone :");
    expect(html).not.toContain("Commande :");
  });

  it("un signalement : la référence dans l'objet et le corps, les photos en lien vers la boîte", () => {
    const rendered = render({
      ...data,
      formLabel: "Signaler un problème",
      reasonLabel: "Produit abîmé",
      orderNumber: "CMD-0001",
      photoCount: 2,
      message: "",
    });
    expect(rendered.subject).toContain("Signaler un problème — Produit abîmé · CMD-0001");
    expect(rendered.html).toContain("Commande : CMD-0001");
    expect(rendered.html).toContain("2 — à voir au back-office");
    expect(rendered.html).toContain("https://bo.lfc.test/b2b/demandes?demande=q1");
  });
});
