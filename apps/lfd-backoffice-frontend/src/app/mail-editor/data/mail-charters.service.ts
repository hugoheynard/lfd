import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  MailCharterDraftPayload,
  MailCharterHistoryView,
  MailCharterPreviewPayload,
  MailCharterPreviewView,
  MailCharterPublicationView,
  MailCharterPublishPayload,
  MailCharterView,
  MailSpace,
} from '@lfd/mail-blocks';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

const BASE = `${B2B_API_BASE}/admin/mail-charters`;

/**
 * **La charte d'un espace d'e-mails** (`plan-editeur-par-blocs.md`, § 25 —
 * routes de C1, `packages/mail-blocks/src/mail-charter-routes.ts`).
 *
 * Murées côté serveur par le droit `mail_templates` : lire et prévisualiser
 * demandent `read`, enregistrer et publier demandent `write`.
 */
@Injectable({ providedIn: 'root' })
export class MailChartersService {
  private readonly http = inject(HttpClient);

  /** Rien n'est écrit. `404` : espace inconnu. */
  load(space: MailSpace): Promise<MailCharterView> {
    return firstValueFrom(this.http.get<MailCharterView>(`${BASE}/${space}`));
  }

  /** Versions publiées, de la plus récente à la plus ancienne. */
  history(space: MailSpace): Promise<MailCharterHistoryView> {
    return firstValueFrom(this.http.get<MailCharterHistoryView>(`${BASE}/${space}/history`));
  }

  /** Un e-mail de l'espace sous la charte donnée ; rien n'est écrit, le contraste n'est pas exigé. */
  preview(space: MailSpace, payload: MailCharterPreviewPayload): Promise<MailCharterPreviewView> {
    return firstValueFrom(
      this.http.post<MailCharterPreviewView>(`${BASE}/${space}/previews`, payload),
    );
  }

  /** `400` réglage refusé, `409` quelqu'un a écrit entre-temps. L'écran relit. */
  async saveDraft(space: MailSpace, payload: MailCharterDraftPayload): Promise<void> {
    await firstValueFrom(this.http.put<unknown>(`${BASE}/${space}/draft`, payload));
  }

  /** Publie le brouillon enregistré ; `400` contraste ou logo, `409` révision dépassée. */
  publish(
    space: MailSpace,
    payload: MailCharterPublishPayload,
  ): Promise<MailCharterPublicationView> {
    return firstValueFrom(
      this.http.post<MailCharterPublicationView>(`${BASE}/${space}/publications`, payload),
    );
  }
}
