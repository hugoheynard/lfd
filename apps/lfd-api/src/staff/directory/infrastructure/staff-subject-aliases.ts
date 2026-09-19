/**
 * La **table des `sub`** (`staff_subject_aliases`), vue de ceux qui l'écrivent.
 *
 * Deux gestes relient un `sub` à une fiche — l'invitation (`markInvited`) et le
 * premier rapprochement du résolveur d'accès — et chacun y ajoute sa ligne dans
 * la même écriture que la liaison (`architecture-journalisation.md` §12,
 * D5.1). Les deux passent par ici pour que la valeur de `source` et la règle
 * « le premier lien fait foi » ne s'écrivent qu'une fois.
 */

/**
 * `source` d'un lien écrit par le code. `current` n'est écrit que par la
 * migration qui a créé la table ; un CHECK en base refuse toute autre valeur.
 */
export const SUBJECT_LINKED = "linked";

/**
 * Les arguments d'un `createMany` qui inscrit le lien `sub → fiche`.
 *
 * `skipDuplicates` (`ON CONFLICT DO NOTHING`) : un `sub` déjà inscrit garde sa
 * fiche d'origine. Réinviter une personne sous un `sub` qu'elle a déjà porté
 * n'écrit donc rien, et un `sub` ne change jamais de personne.
 */
export function linkedSubject(sub: string, staffUserId: string): LinkedSubjectArgs {
  return { data: { sub, staffUserId, source: SUBJECT_LINKED }, skipDuplicates: true };
}

interface LinkedSubjectArgs {
  readonly data: { readonly sub: string; readonly staffUserId: string; readonly source: string };
  readonly skipDuplicates: boolean;
}
