import { Injectable, signal } from '@angular/core';

/** Une entrée au panier : son rang (une par geste) et l'article. */
export interface CartEntry {
  readonly id: number;
  readonly sku: string;
}

/**
 * **Les entrées au panier** — le passage de zéro à une pièce, et lui seul : un
 * « + » sur un article déjà présent n'est pas une entrée.
 *
 * Les écrans qui comptent `added_to_cart` (la tuile, la fiche, la carte d'une
 * suggestion) l'annoncent ici au même instant ; l'après-ajout (RS7) l'écoute.
 * Un service à part, et pas un effet sur le panier : le panier change aussi
 * quand il remonte de la base ou qu'on recommande, et ce ne sont pas des
 * gestes du client.
 */
@Injectable({ providedIn: 'root' })
export class CartEntries {
  private readonly last = signal<CartEntry | null>(null);
  private entries = 0;

  /** La dernière entrée, `null` avant la première. */
  readonly latest = this.last.asReadonly();

  entered(sku: string): void {
    this.entries += 1;
    this.last.set({ id: this.entries, sku });
  }
}
