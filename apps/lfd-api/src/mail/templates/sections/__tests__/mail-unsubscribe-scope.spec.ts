import { contentLocales } from "@lfd/contracts";

import { MAIL_SYSTEM_COPY, MAIL_SYSTEM_VARIABLES } from "../../copy/mail-system-copy.js";
import {
  activeMailUnsubscribe,
  unsubscribeFooterOf,
  withMailUnsubscribe,
} from "../mail-unsubscribe-scope.js";

const URL = "https://shop.lfc.test/api/lfd/mail/unsubscribe/t";

describe("la phrase système du pied de désinscription (B2)", () => {
  it.each([...contentLocales])("porte le lien UNE fois, et rien d'autre, en %s", (locale) => {
    const { sentence, link } = MAIL_SYSTEM_COPY[locale].unsubscribe;

    expect(sentence.match(/\{(\w+)\}/gu)).toEqual(["{unsubscribeUrl}"]);
    expect(link.trim()).not.toBe("");
    expect(MAIL_SYSTEM_VARIABLES["unsubscribe.sentence"]).toEqual(["unsubscribeUrl"]);
  });

  it.each([...contentLocales])("se coupe autour du lien, sans variable restée en %s", (locale) => {
    const footer = unsubscribeFooterOf(locale, URL);

    expect(footer.url).toBe(URL);
    expect(`${footer.before}${footer.after}`).not.toContain("{");
    expect(`${footer.before}${URL}${footer.after}`).toBe(
      MAIL_SYSTEM_COPY[locale].unsubscribe.sentence.replace("{unsubscribeUrl}", URL),
    );
  });
});

describe("le périmètre du pied", () => {
  it("n'existe que pendant le rendu qui l'a ouvert", () => {
    const footer = unsubscribeFooterOf("fr", URL);

    expect(activeMailUnsubscribe()).toBeUndefined();
    expect(withMailUnsubscribe(footer, () => activeMailUnsubscribe())).toBe(footer);
    expect(activeMailUnsubscribe()).toBeUndefined();
  });
});
