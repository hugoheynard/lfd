/**
 * Le **numéro court** d'un compte client, dit dans le journal à la place de
 * son nom ou de son adresse (RGPD : aucune donnée personnelle, même lue à
 * l'affichage).
 *
 * L'identifiant d'un `User` est un cuid (`@default(cuid())`, `account.prisma`,
 * vérifié le 2026-11-07) : ses derniers caractères sont sa part aléatoire, donc
 * les plus distinctifs. Ce numéro est stable — même compte, même numéro — mais
 * il n'est pas unique garanti : il désigne, il n'identifie pas.
 */
export const CLIENT_NUMBER_LENGTH = 6;

/** Les six derniers caractères de l'identifiant, en majuscules ; `null` sans identifiant. */
export function clientNumber(accountId: string): string | null {
  const id = accountId.trim();
  return id === '' ? null : id.slice(-CLIENT_NUMBER_LENGTH).toUpperCase();
}
