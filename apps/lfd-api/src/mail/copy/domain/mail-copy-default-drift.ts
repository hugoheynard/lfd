import type { MailCopyEntryState } from "./mail-copy-entry.js";

/**
 * **Le texte du code a-t-il changé depuis qu'on l'a remplacé ?** (décision de
 * Hugo, 2026-10-23, plan `plan-textes-des-e-mails.md` §2 quinquies) — rend le
 * texte du code tel qu'il était au moment de la modification, ou `null`.
 *
 * Le remplacement qui compte est celui qui partira : le brouillon s'il
 * remplace, sinon le publié. Un brouillon « rétablir » n'a plus rien à
 * signaler — il ramène justement au texte du code. Une base qui ne sait pas
 * (ligne antérieure à la note) ne signale rien : un signal inventé ferait
 * relire pour rien, un signal manqué ne fait que retarder une relecture.
 *
 * Un avertissement, jamais un refus : « Publier » reste permis.
 */
export function defaultChangedSince(
  state: MailCopyEntryState | null,
  currentDefault: string | null,
): string | null {
  if (state === null || currentDefault === null) {
    return null;
  }
  const basis = basisOf(state);
  return basis === null || basis === currentDefault ? null : basis;
}

function basisOf(state: MailCopyEntryState): string | null {
  if (state.draft.state === "set") {
    return state.draftDefault;
  }
  if (state.draft.state === "reset" || state.publishedText === null) {
    return null;
  }
  return state.publishedDefault;
}
