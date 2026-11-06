import { b2bMailTemplates } from "../mail-templates.js";

/*
 * Le gabarit de la sonde de déploiement. La sonde elle-même vit dans le bloc
 * `mail` depuis le lot S2h (`mail/requests/application/check-mail-delivery.handler.ts`).
 */
describe("le gabarit du contrôle", () => {
  it("nomme la révision et l’expéditeur dans ce qu’on reçoit", () => {
    const templates = b2bMailTemplates({
      supportEmail: "dev@exemple.test",
      backOfficeUrl: "https://admin.exemple.test",
    });
    const mail = templates["ops.deploy-check"]({
      revision: "abc1234",
      fromAddress: "no-reply@exemple.test",
    });

    expect(mail.subject).toContain("abc1234");
    expect(mail.html).toContain("no-reply@exemple.test");
  });
});
