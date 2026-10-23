import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ContentLocale,
  MailCopyAdminView,
  MailCopyDraftPayload,
  MailCopyPreviewView,
  MailCopyPublishedView,
  MailCopyResetPayload,
  MailCopySource,
  MailSectionOrderDraftPayload,
  MailSectionOrderResetPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

const BASE = `${B2B_API_BASE}/admin/mail-copy`;

/**
 * **Les textes des e-mails** — l'écran, les brouillons, « Publier », l'aperçu
 * et l'essai (`plan-textes-des-e-mails.md`, E2 et E3).
 *
 * Murés côté serveur par `@AdminSurface("b2b_storefront")` : lire et
 * prévisualiser demandent `read` ; écrire, publier et s'envoyer un essai
 * demandent `write`. Les écritures rendent `204` : l'écran relit.
 */
@Injectable({ providedIn: 'root' })
export class MailCopyService {
  private readonly http = inject(HttpClient);

  load(): Promise<MailCopyAdminView> {
    return firstValueFrom(this.http.get<MailCopyAdminView>(BASE));
  }

  /** `400` si une variable manque ou est inconnue, `409` si quelqu'un a écrit entre-temps. */
  async saveDraft(payload: MailCopyDraftPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${BASE}/drafts`, payload));
  }

  /** « Rétablir le texte d'origine », appliqué au prochain « Publier ». */
  async reset(payload: MailCopyResetPayload): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${BASE}/resets`, payload));
  }

  /** L'ordre des sections en brouillon (E4) — `400` ordre invalide, `409` si quelqu'un l'a déplacé entre-temps. */
  async saveSectionOrder(payload: MailSectionOrderDraftPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${BASE}/section-orders`, payload));
  }

  /** « Rétablir l'ordre » : celui du code, appliqué au prochain « Publier ». */
  async resetSectionOrder(payload: MailSectionOrderResetPayload): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${BASE}/section-order-resets`, payload));
  }

  publish(): Promise<MailCopyPublishedView> {
    return firstValueFrom(this.http.post<MailCopyPublishedView>(`${BASE}/publications`, {}));
  }

  preview(
    mail: string,
    locale: ContentLocale,
    source: MailCopySource,
  ): Promise<MailCopyPreviewView> {
    const params = new HttpParams().set('mail', mail).set('locale', locale).set('source', source);
    return firstValueFrom(this.http.get<MailCopyPreviewView>(`${BASE}/previews`, { params }));
  }

  /** À l'adresse de la fiche de l'appelant, et à elle seule — `409` s'il n'en a pas. */
  async sendTrial(mail: string, locale: ContentLocale, source: MailCopySource): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${BASE}/trials`, { mail, locale, source }));
  }
}
