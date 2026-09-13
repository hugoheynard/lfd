import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { SalesTerms, SalesTermsView } from '@lfd/contracts';
// ⚠️ Les VALEURS passent par `content-values` et non par le baril : celui-ci
// tire zod, qui n'a rien à faire dans un bundle de vitrine — mesuré, +380 ko,
// et le budget passait de vert à rouge.
import { DEFAULT_SALES_TERMS } from '@lfd/contracts/content-values';

import { AUTH_CONFIG } from '../auth/auth.config';
import { ClientLocale } from './client-locale.service';

/** Où en est la lecture du document. Le titre, lui, est toujours disponible. */
export type SalesTermsStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Un article prêt à l'affichage : son rang de lecture, dans la langue courante. */
export interface SalesTermsArticle {
  readonly id: string;
  /** Le numéro imprimé devant le titre — le rang, à partir de 1. */
  readonly rank: number;
  readonly title: string;
  readonly body: string;
}

/**
 * Les conditions générales de vente, telles que la boutique les lit.
 *
 * **Chargement paresseux, à la première ouverture du dialogue, puis gardé.** Le
 * document ne part pas dans le rendu de chaque page : la plupart des visiteurs
 * ne l'ouvriront jamais, et une centaine d'articles dans les trois langues est
 * la charge la plus lourde du contenu de plateforme. `ensureLoaded()` est donc
 * appelé par le panneau, pas par le constructeur.
 *
 * **Le repli ne sert QUE le titre.** `DEFAULT_SALES_TERMS` nomme le document
 * avant toute réponse — c'est ce qui donne au bouton du pied de page un libellé
 * dès le premier rendu, la même doctrine que `ClientContent`. Mais son CORPS est
 * du texte de démonstration, qui dit lui-même n'avoir aucune valeur
 * contractuelle : l'afficher en place des vrais articles montrerait au client un
 * engagement qui n'existe pas. D'où l'asymétrie assumée — un libellé se replie,
 * un contrat non, et une lecture ratée se DIT (`failed`).
 */
@Injectable({ providedIn: 'root' })
export class ClientSalesTerms {
  private readonly http = inject(HttpClient);
  private readonly locale = inject(ClientLocale);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly document = signal<SalesTerms>(DEFAULT_SALES_TERMS);
  private readonly state = signal<SalesTermsStatus>('idle');

  /** Où en est la lecture — c'est ce que le panneau donne à ses états fold. */
  readonly status = this.state.asReadonly();

  /** Le titre du document dans la langue courante. Jamais vide, repli compris. */
  readonly title = computed<string>(() => this.document().title[this.locale.current()]);

  /** Les articles dans l'ordre de lecture, numérotés, dans la langue courante. */
  readonly articles = computed<readonly SalesTermsArticle[]>(() => {
    const code = this.locale.current();
    return this.document().paragraphs.map((paragraph, index) => ({
      id: paragraph.id,
      rank: index + 1,
      title: paragraph[code].title,
      body: paragraph[code].body,
    }));
  });

  /**
   * Charge le document s'il ne l'est pas déjà.
   *
   * Idempotent : deux ouvertures successives ne déclenchent qu'un appel, et une
   * lecture en cours n'est pas relancée. Une lecture ÉCHOUÉE, elle, se rejoue —
   * c'est ce que fait le bouton « Réessayer » du panneau.
   */
  ensureLoaded(): void {
    // ⚠️ Navigateur SEULEMENT, comme `ClientContent` : le rendu serveur n'a pas
    // à attendre un appel réseau pour un dialogue que personne n'a encore
    // ouvert.
    if (!this.isBrowser || this.state() === 'loading' || this.state() === 'ready') {
      return;
    }
    this.state.set('loading');
    this.http.get<SalesTermsView>(`${AUTH_CONFIG.apiBaseUrl}/content/sales-terms`).subscribe({
      next: (view) => {
        this.document.set(view.content);
        this.state.set('ready');
      },
      // Dit, pas avalé : le visiteur a ouvert ce dialogue pour lire un
      // engagement, et lui montrer le texte de démonstration à la place serait
      // pire qu'une panne annoncée.
      error: () => this.state.set('failed'),
    });
  }
}
