import { computed, inject, Injectable, signal } from '@angular/core';
import type { SocietyConsentAnswer } from '@lfd/contracts';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientLocale } from '../client-locale.service';
import { societyAnswer } from './consent-answer';
import { MarketingPreferences } from './marketing-preferences.service';

/**
 * **La case « offres de La Folie Coffee » à la commande** (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, lot C2).
 *
 * 🔴 **Pas d'oracle** (règle 17) : un visiteur voit TOUJOURS la case, non
 * cochée — sinon son absence dirait qu'une adresse est déjà inscrite ou
 * désinscrite. Un client connecté ne la voit que si sa société est
 * `askable` (aucune ligne au registre pour SES adresses).
 *
 * La réponse part dans le corps de la passation ; une case vide n'est pas un
 * refus, et le serveur ignore la réponse si une ligne existe déjà.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutConsent {
  private readonly auth = inject(AuthFacade);
  private readonly preferences = inject(MarketingPreferences);
  private readonly locale = inject(ClientLocale);

  readonly checked = signal(false);

  /** La case paraît-elle ? */
  readonly shown = computed(() => !this.auth.isAuthenticated() || this.preferences.shopAskable());

  /** Lit `askable` pour un client connecté — appelé par le panier à son ouverture. */
  load(): void {
    if (this.auth.isAuthenticated() && this.preferences.status() === 'idle') {
      this.preferences.load();
    }
  }

  /** Ce que la commande envoie : la réponse si la case a paru, rien sinon. */
  answer(): SocietyConsentAnswer | undefined {
    return this.shown() ? societyAnswer(this.checked(), this.locale.current()) : undefined;
  }

  /** La commande est passée : la question est posée, la case revient vide. */
  reset(): void {
    this.checked.set(false);
    // La réponse a pu créer une ligne au registre : on oublie `askable`, et la
    // prochaine ouverture du panier relit — sans appel ici, au milieu du règlement.
    this.preferences.forget();
  }
}
