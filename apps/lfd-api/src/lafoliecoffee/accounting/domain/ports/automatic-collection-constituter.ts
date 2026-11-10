/**
 * **La constitution, faite par l'automatisme** (PA3) : la MÊME commande que
 * le bouton de la comptabilité, sous l'acteur système, auteur `system`.
 *
 * Un port plutôt qu'un appel au bus depuis le handler du passage : le
 * passage se teste sans Nest, et l'adaptateur seul sait poser l'acteur.
 */
export abstract class AutomaticCollectionConstituter {
  /**
   * @returns les lots créés — vide si la constitution n'a fait qu'écarter.
   * @throws ce que la constitution refuse ; le passage le range, il ne l'avale pas.
   */
  abstract constitute(legalEntityId: string): Promise<readonly string[]>;
}
