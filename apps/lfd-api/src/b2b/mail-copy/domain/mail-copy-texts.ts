import type { MailCopyEntryState } from "./mail-copy-entry.js";
import type { MailCopyLocale, MailCopySource } from "./mail-copy-locale.js";
import type { MailCopyManifest } from "./mail-copy-manifest.js";
import { keepsVariables } from "./mail-text.js";

/** Les textes qui remplacent ceux du code, pour une langue : e-mail → chemin → texte. */
export type MailTextsByMail = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * **Les textes qui remplacent ceux du code**, pour une langue et une source
 * (plan `plan-textes-des-e-mails.md`, C2, C6) :
 *
 * - `published` : ce qui part aujourd'hui — le texte publié ;
 * - `draft` : ce qui partira après « Publier » — le brouillon `set`, rien pour
 *   un brouillon `reset` (le texte du code revient), le publié sinon.
 *
 * Seuls les textes que le dictionnaire de ce code connaît, et dont les
 * variables tiennent encore contre lui, en sortent : une orpheline n'est
 * jamais appliquée, et un texte publié AVANT qu'une variable devienne
 * obligatoire cède la place au défaut plutôt que de partir sans elle.
 */
export function replacementTexts(
  states: readonly MailCopyEntryState[],
  manifest: MailCopyManifest,
  locale: MailCopyLocale,
  source: MailCopySource,
): MailTextsByMail {
  const texts: Record<string, Record<string, string>> = {};
  for (const state of states) {
    const text = state.locale === locale ? textOf(state, source) : null;
    const entry = manifest.entry(state.mail, state.path);
    if (text === null || entry === null || !keepsVariables(entry, text)) {
      continue;
    }
    texts[state.mail] = { ...texts[state.mail], [state.path]: text };
  }
  return texts;
}

function textOf(state: MailCopyEntryState, source: MailCopySource): string | null {
  if (source === "published") {
    return state.publishedText;
  }
  switch (state.draft.state) {
    case "set":
      return state.draft.text;
    case "reset":
      return null;
    case "unchanged":
      return state.publishedText;
  }
}
