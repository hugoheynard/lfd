/**
 * La vue vit désormais dans `@lfd/contracts` : le front en rendait sa propre
 * copie champ pour champ, et deux formes qu'aucun compilateur ne rapproche
 * finissent par diverger. On la RÉ-EXPORTE ici pour que les imports du domaine
 * ne bougent pas — le port reste le port, il ne possède simplement plus la forme.
 */
import type { PendingAccessView } from "@lfd/contracts";

export type { PendingAccessView };

/**
 * La **file des accès à remettre** — le canal de secours quand l'e-mail
 * n'arrive pas, et il n'arrive pas toujours : boîte pleine, spam, adresse
 * abandonnée, message supprimé par mégarde.
 *
 * ⚠️ **Rien n'est stocké pour la tenir.** La file est une *requête* : toute
 * personne au statut `invited`. Elle s'y inscrit quand le staff lui ouvre
 * l'accès, et elle en sort **d'elle-même** à la seconde où elle choisit son mot
 * de passe — son statut devient `active` et la requête ne la voit plus. Aucun
 * code de dépilage, donc aucun oubli de dépilage.
 *
 * Elle ne porte pas de liens : un lien de mot de passe est à usage unique et
 * daté, on n'en retrouve pas un, **on en fabrique un**. Le staff en demande un
 * frais au moment de le remettre — rien qui puisse ouvrir un compte ne dort
 * ainsi en base.
 *
 * ⚠️ Elle ne distingue pas « l'e-mail n'est jamais parti » de « il est parti et
 * la personne n'a pas cliqué » : les deux se ressemblent en base, et le geste
 * est le même. L'écran dit donc « n'a pas encore créé son accès », jamais
 * « e-mail non envoyé ».
 */
export abstract class PendingAccessReader {
  abstract list(): Promise<readonly PendingAccessView[]>;
  /** Le sujet d'identité d'une personne en attente, ou `null` si elle n'y est plus. */
  abstract subjectOf(userId: string): Promise<string | null>;
}
