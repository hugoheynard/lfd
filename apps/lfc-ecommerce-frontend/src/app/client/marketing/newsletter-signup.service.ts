import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { NewsletterSignupPayload } from '@lfd/contracts';
// La valeur par l'entrée sans zod : le pied de page est sur tous les écrans.
import { MARKETING_CONSENT_TEXT_VERSIONS } from '@lfd/contracts/shop-values';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import type { LocaleCode } from '../client-locale.service';

/** Ce qu'est devenue une inscription — jamais l'état de l'adresse (règle 17). */
export type NewsletterOutcome = 'sent' | 'too-many' | 'invalid' | 'failed';

const TOO_MANY_REQUESTS = 429;
const BAD_REQUEST = 400;

/**
 * **« Recevoir nos nouvelles »** — `POST /mail/newsletter`, public et sans
 * jeton (plan `documentation/mail/plan-desinscription-des-e-mails.md`, lot C5).
 *
 * Le serveur répond `202` quelle que soit l'adresse : l'écran dit donc
 * toujours la même phrase. `website` est le champ piège — vide pour un humain.
 */
@Injectable({ providedIn: 'root' })
export class NewsletterSignup {
  private readonly http = inject(HttpClient);

  async signUp(email: string, website: string, locale: LocaleCode): Promise<NewsletterOutcome> {
    const payload: NewsletterSignupPayload = {
      email,
      textVersion: MARKETING_CONSENT_TEXT_VERSIONS.newsletter,
      locale,
      website,
    };
    try {
      await firstValueFrom(this.http.post(`${AUTH_CONFIG.apiBaseUrl}/mail/newsletter`, payload));
      return 'sent';
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === TOO_MANY_REQUESTS) {
        return 'too-many';
      }
      if (error instanceof HttpErrorResponse && error.status === BAD_REQUEST) {
        return 'invalid';
      }
      return 'failed';
    }
  }
}
