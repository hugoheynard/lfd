/**
 * Port de lecture : **quel compte de chez nous un sujet de connexion ouvre-t-il ?**
 *
 * Une seule question, posée deux fois par le rattachement d'une méthode de
 * connexion : avant, pour refuser tout de suite ce qui ouvrirait déjà un autre
 * compte ; après, pour détecter qu'une ligne est apparue pendant le geste et
 * défaire le rattachement (plan `plan-rattachement-depuis-le-profil.md`, §9.4).
 *
 * Port à part et non une méthode de plus sur le dépôt du profil (ISP) : son
 * seul consommateur ne sait ni écrire un profil, ni en lire un — il cherche un
 * propriétaire, et c'est tout ce qu'il lui faut.
 */
export abstract class LoginSubjectReader {
  /**
   * Le compte que ce sujet ouvre, `null` si aucun.
   *
   * ⚠️ Rend un identifiant **de chez nous**. Le sujet entre, il ne ressort
   * jamais — ni dans un message, ni dans une réponse.
   */
  abstract findUserIdBySubject(subject: string): Promise<string | null>;
}
