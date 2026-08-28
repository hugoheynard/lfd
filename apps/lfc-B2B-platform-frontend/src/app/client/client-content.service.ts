import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type {
  FooterContent,
  FooterContentView,
  FooterLocaleContent,
  LegalIdentity,
} from '@lfd/contracts';
// ⚠️ Les VALEURS passent par `content-values` et non par le baril : celui-ci
// tire zod, qui n'a rien à faire dans un bundle de vitrine — mesuré, +380 ko,
// et le budget passait de vert à rouge.
import { DEFAULT_FOOTER_CONTENT } from '@lfd/contracts/content-values';

import { AUTH_CONFIG } from '../auth/auth.config';
import { ClientLocale } from './client-locale.service';

/**
 * Les textes de la vitrine, servis par l'API.
 *
 * Ils étaient compilés dans le bundle, en trois dictionnaires. Corriger un mot
 * demandait un développeur, une revue et un déploiement ; ils sont désormais
 * une donnée, éditée depuis le back-office.
 *
 * **Le contenu de départ reste, et c'est le point.** Il n'est plus la source de
 * vérité — la base l'est dès le premier enregistrement — mais il est le REPLI :
 * l'état initial du signal, donc ce qui s'affiche avant que la réponse arrive,
 * et ce qui reste affiché si elle n'arrive jamais. Il n'existe aucun instant où
 * le pied de page est vide, y compris hors ligne, y compris si l'API est à
 * terre. C'est ce qui rend le basculement sans risque.
 *
 * Le même objet sert les deux côtés : le serveur le rend tant que rien n'est
 * enregistré, ce front s'y replie quand le réseau ne répond pas. Le dupliquer
 * aurait garanti qu'ils divergent au premier mot corrigé d'un seul côté.
 */
@Injectable({ providedIn: 'root' })
export class ClientContent {
  private readonly http = inject(HttpClient);
  private readonly locale = inject(ClientLocale);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly content = signal<FooterContent>(DEFAULT_FOOTER_CONTENT);

  /** Le pied de page dans la langue courante. */
  readonly footer = computed<FooterLocaleContent>(() => this.content()[this.locale.current()]);

  /** L'identité légale — la même quelle que soit la langue. */
  readonly identity = computed<LegalIdentity>(() => this.content().identity);

  constructor() {
    // ⚠️ Navigateur SEULEMENT. Le rendu serveur n'a pas à attendre un appel
    // réseau pour un pied de page : il rend le contenu de départ, et le
    // navigateur remplace par ce qui est enregistré. Le pire cas visible est
    // donc un texte qui se corrige, jamais un trou.
    if (this.isBrowser) {
      this.load();
    }
  }

  private load(): void {
    this.http.get<FooterContentView>(`${AUTH_CONFIG.apiBaseUrl}/content/footer`).subscribe({
      next: (view) => this.content.set(view.content),
      // Silencieux À DESSEIN : le visiteur n'a rien à faire de cette panne, et
      // ce qu'il lit reste juste. Une erreur affichée ici lui demanderait de
      // s'inquiéter d'un pied de page.
      error: () => undefined,
    });
  }
}
