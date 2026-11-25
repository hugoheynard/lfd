import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  EVENT_FUNCTION_SHEET_FIELD,
  type CreateEventPayload,
  type EventCreated,
  type EventDetailView,
  type EventSummaryView,
  type FunctionSheetUploaded,
  type ReviseEventPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

const EVENTS_BASE = `${B2B_API_BASE}/admin/events`;

function eventPath(eventId: string): string {
  return `${EVENTS_BASE}/${encodeURIComponent(eventId)}`;
}

function sheetPath(eventId: string, sheetId: string): string {
  return `${eventPath(eventId)}/function-sheets/${encodeURIComponent(sheetId)}`;
}

/**
 * **Les événements et leurs fiches de fonction** — les routes `/admin/events`
 * (`documentation/evenements/plan-evenements.md`, E1–E2), sous la ressource
 * `events`.
 */
@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly http = inject(HttpClient);

  /** La table : à venir du plus proche, puis les passés du plus récent. */
  async list(): Promise<readonly EventSummaryView[]> {
    return firstValueFrom(this.http.get<readonly EventSummaryView[]>(EVENTS_BASE));
  }

  /** « Créer un événement » — sous la clé du geste : un double clic n'en crée qu'un. */
  async create(payload: CreateEventPayload, intentKey: string): Promise<EventCreated> {
    return firstValueFrom(
      this.http.post<EventCreated>(EVENTS_BASE, payload, intentOptions(intentKey)),
    );
  }

  async detail(eventId: string): Promise<EventDetailView> {
    return firstValueFrom(this.http.get<EventDetailView>(eventPath(eventId)));
  }

  async revise(eventId: string, payload: ReviseEventPayload): Promise<void> {
    await firstValueFrom(this.http.patch<void>(eventPath(eventId), payload));
  }

  /** Déposer UNE fiche en PDF — sous la clé du dépôt. */
  async depositSheet(
    eventId: string,
    file: File,
    intentKey: string,
  ): Promise<FunctionSheetUploaded> {
    const form = new FormData();
    form.append(EVENT_FUNCTION_SHEET_FIELD, file, file.name);
    return firstValueFrom(
      this.http.post<FunctionSheetUploaded>(
        `${eventPath(eventId)}/function-sheets`,
        form,
        intentOptions(intentKey),
      ),
    );
  }

  /**
   * Remplacer une fiche par une version plus récente : l'ancienne est archivée,
   * la nouvelle prend son rang. Sous la clé du remplacement.
   */
  async replaceSheet(
    eventId: string,
    sheetId: string,
    file: File,
    intentKey: string,
  ): Promise<FunctionSheetUploaded> {
    const form = new FormData();
    form.append(EVENT_FUNCTION_SHEET_FIELD, file, file.name);
    return firstValueFrom(
      this.http.post<FunctionSheetUploaded>(
        `${sheetPath(eventId, sheetId)}/replacement`,
        form,
        intentOptions(intentKey),
      ),
    );
  }

  /** Archive l'événement : il sort de la table, ses fiches ne bougent plus. */
  async archive(eventId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(eventPath(eventId)));
  }

  /** La fiche, servie en pièce jointe : lue en blob, le jeton part avec la requête. */
  async sheetFile(eventId: string, sheetId: string): Promise<Blob> {
    return firstValueFrom(this.http.get(sheetPath(eventId, sheetId), { responseType: 'blob' }));
  }

  /** Retire la fiche — elle est archivée, pas effacée. */
  async archiveSheet(eventId: string, sheetId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(sheetPath(eventId, sheetId)));
  }
}
