import { DestroyRef, inject, Injectable, signal } from '@angular/core';

import { DeliveryRoundsService } from './delivery-rounds.service';

/**
 * **La feuille PDF d'une tournée**, rendue par le serveur et ouverte dans un
 * nouvel onglet — le geste du dossier du Prévisionnel. Sortie de `RoundsPage`
 * avec l'URL objet qu'elle doit révoquer.
 *
 * Fournie par la page : l'URL vivante meurt avec l'écran.
 */
@Injectable()
export class RoundPdf {
  private readonly rounds = inject(DeliveryRoundsService);

  /** Le dernier PDF de tournée n'a pas pu être téléchargé. */
  readonly failed = signal(false);
  /**
   * L'URL objet du dernier PDF, quand le navigateur a bloqué l'onglet : on
   * propose alors de le télécharger. `null` sinon.
   */
  readonly blockedUrl = signal<string | null>(null);
  /**
   * L'URL objet vivante. Révoquée au PDF suivant et à la destruction de
   * l'écran — pas après un délai, qui couperait un onglet encore en train de
   * charger.
   */
  private objectUrl: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  /**
   * Télécharge la feuille et l'ouvre. Si le navigateur bloque l'onglet
   * (`window.open` rend `null`), on garde l'URL et on propose un lien de
   * téléchargement à la place.
   */
  async print(roundId: string): Promise<void> {
    this.failed.set(false);
    this.blockedUrl.set(null);
    try {
      const blob = await this.rounds.roundPdf(roundId);
      this.revoke();
      const url = URL.createObjectURL(blob);
      this.objectUrl = url;
      if (window.open(url, '_blank') === null) {
        this.blockedUrl.set(url);
      }
    } catch {
      this.failed.set(true);
    }
  }

  private revoke(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
