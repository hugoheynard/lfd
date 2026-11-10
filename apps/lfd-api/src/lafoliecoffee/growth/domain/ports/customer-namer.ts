/**
 * Comment s'appelle la **personne** cliente — pour figer son nom dans un fait
 * dont elle est le sujet (`subjectLabel`, D6 du plan des phrases, 2026-09-19).
 *
 * Un port à part d'{@link ActorNamer}, et c'est voulu : celui-là nomme l'AUTEUR
 * d'un geste et se rabat sur l'adresse e-mail d'un client sans profil, pour
 * qu'il reste identifiable. Un libellé de sujet ne le peut pas — le journal ne
 * porte aucune coordonnée. Ici, une fiche sans prénom ni nom rend `null`, et le
 * fait s'écrit sans libellé plutôt qu'avec une adresse.
 */
export abstract class CustomerNamer {
  /** « Prénom Nom », ou `null` : fiche inconnue, ou sans nom saisi. */
  abstract nameOf(userId: string): Promise<string | null>;
}
