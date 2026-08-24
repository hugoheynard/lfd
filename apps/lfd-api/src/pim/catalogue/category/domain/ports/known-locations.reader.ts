/**
 * **Quels locations existent** — la face manquante d'un mur à une seule face.
 *
 * Les canaux d'une famille référencent l'emplacement par son identifiant, dans
 * une colonne `jsonb` : aucune clé étrangère ne peut tenir cette référence.
 * `DeleteLocation` en tire la conséquence et refuse de supprimer un
 * location encore coché. Mais rien ne vérifiait le sens inverse — écrire un
 * preset qui référence un emplacement qui n'existe pas était accepté, et
 * l'écran l'affichait comme absent plutôt que comme faux.
 *
 * C'est la panne « Ardroit » : une boutique proposée à l'écran qui ne
 * correspondait à aucune ligne du référentiel.
 */
export abstract class KnownLocationsReader {
  /** Les identifiants qui existent, parmi ceux qu'on lui donne. */
  abstract existing(ids: readonly string[]): Promise<ReadonlySet<string>>;
}
