import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import type {
  ClientNotebookOrderPayload,
  ClientNotebookView,
  ClientNoteView,
  CreatedClientNoteResponse,
} from '@lfd/contracts';
import {
  PhotoCardsConflictError,
  PhotoCardsGateway,
  PhotoCardsWriteError,
  type PhotoCardFields,
  type PhotoCardPhotoChange,
} from '@lfd/b2b-ui/photo-cards';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom, type Observable } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/** Le statut d'un carnet qui a changé sous l'écran. */
const CONFLICT = 409;

/**
 * Le refus posé AVANT l'envoi d'une photo sans vignette. Le serveur refuse la
 * paire incomplète ; l'écran ne l'envoie pas, puisque la politique de photo des
 * notes fabrique toujours les deux.
 */
const MISSING_THUMBNAIL =
  'La vignette de la photo n’a pas été fabriquée. Choisissez la photo à nouveau.';

/**
 * Le **carnet de notes** d'un client, vu du staff :
 * `/admin/companies/:companyId/notes`. La société est liée à l'instance ;
 * l'éditeur photo-cartes ne parle que de notes.
 *
 * Staff seulement : aucune route client ne sert ces notes, et la lecture exige
 * `b2b_client_notes:read` (plan « notes photo du commercial », D5).
 *
 * La photo part toujours **avec sa vignette**, et la liste ne lit qu'elles : la
 * photo lisible n'est demandée qu'à l'ouverture en grand (D7 bis).
 */
export class AdminClientNotesGateway extends PhotoCardsGateway<ClientNoteView> {
  constructor(
    private readonly http: HttpClient,
    private readonly companyId: string,
  ) {
    super();
  }

  async load(): Promise<readonly ClientNoteView[]> {
    return (await this.send(this.http.get<ClientNotebookView>(this.notesUrl()))).notes;
  }

  async add(fields: PhotoCardFields, photo: Blob | null, thumbnail?: Blob): Promise<string> {
    const body = noteForm(fields, photo, thumbnail);
    const created = await this.send(
      this.http.post<CreatedClientNoteResponse>(this.notesUrl(), body),
    );
    return created.id;
  }

  async revise(
    noteId: string,
    fields: PhotoCardFields,
    change: PhotoCardPhotoChange,
  ): Promise<void> {
    const body =
      change.kind === 'replace'
        ? noteForm(fields, change.photo, change.thumbnail)
        : noteForm(fields, null, undefined);
    body.append('removePhoto', change.kind === 'remove' ? 'true' : 'false');
    await this.send(this.http.patch<void>(this.noteUrl(noteId), body));
  }

  async remove(noteId: string): Promise<void> {
    await this.send(this.http.delete<void>(this.noteUrl(noteId)));
  }

  async reorder(noteIds: readonly string[]): Promise<void> {
    const payload: ClientNotebookOrderPayload = { noteIds: [...noteIds] };
    await this.send(this.http.put<void>(`${this.notesUrl()}/order`, payload));
  }

  photo(noteId: string, revision: string): Promise<Blob> {
    return this.bytes(`${this.noteUrl(noteId)}/photo`, revision);
  }

  override thumbnail(noteId: string, revision: string): Promise<Blob> {
    return this.bytes(`${this.noteUrl(noteId)}/thumbnail`, revision);
  }

  private bytes(url: string, revision: string): Promise<Blob> {
    // `rev` dans l'URL, comme les photos d'étapes : c'est la révision qui fait
    // d'une photo remplacée une autre ressource pour le cache.
    return this.send(this.http.get(url, { params: { rev: revision }, responseType: 'blob' }));
  }

  private notesUrl(): string {
    return `${B2B_API_BASE}/admin/companies/${this.companyId}/notes`;
  }

  private noteUrl(noteId: string): string {
    return `${this.notesUrl()}/${noteId}`;
  }

  /** Traduit un échec HTTP dans les deux erreurs que le port déclare. */
  private async send<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      const message = httpErrorMessage(error);
      throw isStatus(error, CONFLICT)
        ? new PhotoCardsConflictError(message)
        : new PhotoCardsWriteError(message);
    }
  }
}

/**
 * Les champs d'une note en multipart ; la photo sous `photo`, sa vignette sous
 * `thumbnail` — les deux, ou aucune.
 */
function noteForm(
  fields: PhotoCardFields,
  photo: Blob | null,
  thumbnail: Blob | undefined,
): FormData {
  if (photo !== null && thumbnail === undefined) {
    throw new PhotoCardsWriteError(MISSING_THUMBNAIL);
  }
  const body = new FormData();
  body.append('title', fields.title);
  body.append('body', fields.body);
  if (photo !== null && thumbnail !== undefined) {
    body.append('photo', photo, 'note.jpg');
    body.append('thumbnail', thumbnail, 'vignette.jpg');
  }
  return body;
}

function isStatus(error: unknown, status: number): error is HttpErrorResponse {
  return (
    typeof error === 'object' && error !== null && 'status' in error && error.status === status
  );
}
