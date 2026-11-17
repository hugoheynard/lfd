/**
 * **« Combien de produits ont un poste ? »** — la lecture que lit la garde de
 * bascule en mode prod (`documentation/fournil/les-postes-du-fournil.md`, § 3.9) : on
 * ne bascule pas à vide. Un `count`, jamais la carte chargée.
 */
export abstract class PlacedProducts {
  abstract count(): Promise<number>;
}
