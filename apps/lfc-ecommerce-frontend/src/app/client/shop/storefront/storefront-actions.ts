import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * **Les gestes d'une case de vitrine**, remontés à la grille.
 *
 * Les composants de rendu sont créés par `NgComponentOutlet`, qui ne branche
 * que des ENTRÉES : un `output()` n'y a personne pour l'écouter. La grille
 * fournit donc ce relais dans ses `providers`, et chaque rendu l'injecte — le
 * même pour une case composée et pour une case du reste du rayon.
 */
@Injectable()
export class StorefrontActions {
  /** Le SKU dont on veut la fiche. */
  readonly productOpened = new Subject<string>();
  /** Le SKU à ajouter au panier. */
  readonly productAdded = new Subject<string>();
  /** Le rayon qu'ouvre une annonce. */
  readonly shelfOpened = new Subject<string>();
}
