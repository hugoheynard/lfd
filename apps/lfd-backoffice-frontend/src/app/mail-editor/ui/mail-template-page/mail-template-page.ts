import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  validateMailDocumentForPublication,
  type MailAudience,
  type MailDocument,
  type MailEditorView,
  type MailLocale,
} from '@lfd/mail-blocks';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import type { HasPendingChanges } from '../../../pim/catalogue/product-form/pending-changes.guard';
import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { LOCALE_LABELS } from '../../../textes-boutique/rules/copy-text';
import { mailLabel, mailWhoAndWhen } from '../../../textes-emails/rules/mail-labels';
import { MailEditorService } from '../../data/mail-editor.service';
import { MailCanvas } from '../mail-canvas/mail-canvas';
import { MailFaithfulPreview } from '../mail-faithful-preview/mail-faithful-preview';
import { MailTemplateHistory } from '../mail-template-history/mail-template-history';

/** Qui reçoit l'e-mail, dans la confirmation de « Publier ». */
const RECIPIENTS: Readonly<Record<MailAudience, string>> = {
  customer: 'les clients',
  team: 'l’équipe',
  agency: 'l’agence',
};

/** D'où vient le document ouvert, dit à l'équipe. */
const SOURCE_LABELS: Readonly<Record<MailEditorView['source'], string>> = {
  draft: 'Brouillon en cours',
  published: 'Version publiée',
  starting: 'Arrangement d’origine',
};

/**
 * **La page d'un e-mail** (§ 6, S5a) : le canevas (S5b) monté avec le
 * document que l'éditeur ouvre — le brouillon, sinon le publié, sinon le
 * document de départ — et la déclaration du modèle ; la langue au-dessus,
 * parmi celles du modèle ; l'aperçu fidèle à la demande.
 *
 * « Enregistrer le brouillon » (droit `mail_templates:write`) envoie le
 * document avec la révision lue, puis relit : un `409` dit que quelqu'un a
 * écrit entre-temps, et le document à l'écran est gardé.
 *
 * S5c : « Publier » met en service le brouillon ENREGISTRÉ et les phrases en
 * attente de cet e-mail (il attend donc un document enregistré) ; les refus de
 * `validateMailDocumentForPublication` se lisent avant l'appel, ceux du
 * serveur tels qu'il les dit. « Revenir au modèle d'origine » efface le
 * brouillon et retire le publié. Les deux se confirment sur place. Quitter un
 * document modifié se retient une fois (garde de sortie, seconde passe).
 */
@Component({
  selector: 'app-mail-template-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
    MailCanvas,
    MailFaithfulPreview,
    MailTemplateHistory,
  ],
  templateUrl: './mail-template-page.html',
  styleUrl: './mail-template-page.scss',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class MailTemplatePage implements HasPendingChanges {
  /** Le segment de route `:template` (`withComponentInputBinding`). */
  readonly template = input.required<string>();

  private readonly api = inject(MailEditorService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly view = signal<MailEditorView | null>(null);
  /** Le document à l'écran : celui du serveur, puis chaque geste du canevas. */
  readonly document = signal<MailDocument | null>(null);
  readonly locale = signal<MailLocale>('fr');
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly reverting = signal(false);
  /** Le dernier refus du serveur à « Publier » ou « Revenir », tel qu'il l'a dit. */
  protected readonly gestureError = signal<string | null>(null);
  /** Monte après chaque geste qui écrit une version : l'historique se relit. */
  protected readonly historyRefresh = signal(0);
  /** Une sortie a été retenue ; remise à `false` à chaque e-mail relu. */
  protected readonly leaveWarned = linkedSignal(() => {
    this.view();
    return false;
  });

  protected readonly canWrite = computed(() => this.permissions.can('mail_templates:write'));
  protected readonly title = computed(() => mailLabel(this.template()).title);
  protected readonly whoAndWhen = computed(() => mailWhoAndWhen(this.template()));
  protected readonly sourceLabel = computed(() => {
    const view = this.view();
    return view === null ? '' : SOURCE_LABELS[view.source];
  });

  /** Les langues du modèle, et elles seules : un e-mail en français seul n'en montre qu'une. */
  protected readonly localeOptions = computed<readonly FoldViewToggleOption[]>(() =>
    (this.view()?.declaration.locales ?? []).map((locale) => ({
      value: locale,
      label: locale.toUpperCase(),
      ariaLabel: LOCALE_LABELS[locale],
    })),
  );

  /** Le document diffère de celui que le serveur a rendu. */
  readonly dirty = computed(() => {
    const view = this.view();
    return view !== null && this.document() !== view.document;
  });

  /** Ce qui empêcherait la publication du document à l'écran — les règles du paquet, pas une copie. */
  readonly publicationIssues = computed(() => {
    const view = this.view();
    const document = this.document();
    return view === null || document === null
      ? []
      : validateMailDocumentForPublication(document, view.declaration, view.template);
  });

  protected readonly canPublish = computed(
    () =>
      !this.dirty() &&
      this.publicationIssues().length === 0 &&
      !this.publishing() &&
      !this.reverting(),
  );

  /** Ce qui partira, dit avant de confirmer. */
  protected readonly publishMessage = computed(() => {
    const view = this.view();
    const who = view === null ? 'les destinataires' : RECIPIENTS[view.audience];
    return `Dès le prochain envoi, ${who} recevront cet e-mail tel qu’il est enregistré, avec les phrases en attente de cet e-mail.`;
  });

  /** Il y a quelque chose à effacer : un brouillon ou une version publiée. */
  protected readonly canRevert = computed(() => {
    const view = this.view();
    return view !== null && (view.draft !== null || view.published !== null);
  });

  constructor() {
    effect(() => {
      const template = this.template();
      untracked(() => void this.load(template));
    });
  }

  protected async load(template: string = this.template()): Promise<void> {
    this.status.set('loading');
    try {
      this.apply(await this.api.load(template));
      this.status.set('ready');
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'Cet e-mail n’a pas pu être lu.'));
      this.status.set('failed');
    }
  }

  protected setLocale(value: string): void {
    const locale = this.view()?.declaration.locales.find((candidate) => candidate === value);
    if (locale !== undefined) {
      this.locale.set(locale);
    }
  }

  async save(): Promise<void> {
    const view = this.view();
    const document = this.document();
    if (view === null || document === null || !this.canWrite() || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.api.saveDraft(view.template, { document, expectedRevision: view.revision });
      this.apply(await this.api.load(view.template));
      this.notify.success('Brouillon enregistré.');
    } catch (error) {
      this.notify.error(error, 'Le brouillon n’a pas pu être enregistré.');
    } finally {
      this.saving.set(false);
    }
  }

  async publish(): Promise<void> {
    const view = this.view();
    if (view === null || !this.canWrite() || !this.canPublish()) {
      return;
    }
    this.publishing.set(true);
    this.gestureError.set(null);
    try {
      const { publicationVersion } = await this.api.publish(view.template, {
        expectedRevision: view.revision,
      });
      this.apply(await this.api.load(view.template));
      this.historyRefresh.update((n) => n + 1);
      this.notify.success(`Publié — version des textes ${publicationVersion}.`);
    } catch (error) {
      this.gestureError.set(httpErrorMessage(error, 'Cet e-mail n’a pas pu être publié.'));
    } finally {
      this.publishing.set(false);
    }
  }

  async revert(): Promise<void> {
    const view = this.view();
    if (view === null || !this.canWrite() || this.publishing() || this.reverting()) {
      return;
    }
    this.reverting.set(true);
    this.gestureError.set(null);
    try {
      await this.api.revert(view.template, { expectedRevision: view.revision });
      this.apply(await this.api.load(view.template));
      this.historyRefresh.update((n) => n + 1);
      this.notify.success('Cet e-mail repart dans son arrangement d’origine.');
    } catch (error) {
      this.gestureError.set(
        httpErrorMessage(error, 'Cet e-mail n’a pas pu revenir au modèle d’origine.'),
      );
    } finally {
      this.reverting.set(false);
    }
  }

  /** Garde de sortie : un document modifié retient une fois, et le dit ; la seconde sortie passe. */
  canLeave(): boolean {
    if (!this.dirty() || !this.canWrite() || this.leaveWarned()) {
      return true;
    }
    this.leaveWarned.set(true);
    return false;
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() && this.canWrite()) {
      event.preventDefault();
    }
  }

  /** Pose la vue lue ; garde la langue choisie si le modèle la parle encore. */
  private apply(view: MailEditorView): void {
    this.view.set(view);
    this.document.set(view.document);
    this.error.set(null);
    const locales = view.declaration.locales;
    if (!locales.includes(this.locale())) {
      const first = locales[0];
      if (first !== undefined) {
        this.locale.set(first);
      }
    }
  }
}
