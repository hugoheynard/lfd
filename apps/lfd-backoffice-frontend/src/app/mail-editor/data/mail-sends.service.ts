import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  MailRecipientSearchCreatedView,
  MailRecipientSearchView,
  MailRecipientView,
  MailSendDetailView,
  MailSendListView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import { mailSendQuery, type MailSendFilters } from '../rules/mail-send-labels';

const BASE = `${B2B_API_BASE}/admin/mail/sends`;

/**
 * **Le suivi des e-mails** (`plan-suivi-des-e-mails.md`, lot T2), muré côté
 * serveur par le droit `mail_sends`.
 *
 * 🔴 Une adresse ne voyage JAMAIS dans une URL : la recherche la pose dans le
 * corps d'un `POST`, et la relecture se fait par l'identifiant rendu. Révéler
 * et chercher sont inscrits au journal ; au-delà de 30 par heure, `409`.
 */
@Injectable({ providedIn: 'root' })
export class MailSendsService {
  private readonly http = inject(HttpClient);

  /** Les problèmes d'abord, l'ordre est celui du serveur. */
  list(filters: MailSendFilters, cursor: string | null = null): Promise<MailSendListView> {
    return firstValueFrom(
      this.http.get<MailSendListView>(BASE, { params: mailSendQuery(filters, cursor) }),
    );
  }

  /** Un envoi, adresse masquée, sans la raison d'un échec. */
  detail(id: string): Promise<MailSendDetailView> {
    return firstValueFrom(this.http.get<MailSendDetailView>(`${BASE}/${encodeURIComponent(id)}`));
  }

  /**
   * Révèle l'adresse (inscrit au journal, vaut 5 minutes), puis la lit.
   * `409` au plafond, `403` sans révélation en cours : relancés tels quels.
   */
  async revealRecipient(id: string): Promise<MailRecipientView> {
    const at = `${BASE}/${encodeURIComponent(id)}`;
    await firstValueFrom(this.http.post<unknown>(`${at}/recipient-reveal`, null));
    return firstValueFrom(this.http.get<MailRecipientView>(`${at}/recipient`));
  }

  /** Cherche les envois d'une adresse (dans le CORPS), puis lit le résultat figé. */
  async searchByRecipient(address: string): Promise<MailRecipientSearchView> {
    const { id } = await firstValueFrom(
      this.http.post<MailRecipientSearchCreatedView>(`${BASE}/searches`, { address }),
    );
    return firstValueFrom(
      this.http.get<MailRecipientSearchView>(`${BASE}/searches/${encodeURIComponent(id)}`),
    );
  }
}
