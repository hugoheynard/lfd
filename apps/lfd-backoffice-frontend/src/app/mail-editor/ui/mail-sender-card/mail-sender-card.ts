import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  validateMailSenderIdentity,
  type MailSenderField,
  type MailSenderIdentity,
  type MailSenderView,
  type MailSpace,
} from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { GestureIntents } from '../../../shared/gesture-intents';
import { MailSendersService } from '../../data/mail-senders.service';

/** Le formulaire tel qu'à l'écran : l'adresse de réponse vide vaut « aucune ». */
interface SenderForm {
  readonly senderName: string;
  readonly fromAddress: string;
  readonly replyToAddress: string;
}

const EMPTY_FORM: SenderForm = { senderName: '', fromAddress: '', replyToAddress: '' };

function formOf(identity: MailSenderIdentity | null): SenderForm {
  return identity === null
    ? EMPTY_FORM
    : {
        senderName: identity.senderName,
        fromAddress: identity.fromAddress,
        replyToAddress: identity.replyToAddress ?? '',
      };
}

/** L'identité que le formulaire décrit ; une adresse de réponse vide est `null`. */
export function identityOf(form: SenderForm): MailSenderIdentity {
  const replyTo = form.replyToAddress.trim();
  return {
    senderName: form.senderName,
    fromAddress: form.fromAddress.trim(),
    replyToAddress: replyTo === '' ? null : replyTo,
  };
}

/**
 * **L'expéditeur d'un espace** (plan `plan-editeur-par-blocs.md`, § 25, C3) :
 * l'identité sous laquelle partent ses e-mails, ou l'identité par défaut de
 * la configuration quand l'espace n'en a pas. La changer envoie d'abord un
 * essai à l'auteur sous la nouvelle identité ; refusé, rien n'est enregistré.
 * Les refus de forme du paquet sont montrés avant l'envoi, ceux du serveur
 * (domaine non vérifié, essai refusé, révision) tels qu'il les écrit.
 */
@Component({
  selector: 'app-mail-sender-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './mail-sender-card.html',
  styleUrl: './mail-sender-card.scss',
})
export class MailSenderCard {
  private readonly api = inject(MailSendersService);
  private readonly permissions = inject(PermissionsStore);
  /** Une intention par espace : la clé naît au premier clic et suit les réessais. */
  private readonly intents = new GestureIntents();

  readonly space = input.required<MailSpace>();

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly view = signal<MailSenderView | null>(null);
  protected readonly form = signal<SenderForm>(EMPTY_FORM);
  protected readonly saving = signal(false);
  protected readonly gestureError = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly canWrite = computed(() => this.permissions.can('mail_templates:write'));

  protected readonly current = computed(() => {
    const view = this.view();
    if (view === null) return '';
    const identity = view.identity;
    if (identity === null) {
      return `Par défaut : ${view.fallback.fromAddress}`;
    }
    const replyTo = identity.replyToAddress ?? identity.fromAddress;
    return `${identity.senderName} <${identity.fromAddress}> — réponses à ${replyTo}`;
  });

  protected readonly domainsHint = computed(() => {
    const domains = this.view()?.verifiedDomains;
    if (domains === null || domains === undefined) return undefined;
    return domains.length === 0
      ? 'Aucun domaine vérifié chez Resend.'
      : `Domaines vérifiés chez Resend : ${domains.join(', ')}.`;
  });

  protected readonly violations = computed(() =>
    validateMailSenderIdentity(identityOf(this.form())),
  );

  readonly dirty = computed(() => {
    const view = this.view();
    if (view === null) return false;
    const form = this.form();
    const initial = formOf(view.identity);
    return (
      form.senderName !== initial.senderName ||
      form.fromAddress !== initial.fromAddress ||
      form.replyToAddress !== initial.replyToAddress
    );
  });

  protected readonly canSave = computed(
    () => this.canWrite() && this.dirty() && this.violations().length === 0,
  );

  protected readonly confirmMessage = computed(
    () =>
      `Un essai part vers votre adresse sous « ${identityOf(this.form()).fromAddress} ». ` +
      'Si Resend le refuse, rien n’est enregistré ; sinon tous les e-mails de l’espace partent sous cette identité.',
  );

  constructor() {
    effect(() => {
      this.space();
      void this.load();
    });
  }

  async load(): Promise<void> {
    this.status.set('loading');
    try {
      const view = await this.api.load(this.space());
      this.view.set(view);
      this.form.set(formOf(view.identity));
      this.error.set(null);
      this.status.set('ready');
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'L’expéditeur de l’espace n’a pas pu être lu.'));
      this.status.set('failed');
    }
  }

  protected issuesOf(field: MailSenderField): readonly string[] {
    return this.violations()
      .filter((violation) => violation.field === field)
      .map((violation) => violation.message);
  }

  protected setField(field: keyof SenderForm, value: string): void {
    this.form.update((form) => ({ ...form, [field]: value }));
    this.saved.set(false);
  }

  async save(): Promise<void> {
    const view = this.view();
    if (view === null || !this.canSave() || this.saving()) return;
    const space = this.space();
    this.saving.set(true);
    this.gestureError.set(null);
    try {
      await this.api.change(
        space,
        { identity: identityOf(this.form()), expectedRevision: view.revision },
        this.intents.keyFor(space),
      );
      this.intents.done(space);
      await this.load();
      this.saved.set(true);
    } catch (error) {
      this.gestureError.set(httpErrorMessage(error, 'L’expéditeur n’a pas pu être enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }
}
