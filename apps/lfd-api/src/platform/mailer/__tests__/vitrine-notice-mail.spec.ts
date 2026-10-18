import { b2bMailTemplates } from "../mail-templates.js";

const templates = b2bMailTemplates({
  supportEmail: "admin@lfd.fr",
  backOfficeUrl: "https://admin.lfd.fr",
});

describe("agency.vitrine-notice", () => {
  it("échappe le message saisi et assainit l'objet", () => {
    const mail = templates["agency.vitrine-notice"]({
      subject: "Mise à jour\u0007",
      message: "<script>alert(1)</script>",
    });
    expect(mail.subject).not.toContain("\u0007");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("se présente sous la maison", () => {
    const mail = templates["agency.vitrine-notice"]({ subject: "Objet", message: "Texte" });
    expect(mail.html).toContain("La Folie Douce");
  });
});
