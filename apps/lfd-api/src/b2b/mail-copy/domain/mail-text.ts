import { InvalidMailTextError } from "./mail-copy-errors.js";
import type { MailCopyManifestEntry } from "./mail-copy-manifest.js";

const VARIABLE = /\{(\w+)\}/gu;

/** Les noms des `{variables}` d'un texte, triés, sans doublon. */
export function variablesOf(text: string): readonly string[] {
  return [...new Set([...text.matchAll(VARIABLE)].map((match) => match[1] ?? ""))].sort();
}

/** Le texte respecte-t-il les variables de son entrée (C5) ? */
export function keepsVariables(entry: MailCopyManifestEntry, text: string): boolean {
  const found = variablesOf(text);
  return (
    found.every((name) => entry.allowed.includes(name)) &&
    entry.required.every((name) => found.includes(name))
  );
}

/**
 * **Un texte d'e-mail valide** — C5 du plan `plan-textes-des-e-mails.md`.
 *
 * - non vide : vider un texte, c'est rétablir le défaut, un autre geste ;
 * - aucune variable perdue parmi les obligatoires : un client qui reçoit
 *   « Votre commande » sans son numéro voit le défaut, pas l'écran qui l'a
 *   causé ;
 * - aucune variable inconnue : le gabarit ne la fournit pas, elle partirait
 *   telle quelle (`{inconnu}`) dans la boîte du client.
 *
 * Le refus liste les variables permises : c'est ce que la personne doit
 * relire pour corriger, sans le code sous les yeux.
 */
export function validMailText(entry: MailCopyManifestEntry, text: string): string {
  if (text.trim().length === 0) {
    throw new InvalidMailTextError(
      entry.mail,
      entry.path,
      "il est vide. Pour revenir au texte d'origine, utilisez « Rétablir le texte d'origine ».",
    );
  }
  const found = variablesOf(text);
  const unknown = found.filter((name) => !entry.allowed.includes(name));
  const lost = entry.required.filter((name) => !found.includes(name));
  if (unknown.length > 0 || lost.length > 0) {
    throw new InvalidMailTextError(entry.mail, entry.path, variablesReason(entry, unknown, lost));
  }
  return text;
}

function variablesReason(
  entry: MailCopyManifestEntry,
  unknown: readonly string[],
  lost: readonly string[],
): string {
  const problems = [
    ...(lost.length > 0 ? [`il manque ${braces(lost)}, obligatoire`] : []),
    ...(unknown.length > 0 ? [`${braces(unknown)} n'est pas une variable de ce texte`] : []),
  ];
  const permitted =
    entry.allowed.length === 0
      ? "Ce texte n'accepte aucune variable."
      : `Variables permises : ${braces(entry.allowed)}.`;
  return `${problems.join(" ; ")}. ${permitted}`;
}

function braces(names: readonly string[]): string {
  return names.map((name) => `{${name}}`).join(", ");
}
