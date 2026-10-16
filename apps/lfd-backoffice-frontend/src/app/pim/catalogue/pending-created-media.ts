import { Injectable, signal } from '@angular/core';

import type { MediaSlot } from './product-http-api';

/** Les photos d'une fiche neuve que le serveur a refusées, et pourquoi. */
export interface CreatedMediaFailure {
  readonly slots: readonly MediaSlot[];
  /** Le message du serveur, tel quel. */
  readonly message: string;
}

/**
 * Les photos choisies avant « Créer » dont l'envoi a échoué juste après la
 * création, rangées par fiche.
 *
 * Fourni à la RACINE, et c'est tout son objet : le store de la fiche vit avec
 * la page, et « Créer » navigue de `produits/nouveau` vers `produits/:id` —
 * une autre instance, qui relit la fiche au serveur sans ces photos. Un
 * visuel n'est qu'une référence (URL + nom) à la médiathèque, pas un fichier :
 * le garder ici suffit à le renvoyer tant que l'onglet reste ouvert. Rien ne
 * survit à un rechargement de la page.
 */
@Injectable({ providedIn: 'root' })
export class PendingCreatedMedia {
  private readonly failures = signal<ReadonlyMap<string, CreatedMediaFailure>>(new Map());

  of(productId: string): CreatedMediaFailure | null {
    return this.failures().get(productId) ?? null;
  }

  record(productId: string, failure: CreatedMediaFailure): void {
    this.failures.update((current) => new Map(current).set(productId, failure));
  }

  clear(productId: string): void {
    this.failures.update((current) => {
      const next = new Map(current);
      next.delete(productId);
      return next;
    });
  }
}
