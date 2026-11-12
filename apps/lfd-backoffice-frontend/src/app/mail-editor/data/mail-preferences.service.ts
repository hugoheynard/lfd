import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  MailPreferenceDetailView,
  MailPreferenceListView,
  MailPreferenceRecipientView,
  MailPreferenceSearchCreatedView,
  MailPreferenceSearchView,
  MailSendSpace,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import { intentOptions } from '../../shared/gesture-intents';
import { mailPreferenceQuery, type MailPreferenceFilters } from '../rules/mail-preference-labels';

const BASE = `${B2B_API_BASE}/admin/mail/preferences`;

/**
 * **Les désinscriptions et accords** (doc `la-desinscription-et-l-accord.md`,
 * lot C4), murés côté serveur par le droit `mail_sends`.
 *
 * 🔴 Une adresse ne voyage JAMAIS dans une URL : chercher ou désinscrire une
 * adresse la pose dans le corps d'un `POST`. Afficher une adresse est inscrit au
 * journal, sous le plafond du suivi (`409` au-delà de 30 par heure). Aucune
 * méthode ne réinscrit : le serveur n'en a pas.
 */
@Injectable({ providedIn: 'root' })
export class MailPreferencesService {
  private readonly http = inject(HttpClient);

  list(
    filters: MailPreferenceFilters,
    cursor: string | null = null,
  ): Promise<MailPreferenceListView> {
    return firstValueFrom(
      this.http.get<MailPreferenceListView>(BASE, { params: mailPreferenceQuery(filters, cursor) }),
    );
  }

  detail(id: string): Promise<MailPreferenceDetailView> {
    return firstValueFrom(
      this.http.get<MailPreferenceDetailView>(`${BASE}/${encodeURIComponent(id)}`),
    );
  }

  /** Révèle l'adresse (inscrit au journal, vaut 5 minutes), puis la lit. */
  async revealRecipient(id: string, intentKey: string): Promise<MailPreferenceRecipientView> {
    const at = `${BASE}/${encodeURIComponent(id)}`;
    await firstValueFrom(
      this.http.post<unknown>(`${at}/recipient-reveal`, null, intentOptions(intentKey)),
    );
    return firstValueFrom(this.http.get<MailPreferenceRecipientView>(`${at}/recipient`));
  }

  /** Cherche les lignes d'une adresse (dans le CORPS), puis lit le résultat figé. */
  async searchByAddress(address: string, intentKey: string): Promise<MailPreferenceSearchView> {
    const { id } = await firstValueFrom(
      this.http.post<MailPreferenceSearchCreatedView>(
        `${BASE}/searches`,
        { address },
        intentOptions(intentKey),
      ),
    );
    return firstValueFrom(
      this.http.get<MailPreferenceSearchView>(`${BASE}/searches/${encodeURIComponent(id)}`),
    );
  }

  /** Désinscrit cette ligne à la demande du client (source `staff`, au journal). */
  async unsubscribe(id: string): Promise<void> {
    await firstValueFrom(
      this.http.post<unknown>(`${BASE}/${encodeURIComponent(id)}/unsubscription`, null),
    );
  }

  /** Désinscrit l'adresse donnée par le client — dans le CORPS. */
  async unsubscribeAddress(space: MailSendSpace, address: string): Promise<void> {
    await firstValueFrom(this.http.post<unknown>(`${BASE}/unsubscriptions`, { space, address }));
  }
}
