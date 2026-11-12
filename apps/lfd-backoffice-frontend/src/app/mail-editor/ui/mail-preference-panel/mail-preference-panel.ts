import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { MailPreferenceDetailView, MailPreferenceRecipientView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { MAIL_SPACE_LABELS } from '@lfd/mail-blocks';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { MailPreferencesService } from '../../data/mail-preferences.service';
import {
  MAIL_CONSENT_ORIGIN_LABELS,
  MAIL_CONSENT_PLACE_LABELS,
  MAIL_UNSUBSCRIBE_SOURCE_LABELS,
  mailPreferenceBadge,
  mailPreferenceRecipient,
} from '../../rules/mail-preference-labels';
import { mailSendTime, mailSendWhen } from '../../rules/mail-send-labels';
import { GestureIntents } from '../../../shared/gesture-intents';

/** La ligne à ouvrir. */
export interface MailPreferencePanelData {
  readonly id: string;
}

/** Ce que le panneau rend à la page : `changed` quand la ligne a été désinscrite. */
export type MailPreferencePanelResult = 'changed';

/**
 * **Une ligne des désinscriptions et accords** (plan
 * `la-desinscription-et-l-accord.md`, lot C4) : son état, son origine, ses
 * dates, et la PREUVE de l'accord (version et langue du texte, lieu,
 * référence de l'acte, confirmation) — l'adresse masquée.
 *
 * « Afficher l'adresse » est la révélation du suivi : inscrite au journal,
 * 5 minutes, sous le plafond horaire. « Désinscrire à la demande du client »
 * demande `mail_sends:write` et une confirmation ; il n'existe pas de geste
 * inverse — seul le client se réinscrit.
 */
@Component({
  selector: 'app-mail-preference-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './mail-preference-panel.html',
  styleUrl: './mail-preference-panel.scss',
})
export class MailPreferencePanel implements FoldPanelContent<MailPreferencePanelData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md' };

  readonly data = input<MailPreferencePanelData | undefined>();

  private readonly panel = inject<FoldPanelRef<MailPreferencePanelResult>>(FoldPanelRef);
  private readonly api = inject(MailPreferencesService);
  /** Chaque affichage est une consultation comptée : une clé par ligne, gardée jusqu'au succès. */
  private readonly intents = new GestureIntents();
  private readonly permissions = inject(PermissionsStore);

  protected readonly originLabels = MAIL_CONSENT_ORIGIN_LABELS;
  protected readonly placeLabels = MAIL_CONSENT_PLACE_LABELS;
  protected readonly sourceLabels = MAIL_UNSUBSCRIBE_SOURCE_LABELS;
  protected readonly canWrite = computed(() => this.permissions.can('mail_sends:write'));

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly line = signal<MailPreferenceDetailView | null>(null);

  protected readonly revealing = signal(false);
  protected readonly revealError = signal<string | null>(null);
  protected readonly revealed = signal<MailPreferenceRecipientView | null>(null);

  protected readonly confirming = signal(false);
  protected readonly unsubscribing = signal(false);
  protected readonly unsubscribeError = signal<string | null>(null);
  private changed = false;

  protected readonly subtitle = computed(() => {
    const line = this.line();
    return line === null ? '' : MAIL_SPACE_LABELS[line.space];
  });
  protected readonly badge = computed(() => {
    const line = this.line();
    return line === null ? null : mailPreferenceBadge(line);
  });
  protected readonly recipient = computed(() => {
    const line = this.line();
    return line === null ? '' : mailPreferenceRecipient(line);
  });

  constructor() {
    effect(() => {
      if (this.data() !== undefined) {
        void this.load();
      }
    });
  }

  protected async load(): Promise<void> {
    const opened = this.data();
    if (opened === undefined) return;
    this.state.set('loading');
    try {
      this.line.set(await this.api.detail(opened.id));
      this.state.set('ready');
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'Cette ligne n’a pas pu être lue.'));
      this.state.set('failed');
    }
  }

  protected async reveal(): Promise<void> {
    const line = this.line();
    if (line === null || this.revealing()) return;
    this.revealing.set(true);
    this.revealError.set(null);
    try {
      this.revealed.set(await this.api.revealRecipient(line.id, this.intents.keyFor(line.id)));
      this.intents.done(line.id);
    } catch (error) {
      this.revealError.set(httpErrorMessage(error, 'L’adresse n’a pas pu être affichée.'));
    } finally {
      this.revealing.set(false);
    }
  }

  /** Désinscrit, puis relit la ligne : l'écran montre ce que le serveur a rangé. */
  protected async unsubscribe(): Promise<void> {
    const line = this.line();
    if (line === null || this.unsubscribing()) return;
    this.unsubscribing.set(true);
    this.unsubscribeError.set(null);
    try {
      await this.api.unsubscribe(line.id);
      this.changed = true;
      this.confirming.set(false);
      this.line.set(await this.api.detail(line.id));
    } catch (error) {
      this.unsubscribeError.set(httpErrorMessage(error, 'La désinscription n’a pas abouti.'));
    } finally {
      this.unsubscribing.set(false);
    }
  }

  protected when(iso: string | null): string {
    return iso === null ? '' : mailSendWhen(iso);
  }

  protected until(iso: string): string {
    return mailSendTime(iso);
  }

  protected close(): void {
    this.panel.close(this.changed ? 'changed' : undefined);
  }
}
