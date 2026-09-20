import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PhotoCardForm, PhotoCardFormSlot, PhotoCardsEditor } from '@lfd/b2b-ui/photo-cards';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminClientNotesGateway } from './admin-client-notes.gateway';
import {
  CLIENT_NOTE_FORM_LABELS,
  CLIENT_NOTE_LIMITS,
  CLIENT_NOTE_PHOTO_POLICY,
  CLIENT_NOTES_EDITOR_LABELS,
  CLIENT_NOTES_PHOTO_DISPLAY,
} from './client-notes.usage';

/**
 * L'onglet **Notes** d'un compte client : les photos des notes papier du
 * commercial, leur titre et leur description, classées à la main — la nouvelle
 * en tête.
 *
 * Il héberge l'éditeur du socle photo-cartes **tel quel**, liste et formulaire
 * dans la même carte, sans panneau intermédiaire (plan « notes photo du
 * commercial », D10). Qui lit sans écrire reçoit la même liste sans geste.
 *
 * Le front CACHE, le serveur REFUSE : la route est gardée par
 * `b2b_client_notes:read`, et l'écriture par la surface staff du backend.
 */
@Component({
  selector: 'app-client-notes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhotoCardsEditor, PhotoCardFormSlot, PhotoCardForm],
  templateUrl: './notes-page.html',
})
export class ClientNotesPage {
  /** L'identifiant de la société, hérité du segment de la coquille. */
  readonly id = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly permissions = inject(PermissionsStore);

  /** Une société neuve rend une passerelle neuve, et c'est ce qui fait recharger l'éditeur. */
  protected readonly gateway = computed(() => new AdminClientNotesGateway(this.http, this.id()));
  protected readonly canEdit = computed(() => this.permissions.can('b2b_client_notes:write'));

  protected readonly labels = CLIENT_NOTES_EDITOR_LABELS;
  protected readonly formLabels = CLIENT_NOTE_FORM_LABELS;
  protected readonly limits = CLIENT_NOTE_LIMITS;
  protected readonly photoPolicy = CLIENT_NOTE_PHOTO_POLICY;
  protected readonly photoDisplay = CLIENT_NOTES_PHOTO_DISPLAY;
}
