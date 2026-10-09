import { b2bMailTemplates } from "../mail-templates.js";

const render = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
})["staff.contact-message"];

describe("le courriel « Nous écrire »", () => {
  const data = {
    subjectLabel: "Devenir client pro",
    urgent: false,
    authorName: "Jean\r\nBcc: victime@exemple.fr",
    authorEmail: "jean@exemple.fr",
    authorPhone: "",
    originLabel: "Particulier",
    clientLabel: "",
    message: "<script>alert(1)</script>",
  };

  it("assainit l'objet : un nom saisi n'injecte pas d'en-tête", () => {
    expect(render(data).subject).toBe(
      "Nous écrire — Devenir client pro · Jean Bcc: victime@exemple.fr",
    );
  });

  it("seul un objet urgent l'annonce en tête de l'objet du courriel", () => {
    expect(render({ ...data, urgent: true }).subject).toMatch(/^\[Urgent\] Nous écrire — /u);
    expect(render(data).subject).toMatch(/^Nous écrire — /u);
  });

  it("échappe le texte libre, et tait les lignes vides", () => {
    const { html } = render(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("Téléphone :");
  });
});
