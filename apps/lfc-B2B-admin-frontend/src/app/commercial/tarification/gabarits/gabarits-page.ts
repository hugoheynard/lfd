import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PriceTemplateKind, PriceTemplateView } from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';
import { FoldButtonComponent, FoldEmptyStateComponent } from 'fold-ng';

import { PriceTemplatesService } from '../templates.service';
import {
  averageGapBp,
  entryPriceCents,
  gapToCatalogBp,
  isFlatPrice,
  ruleCount,
} from './template-grid';

/** Ce que chaque nature raconte d'elle-même — la seule chose qui les sépare. */
const COPY: Readonly<Record<PriceTemplateKind, { title: string; hint: string }>> = {
  mercuriale: {
    title: 'Gabarits de mercuriale',
    hint: "La grille qu'on prépare une fois et qu'on repose chez plusieurs clients. Posée, elle devient le tarif négocié du client.",
  },
  devis: {
    title: 'Gabarits de devis',
    hint: 'La même grille, pour chiffrer sans rien poser. Elle sert à répondre, pas à engager.',
  },
};

/**
 * **Les gabarits tarifaires** — une seule page pour les deux natures.
 *
 * Mercuriales et devis portent exactement la même chose : une grille de prix.
 * Deux composants auraient dupliqué le tableau, l'éditeur et la comparaison au
 * catalogue pour un discriminant — et auraient divergé au premier ajout de
 * colonne. La nature vient de la route, et ne change que deux phrases et un
 * bouton.
 *
 * **Aucun éditeur en panneau.** Composer et réviser mènent au même écran : la
 * grille du gabarit, qui a le layout de la tarification générale. Une grille de
 * quatre-vingt-douze articles ne se travaille pas dans un tiroir, et la
 * comparaison au catalogue sert au moment où l'on tape le prix.
 *
 * **Le prix fixe n'est pas un mode.** C'est la grille à un seul palier, à partir
 * de 1 ; l'écran le NOMME pour qu'on ne le cherche pas ailleurs, mais rien
 * derrière ne le distingue.
 */
@Component({
  selector: 'app-gabarits-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldButtonComponent, FoldEmptyStateComponent],
  templateUrl: './gabarits-page.html',
  styleUrl: './gabarits-page.scss',
})
export class GabaritsPage {
  /** La nature vient de la route : `mercuriale` ou `devis`. */
  readonly kind = input.required<PriceTemplateKind>();

  private readonly templates = inject(PriceTemplatesService);

  protected readonly euros = formatEuros;
  protected readonly isFlatPrice = isFlatPrice;
  protected readonly entryPriceCents = entryPriceCents;
  protected readonly ruleCount = ruleCount;
  protected readonly averageGapBp = averageGapBp;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly rows = signal<readonly PriceTemplateView[]>([]);
  /** Le gabarit déplié : on n'en lit qu'un à la fois, ils font cent lignes. */
  protected readonly opened = signal<string | null>(null);

  protected readonly copy = computed(() => COPY[this.kind()]);
  /** Poser chez un client n'a de sens que pour une mercuriale. */
  protected readonly posable = computed(() => this.kind() === 'mercuriale');

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.rows.set(await this.templates.list(this.kind()));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected toggle(id: string): void {
    this.opened.set(this.opened() === id ? null : id);
  }

  protected gap(catalogPriceMillicents: number | null, unitPriceMillicents: number): number | null {
    return gapToCatalogBp(catalogPriceMillicents, unitPriceMillicents);
  }

  /** Le signe se dit en toutes lettres : « −20 % » et « +4 % » ne se lisent pas pareil. */
  protected percent(bp: number): string {
    return `${bp > 0 ? '−' : '+'}${(Math.abs(bp) / 100).toFixed(1).replace('.', ',')} %`;
  }

  protected direction(bp: number): 'down' | 'up' | 'flat' {
    if (bp === 0) {
      return 'flat';
    }
    return bp > 0 ? 'down' : 'up';
  }
}
