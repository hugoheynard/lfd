import { mailLabel } from "@lfd/mail-blocks";

import { mailKeys } from "../mail-specimens.js";

/**
 * Un e-mail neuf du registre sans intitulé sonnerait au staff avec sa clé
 * technique (`customer.order-ready`) au lieu de « Commande prête ».
 */
describe("les intitulés des e-mails du registre", () => {
  it.each(mailKeys())("%s a un intitulé, un destinataire et un moment", (mail) => {
    const label = mailLabel(mail);
    expect(label.title).not.toBe(mail);
    expect(label.title.trim()).not.toBe("");
    expect(label.recipient.trim()).not.toBe("");
    expect(label.moment.trim()).not.toBe("");
  });
});
