import type { FreeBlock } from "./mail-document.js";
import type { Localized, MailLocale } from "./mail-locales.js";
import { violation, type MailDocumentViolation } from "./mail-document-violation.js";

const LOCALE_NAMES: Readonly<Record<MailLocale, string>> = {
  fr: "français",
  en: "anglais",
  it: "italien",
};

function textsOf(block: FreeBlock): Localized<string> | null {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "callout":
      return block.text;
    case "button":
      return block.label;
    case "divider":
      return null;
  }
}

/** Les langues du modèle où ce bloc libre n'a pas de texte (vide ou blanc compris). */
export function missingTextViolations(
  block: FreeBlock,
  locales: readonly MailLocale[],
): readonly MailDocumentViolation[] {
  const texts = textsOf(block);
  if (texts === null) {
    return [];
  }
  return locales
    .filter((locale) => (texts[locale] ?? "").trim() === "")
    .map((locale) =>
      violation(
        "missing-text",
        block.id,
        `Ce bloc n'a pas de texte en ${LOCALE_NAMES[locale]}, et l'e-mail part aussi dans cette langue : écrivez-le avant de publier.`,
      ),
    );
}
