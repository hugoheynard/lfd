import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MailRecipientView, MailSendDetailView } from '@lfd/contracts';
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
  FoldTimelineComponent,
  type FoldPanelContent,
  type FoldPanelDefaults,
  type FoldTimelineNode,
} from 'fold-ng';

import { MailSendsService } from '../../data/mail-sends.service';
import { MAIL_NATURE_LABELS, mailLabel } from '../../rules/mail-labels';
import {
  MAIL_SEND_STEP_LABELS,
  mailDeliveryKindLabel,
  mailSendBadge,
  mailSendTime,
  mailSendWhen,
} from '../../rules/mail-send-labels';
import { mailSubjectDisplay } from '../../rules/mail-subjects';
import { GestureIntents } from '../../../shared/gesture-intents';

/** L'envoi à ouvrir. */
export interface MailSendPanelData {
  readonly id: string;
}

/**
 * **Le détail d'un envoi** (`le-suivi-des-e-mails.md`, lot T3) : ses étapes
 * datées, le genre du retour, la version du document, les tentatives —
 * l'adresse masquée. « Afficher l'adresse » révèle puis lit (décision 7) :
 * la consultation est inscrite au journal et vaut 5 minutes ; la raison d'un
 * échec n'arrive qu'avec elle. Un refus du serveur (plafond `409`, `403`)
 * s'affiche tel qu'il le dit.
 *
 * Panneau modal à droite : on consulte, la liste reste derrière ; fold y
 * piège le focus et le rend à la ligne à la fermeture.
 */
@Component({
  selector: 'app-mail-send-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
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
    FoldTimelineComponent,
  ],
  templateUrl: './mail-send-panel.html',
  styleUrl: './mail-send-panel.scss',
})
export class MailSendPanel implements FoldPanelContent<MailSendPanelData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md' };

  readonly data = input<MailSendPanelData | undefined>();

  private readonly panel = inject<FoldPanelRef<void>>(FoldPanelRef);
  private readonly api = inject(MailSendsService);
  /** Chaque affichage est une consultation comptée : une clé par ligne, gardée jusqu'au succès. */
  private readonly intents = new GestureIntents();

  protected readonly natureLabels = MAIL_NATURE_LABELS;
  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly send = signal<MailSendDetailView | null>(null);

  protected readonly revealing = signal(false);
  protected readonly revealError = signal<string | null>(null);
  protected readonly revealed = signal<MailRecipientView | null>(null);

  protected readonly title = computed(() => {
    const send = this.send();
    return send === null ? 'Envoi' : mailLabel(send.template).title;
  });
  protected readonly subtitle = computed(() => {
    const send = this.send();
    return send === null ? '' : MAIL_SPACE_LABELS[send.space];
  });
  protected readonly badge = computed(() => {
    const send = this.send();
    return send === null ? null : mailSendBadge(send);
  });
  /** Ses sujets (règle 9 du plan du sujet) : une commande mène à sa fiche. */
  protected readonly subjects = computed(() =>
    (this.send()?.subjects ?? []).map(mailSubjectDisplay),
  );
  protected readonly steps = computed<readonly FoldTimelineNode[]>(() =>
    (this.send()?.steps ?? []).map((step, index) => ({
      key: `${step.step}-${index}`,
      id: null,
      clickable: false,
      label: MAIL_SEND_STEP_LABELS[step.step],
      displayDate: mailSendWhen(step.at),
    })),
  );

  constructor() {
    effect(() => {
      if (this.data() !== undefined) {
        void this.load();
      }
    });
  }

  protected async load(): Promise<void> {
    const opened = this.data();
    if (opened === undefined) {
      return;
    }
    this.state.set('loading');
    try {
      this.send.set(await this.api.detail(opened.id));
      this.state.set('ready');
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'Cet envoi n’a pas pu être lu.'));
      this.state.set('failed');
    }
  }

  protected async reveal(): Promise<void> {
    const send = this.send();
    if (send === null || this.revealing()) {
      return;
    }
    this.revealing.set(true);
    this.revealError.set(null);
    try {
      this.revealed.set(await this.api.revealRecipient(send.id, this.intents.keyFor(send.id)));
      this.intents.done(send.id);
    } catch (error) {
      this.revealError.set(httpErrorMessage(error, 'L’adresse n’a pas pu être affichée.'));
    } finally {
      this.revealing.set(false);
    }
  }

  protected kindOf(kind: string): string {
    return mailDeliveryKindLabel(kind);
  }

  protected until(iso: string): string {
    return mailSendTime(iso);
  }

  protected close(): void {
    this.panel.close();
  }
}
