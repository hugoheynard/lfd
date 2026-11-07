import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  MailDocumentDraftPayload,
  MailDocumentPreviewPayload,
  MailDocumentPreviewView,
  MailEditorListView,
  MailEditorView,
} from '@lfd/mail-blocks';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

const BASE = `${B2B_API_BASE}/admin/mail-templates`;

/** La clé d'un modèle porte des points (`customer.order-placed`) : un segment encodé. */
function templateUrl(template: string): string {
  return `${BASE}/${encodeURIComponent(template)}`;
}

/**
 * **L'éditeur d'e-mails** — la liste, un e-mail ouvert, son brouillon et
 * l'aperçu fidèle (`plan-editeur-par-blocs.md`, S5a ; contrats de S4c dans
 * `packages/mail-blocks/src/mail-editor-routes.ts`).
 *
 * Murés côté serveur par le droit `mail_templates` : lire et prévisualiser
 * demandent `read`, écrire le brouillon demande `write`.
 */
@Injectable({ providedIn: 'root' })
export class MailEditorService {
  private readonly http = inject(HttpClient);

  list(): Promise<MailEditorListView> {
    return firstValueFrom(this.http.get<MailEditorListView>(BASE));
  }

  load(template: string): Promise<MailEditorView> {
    return firstValueFrom(this.http.get<MailEditorView>(templateUrl(template)));
  }

  /** `400` si le document est refusé, `409` si quelqu'un a écrit entre-temps. L'écran relit. */
  async saveDraft(template: string, payload: MailDocumentDraftPayload): Promise<void> {
    await firstValueFrom(this.http.put<unknown>(`${templateUrl(template)}/draft`, payload));
  }

  /** Le rendu du serveur, à la demande ; rien n'est écrit. */
  preview(template: string, payload: MailDocumentPreviewPayload): Promise<MailDocumentPreviewView> {
    return firstValueFrom(
      this.http.post<MailDocumentPreviewView>(`${templateUrl(template)}/previews`, payload),
    );
  }
}
