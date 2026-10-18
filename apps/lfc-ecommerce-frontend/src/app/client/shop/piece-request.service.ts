import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

/** L'adresse de la boutique — la seule page qui porte la fiche d'un article. */
const SHOP = '/boutique';

/** Une demande d'ouverture : son rang (deux demandes du même article en font deux) et l'article. */
export interface PieceAsk {
  readonly id: number;
  readonly sku: string;
}

/**
 * **Ouvrir la fiche d'un article depuis n'importe où** (Hugo, 2026-10-18 :
 * un clic sur une suggestion du staff ouvre la fiche de l'article suggéré).
 *
 * La fiche vit dans la boutique, qui tient l'article ouvert (`openPiece`) ;
 * une suggestion, elle, paraît aussi à l'accueil, au panier et dans le retour
 * « Ajouté ! », qui ne la connaissent pas. La demande passe donc par ici :
 * la boutique la consomme (`take`) — en y menant d'abord quand on n'y est pas —,
 * et ce qui couvrirait la fiche (le dialogue du panier, son popover) se
 * referme en voyant passer une demande plus récente que lui.
 */
@Injectable({ providedIn: 'root' })
export class PieceRequest {
  private readonly router = inject(Router);
  private readonly asked = signal<PieceAsk | null>(null);
  private count = 0;
  private taken = 0;

  /** La dernière demande, consommée ou non — ce que les panneaux à refermer écoutent. */
  readonly latest = this.asked.asReadonly();

  /** Le rang de la dernière demande : un panneau ouvert après elle ne s'y refermera pas. */
  rank(): number {
    return this.count;
  }

  open(sku: string): void {
    this.count += 1;
    this.asked.set({ id: this.count, sku });
    if (this.router.url.split('?')[0] !== SHOP) {
      void this.router.navigate([SHOP]);
    }
  }

  /**
   * La boutique prend la demande, une fois : revenir plus tard à la boutique
   * ne rouvre pas la fiche. `latest` la garde pour les panneaux.
   */
  take(): string | null {
    const ask = this.asked();
    if (ask === null || ask.id <= this.taken) {
      return null;
    }
    this.taken = ask.id;
    return ask.sku;
  }
}
