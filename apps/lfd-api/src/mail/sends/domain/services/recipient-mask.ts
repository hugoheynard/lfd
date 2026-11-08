/** Le caractère qui remplace ce que la liste ne montre pas de l'adresse. */
const MASK = "•••";

/**
 * **L'adresse masquée** du suivi des e-mails (plan
 * `plan-suivi-des-e-mails.md`, décisions de Hugo du 2026-11-08) : la première
 * lettre de la partie locale, puis le domaine — `colette@halles.fr` →
 * `c•••@halles.fr`. Assez pour reconnaître un envoi parmi d'autres, pas assez
 * pour écrire à quelqu'un.
 *
 * Une adresse sans `@` (le registre ne l'admet pas, mais la colonne ne le
 * garantit pas) est masquée entière : on n'en montre rien plutôt que tout.
 */
export function maskRecipient(address: string): string {
  const trimmed = address.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) {
    return MASK;
  }
  return `${trimmed.charAt(0)}${MASK}${trimmed.slice(at)}`;
}
