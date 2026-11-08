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
  isMailSpace,
  MAIL_SPACE_LABELS,
  validateMailCharterForPublication,
  type MailCharterFont,
  type MailCharterSettings,
  type MailCharterShopFonts,
  type MailCharterView,
  type MailCharterViolation,
  type MailLocale,
} from '@lfd/mail-blocks';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldTextareaComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import {
  LibraryPicker,
  type LibraryPickerData,
  type PickedMedia,
} from '../../../pim/catalogue/library-picker/library-picker';
import type { HasPendingChanges } from '../../../pim/catalogue/product-form/pending-changes.guard';
import { LOCALE_LABELS } from '../../../textes-boutique/rules/copy-text';
import { MailChartersService } from '../../data/mail-charters.service';
import {
  colorOf,
  contrastReport,
  DARK_COLOR_FIELDS,
  LIGHT_COLOR_FIELDS,
  ratioLabel,
  violationsByField,
  withColor,
  withFooter,
  withFont,
  withLogoAlt,
  withLogoSource,
  withOriginalLogo,
  withShopFonts,
  type CharterColorField,
  type CharterFontSlot,
} from '../../rules/mail-charter-edits';
import { MailCharterColorField } from '../mail-charter-color-field/mail-charter-color-field';
import { MailCharterFontCard } from '../mail-charter-font-card/mail-charter-font-card';
import { MailCharterHistory } from '../mail-charter-history/mail-charter-history';
import { MailCharterPreview } from '../mail-charter-preview/mail-charter-preview';
import { MailSpaceTabs } from '../mail-space-tabs/mail-space-tabs';

const SOURCE_LABELS: Readonly<Record<MailCharterView['source'], string>> = {
  draft: 'Brouillon en cours',
  published: 'Version publiée',
  starting: 'Charte de départ — celle des e-mails d’aujourd’hui',
};

const NO_VIOLATIONS: readonly MailCharterViolation[] = [];

/**
 * **La charte d'un espace d'e-mails** (`plan-editeur-par-blocs.md`, § 25,
 * C2) : logo, couleurs claires et sombres, polices des titres et du texte, pied de page
 * par langue. Les refus de `validateMailCharterForPublication` sont montrés
 * sous chaque réglage AVANT de publier — contraste compris, avec le rapport
 * calculé ; l'aperçu rend un e-mail de l'espace avec la charte à l'écran.
 *
 * Enregistrer écrit le brouillon ; « Publier » met en service le brouillon
 * ENREGISTRÉ pour tous les e-mails de l'espace, au prochain envoi. Quitter
 * une charte modifiée se retient une fois — un changement d'onglet de
 * l'espace aussi : c'est l'onglet « Charte » (`/emails/espaces/:space/charte`),
 * une route à part (retouche du 2026-11-07).
 */
@Component({
  selector: 'app-mail-charter-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldTextareaComponent,
    FoldViewToggleComponent,
    MailCharterColorField,
    MailCharterFontCard,
    MailCharterHistory,
    MailCharterPreview,
    MailSpaceTabs,
  ],
  templateUrl: './mail-charter-page.html',
  styleUrl: './mail-charter-page.scss',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class MailCharterPage implements HasPendingChanges {
  /** Le segment de route `:space` (`withComponentInputBinding`). */
  readonly space = input.required<string>();

  private readonly api = inject(MailChartersService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly view = signal<MailCharterView | null>(null);
  /** La charte à l'écran ; relue à chaque vue du serveur. */
  readonly settings = linkedSignal<MailCharterSettings | null>(() => this.view()?.settings ?? null);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly gestureError = signal<string | null>(null);
  protected readonly historyRefresh = signal(0);
  protected readonly leaveWarned = linkedSignal(() => {
    this.view();
    return false;
  });

  protected readonly lightFields = LIGHT_COLOR_FIELDS;
  protected readonly darkFields = DARK_COLOR_FIELDS;
  protected readonly canWrite = computed(() => this.permissions.can('mail_templates:write'));
  /** L'espace, s'il en est un : les onglets ne se montrent que sous un espace connu. */
  protected readonly known = computed(() => {
    const space = this.space();
    return isMailSpace(space) ? space : null;
  });
  protected readonly spaceTitle = computed(() => {
    const space = this.space();
    return isMailSpace(space) ? MAIL_SPACE_LABELS[space] : space;
  });

  protected readonly locales = computed<readonly MailLocale[]>(() => this.view()?.locales ?? []);
  readonly locale = linkedSignal<MailLocale>(() => this.locales()[0] ?? 'fr');
  protected readonly localeOptions = computed(() =>
    this.locales().map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] })),
  );
  protected readonly localeName = computed(() => LOCALE_LABELS[this.locale()]);
  protected readonly sourceLabel = computed(() => {
    const view = this.view();
    return view === null ? '' : SOURCE_LABELS[view.source];
  });

  readonly dirty = computed(() => {
    const view = this.view();
    return view !== null && this.settings() !== view.settings;
  });

  /** Les refus de la publication, sur la charte À L'ÉCRAN : on les voit avant d'enregistrer. */
  readonly violations = computed(() => {
    const settings = this.settings();
    return settings === null
      ? NO_VIOLATIONS
      : validateMailCharterForPublication(settings, this.locales());
  });
  private readonly byField = computed(() => violationsByField(this.violations()));
  protected readonly contrast = computed(() => {
    const settings = this.settings();
    return settings === null ? [] : contrastReport(settings);
  });

  /** Publier met en service le brouillon enregistré : il faut qu'il y en ait un, intact et sans refus. */
  readonly canPublish = computed(() => {
    const view = this.view();
    return view !== null && view.draft !== null && !this.dirty() && this.violations().length === 0;
  });

  /** Ce que la publication touche, dit avant de confirmer : tout l'espace, et combien. */
  readonly publishMessage = computed(() => {
    const count = this.view()?.templates.length ?? 0;
    const mails = count === 1 ? '1 e-mail' : `${count} e-mails`;
    return `Dès le prochain envoi, tous les e-mails de l’espace « ${this.spaceTitle()} » (${mails}) partiront avec cette charte.`;
  });

  constructor() {
    // Le segment de route n'est lisible qu'après la création : on relit quand il change.
    effect(() => {
      this.space();
      untracked(() => void this.load());
    });
  }

  protected issuesOf(field: string): readonly MailCharterViolation[] {
    return this.byField().get(field) ?? NO_VIOLATIONS;
  }

  protected colorValue(field: CharterColorField): string {
    const settings = this.settings();
    return settings === null ? '' : colorOf(settings, field.slot);
  }

  protected ratio(value: number): string {
    return ratioLabel(value);
  }

  async load(): Promise<void> {
    const space = this.space();
    if (!isMailSpace(space)) {
      this.view.set(null);
      this.error.set(`« ${space} » n’est pas un espace d’e-mails.`);
      this.status.set('failed');
      return;
    }
    if (this.view() === null) {
      this.status.set('loading');
    }
    try {
      this.view.set(await this.api.load(space));
      this.error.set(null);
      this.status.set('ready');
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'La charte n’a pas pu être lue.'));
      this.status.set('failed');
    }
  }

  private edit(change: (settings: MailCharterSettings) => MailCharterSettings): void {
    const settings = this.settings();
    if (settings !== null && this.canWrite()) {
      this.settings.set(change(settings));
    }
  }

  protected setColor(field: CharterColorField, value: string): void {
    this.edit((settings) => withColor(settings, field.slot, value));
  }

  protected setLocale(value: string): void {
    const locale = this.locales().find((candidate) => candidate === value);
    if (locale !== undefined) {
      this.locale.set(locale);
    }
  }

  /** Le sélecteur de la médiathèque, en choix unique — celui du bloc image ; renoncer ne change rien. */
  protected pickLogo(): void {
    void this.panels
      .open<LibraryPickerData, readonly PickedMedia[]>(LibraryPicker, {
        data: { already: [], single: true },
      })
      .closed.then((picked) => {
        const chosen = picked?.[0];
        if (chosen !== undefined) {
          this.edit((settings) => withLogoSource(settings, chosen.url));
        }
      });
  }

  protected useOriginalLogo(): void {
    this.edit(withOriginalLogo);
  }

  protected setLogoAlt(alt: string): void {
    this.edit((settings) => withLogoAlt(settings, this.locale(), alt));
  }

  protected setFooter(footer: string): void {
    this.edit((settings) => withFooter(settings, this.locale(), footer));
  }

  protected setFont(slot: CharterFontSlot, font: MailCharterFont | null): void {
    this.edit((settings) => withFont(settings, slot, font));
  }

  /** Chunk pour les titres, Pogonia pour le texte : dans le brouillon à l'écran, rien n'est publié. */
  useShopFonts(fonts: MailCharterShopFonts): void {
    this.edit((settings) => withShopFonts(settings, fonts));
  }

  async save(): Promise<void> {
    const view = this.view();
    const settings = this.settings();
    if (view === null || settings === null || !this.canWrite() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.gestureError.set(null);
    try {
      await this.api.saveDraft(view.space, { settings, expectedRevision: view.revision });
      this.view.set(await this.api.load(view.space));
      this.notify.success('Brouillon de la charte enregistré.');
    } catch (error) {
      this.gestureError.set(httpErrorMessage(error, 'La charte n’a pas pu être enregistrée.'));
    } finally {
      this.saving.set(false);
    }
  }

  async publish(): Promise<void> {
    const view = this.view();
    if (view === null || !this.canWrite() || !this.canPublish() || this.publishing()) {
      return;
    }
    this.publishing.set(true);
    this.gestureError.set(null);
    try {
      const { version } = await this.api.publish(view.space, { expectedRevision: view.revision });
      this.view.set(await this.api.load(view.space));
      this.historyRefresh.update((n) => n + 1);
      this.notify.success(`Charte publiée — version ${version}.`);
    } catch (error) {
      this.gestureError.set(httpErrorMessage(error, 'La charte n’a pas pu être publiée.'));
    } finally {
      this.publishing.set(false);
    }
  }

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
}
