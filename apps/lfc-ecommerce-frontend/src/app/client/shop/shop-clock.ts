import { DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Une minute : le grain du compte à rebours de l'heure limite. */
const MINUTE_MS = 60_000;

/**
 * **L'heure de la boutique**, qui avance d'une minute en minute.
 *
 * Le seul endroit de la boutique de commande qui lit le mur pour un AFFICHAGE
 * qui bouge seul : « plus que 2 h 15 pour commander » (2026-10-21). La logique
 * qui en dépend reçoit l'instant en paramètre, jamais `new Date()` — c'est ce
 * qui la rend testable à heure fixe.
 *
 * ⚠️ Un LIBELLÉ, pas une autorité : la journée et la limite viennent du serveur
 * (`GET /fulfillment-days`), et la passation reste seule à refuser.
 *
 * Côté serveur (SSR), l'heure ne bouge pas : un minuteur y retiendrait le rendu.
 */
@Injectable({ providedIn: 'root' })
export class ShopClock {
  private readonly current = signal(new Date());
  readonly now = this.current.asReadonly();

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }
    const timer = setInterval(() => {
      this.current.set(new Date());
    }, MINUTE_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }
}
