/**
 * Port de lecture de la **clé de stockage du logo** — rien d'autre.
 *
 * Quatrième port sur la même table, et le plus étroit des quatre. Il existe
 * parce que deux LECTURES ont besoin de cette clé — servir le logo à l'écran, et
 * le dessiner sur un mandat — et qu'aucune des deux n'a le droit d'écrire.
 * Passer par `LegalEntityRepository` leur donnerait `save()`, c'est-à-dire de
 * quoi muter l'agrégat depuis un chemin de lecture ; passer par
 * `LegalEntityReader` ferait sortir la clé dans une vue, ce que le contrat
 * interdit expressément.
 *
 * 🔴 Ce que ce port rend **ne repart jamais au client**. La clé sert à aller
 * chercher des octets, elle ne s'affiche pas et ne se reçoit pas.
 */
export abstract class LegalEntityLogoReader {
  /**
   * La clé du logo de cette entité.
   *
   * `null` couvre **deux** cas — entité inconnue, ou entité sans logo — et c'est
   * volontaire : les deux appellent la même réponse côté lecture (pas de logo à
   * servir), et les distinguer obligerait chaque appelant à écrire une branche
   * qui ne changerait rien pour l'utilisateur.
   */
  abstract logoKeyOf(legalEntityId: string): Promise<string | null>;
}
