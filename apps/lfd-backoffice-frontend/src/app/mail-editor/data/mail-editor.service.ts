import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  MailDocumentBlockPreviewPayload,
  MailDocumentBlockPreviewView,
  MailDocumentCasePreviewPayload,
  MailDocumentDraftPayload,
  MailDocumentHistoryView,
  MailDocumentPreviewView,
  MailDocumentPublicationView,
  MailDocumentPublishPayload,
  MailDocumentRevertPayload,
  MailDocumentSourcedTrialPayload,
  MailEditorListView,
  MailEditorPhrasesView,
  MailEditorView,
  MailPhraseDraftPayload,
  MailPhraseResetPayload,
} from '@lfd/mail-blocks';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import { intentOptions } from '../../shared/gesture-intents';

const BASE = `${B2B_API_BASE}/admin/mail-templates`;

/** La clé d'un modèle porte des points (`customer.order-placed`) : un segment encodé. */
function templateUrl(template: string): string {
  return `${BASE}/${encodeURIComponent(template)}`;
}

/**
 * **L'éditeur d'e-mails** — la liste, un e-mail ouvert, son brouillon et
 * l'aperçu fidèle (`plan-editeur-par-blocs.md`, S5a), les phrases, les cas et
 * l'essai (S4d ; contrats de S4c dans
 * `packages/mail-blocks/src/mail-editor-routes.ts`).
 *
 * Murés côté serveur par le droit `mail_templates` : lire et prévisualiser
 * demandent `read`, écrire le brouillon, publier et revenir au modèle
 * d'origine demandent `write` (S5c).
 */
@Injectable({ providedIn: 'root' })
export class MailEditorService {
  private readonly http = inject(HttpClient);

  list(): Promise<MailEditorListView> {
    return firstValueFrom(this.http.get<MailEditorListView>(BASE));
  }

  /**
   * Publie les phrases en attente de TOUS les
   * e-mails (S5e) — pas les brouillons d'arrangement, qui se publient depuis
   * leur e-mail. `409` : rien n'attend.
   */
  publishAll(): Promise<MailDocumentPublicationView> {
    return firstValueFrom(this.http.post<MailDocumentPublicationView>(`${BASE}/publications`, {}));
  }

  load(template: string): Promise<MailEditorView> {
    return firstValueFrom(this.http.get<MailEditorView>(templateUrl(template)));
  }

  /** `400` si le document est refusé, `409` si quelqu'un a écrit entre-temps. L'écran relit. */
  async saveDraft(template: string, payload: MailDocumentDraftPayload): Promise<void> {
    await firstValueFrom(this.http.put<unknown>(`${templateUrl(template)}/draft`, payload));
  }

  /** Le rendu du serveur, à la demande, pour un cas (S4d) ; rien n'est écrit. `404` cas inconnu. */
  preview(
    template: string,
    payload: MailDocumentCasePreviewPayload,
  ): Promise<MailDocumentPreviewView> {
    return firstValueFrom(
      this.http.post<MailDocumentPreviewView>(`${templateUrl(template)}/previews`, payload),
    );
  }

  /**
   * Le document rendu bloc par bloc, phrases et variables marquées, pour le
   * canevas (S5f) ; rien n'est écrit. `400` document refusé, `404` cas inconnu.
   */
  blockPreviews(
    template: string,
    payload: MailDocumentBlockPreviewPayload,
  ): Promise<MailDocumentBlockPreviewView> {
    return firstValueFrom(
      this.http.post<MailDocumentBlockPreviewView>(
        `${templateUrl(template)}/block-previews`,
        payload,
      ),
    );
  }

  /** Versions publiées, de la plus récente à la plus ancienne (S5c). */
  history(template: string): Promise<MailDocumentHistoryView> {
    return firstValueFrom(
      this.http.get<MailDocumentHistoryView>(`${templateUrl(template)}/history`),
    );
  }

  /**
   * Publie le brouillon enregistré ET les phrases en attente de cet e-mail ;
   * `409` sur une révision dépassée ou s'il n'y a rien à publier.
   */
  publish(
    template: string,
    payload: MailDocumentPublishPayload,
  ): Promise<MailDocumentPublicationView> {
    return firstValueFrom(
      this.http.post<MailDocumentPublicationView>(`${templateUrl(template)}/publications`, payload),
    );
  }

  /** Retire le publié et le brouillon : l'e-mail repart dans son arrangement d'origine. */
  revert(
    template: string,
    payload: MailDocumentRevertPayload,
  ): Promise<MailDocumentPublicationView> {
    return firstValueFrom(
      this.http.post<MailDocumentPublicationView>(`${templateUrl(template)}/reverts`, payload),
    );
  }

  /** Les phrases du modèle, relues après une écriture (S4d). */
  phrases(template: string): Promise<MailEditorPhrasesView> {
    return firstValueFrom(this.http.get<MailEditorPhrasesView>(`${templateUrl(template)}/phrases`));
  }

  /** Le brouillon d'une phrase : `400` texte refusé, `409` écrite entre-temps. */
  async savePhraseDraft(template: string, payload: MailPhraseDraftPayload): Promise<void> {
    await firstValueFrom(
      this.http.put<unknown>(`${templateUrl(template)}/phrases/drafts`, payload),
    );
  }

  /** Rétablit le texte du code au prochain « Publier » ; `409` sur une révision dépassée. */
  async resetPhrase(template: string, payload: MailPhraseResetPayload): Promise<void> {
    await firstValueFrom(
      this.http.post<unknown>(`${templateUrl(template)}/phrases/resets`, payload),
    );
  }

  /**
   * « M'envoyer un essai » : à la seule adresse de l'appelant. La clé
   * d'intention est celle de l'écran, renvoyée à chaque clic tant que le geste
   * n'a pas abouti — un double clic n'envoie pas deux e-mails. `source`
   * choisit les phrases : brouillons (défaut) ou publiées (S5e).
   */
  async sendTrial(
    template: string,
    payload: MailDocumentSourcedTrialPayload,
    intentKey: string,
  ): Promise<void> {
    await firstValueFrom(
      this.http.post<unknown>(`${templateUrl(template)}/trials`, payload, intentOptions(intentKey)),
    );
  }
}
