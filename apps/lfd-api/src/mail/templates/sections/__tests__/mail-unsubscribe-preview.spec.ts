import { MAIL_LOCALES } from "@lfd/mail-blocks";

import { MAIL_SYSTEM_COPY } from "../../copy/mail-system-copy.js";
import {
  editorUnsubscribeFooters,
  previewUnsubscribeFooter,
  UNSUBSCRIBE_PREVIEW_URL,
  withPreviewUnsubscribe,
} from "../mail-unsubscribe-preview.js";
import { activeMailUnsubscribe } from "../mail-unsubscribe-scope.js";

describe("le pied de désinscription dans l'éditeur (U4)", () => {
  it("n'en donne aucun à un e-mail transactionnel, ni à un modèle inconnu", () => {
    expect(previewUnsubscribeFooter("transactional", "fr")).toBeNull();
    expect(previewUnsubscribeFooter(null, "fr")).toBeNull();
    expect(editorUnsubscribeFooters("transactional")).toBeNull();
    expect(withPreviewUnsubscribe("transactional", "fr", () => activeMailUnsubscribe())).toBe(
      undefined,
    );
  });

  it("rend un modèle marketing sous le pied, avec l'adresse d'exemple et jamais un jeton", () => {
    const footer = withPreviewUnsubscribe("marketing", "it", () => activeMailUnsubscribe());

    expect(footer?.url).toBe(UNSUBSCRIBE_PREVIEW_URL);
    expect(new URL(UNSUBSCRIBE_PREVIEW_URL).hostname.endsWith(".invalid")).toBe(true);
    expect(footer?.label).toBe(MAIL_SYSTEM_COPY.it.unsubscribe.link);
  });

  it.each([...MAIL_LOCALES])(
    "sert au canevas la phrase verrouillée en %s, sans adresse",
    (locale) => {
      const footers = editorUnsubscribeFooters("marketing");
      const footer = footers?.[locale];

      expect(footer).toBeDefined();
      expect(Object.keys(footer ?? {}).sort()).toEqual(["after", "before", "label"]);
      expect(`${footer?.before ?? ""}{unsubscribeUrl}${footer?.after ?? ""}`).toBe(
        MAIL_SYSTEM_COPY[locale].unsubscribe.sentence,
      );
    },
  );
});
