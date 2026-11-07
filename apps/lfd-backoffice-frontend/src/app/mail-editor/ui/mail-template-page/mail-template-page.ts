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
  isEditablePhrase,
  MAIL_LOCALES,
  validateMailDocumentForPublication,
  MAIL_SPACE_LABELS,
  mailSpaceOfCharter,
  type MailAudience,
  type MailDocument,
  type MailDocumentBlockPreviewPayload,
  type MailEditorPhrasePlace,
  type MailEditorPhraseView,
  type MailEditorView,
  type MailLocale,
} from '@lfd/mail-blocks';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldDisclosureComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import type { HasPendingChanges } from '../../../pim/catalogue/product-form/pending-changes.guard';
import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { LOCALE_LABELS } from '../../../textes-boutique/rules/copy-text';
import { mailLabel, mailWhoAndWhen } from '../../../textes-emails/rules/mail-labels';
import { GestureIntents } from '../../../shared/gesture-intents';
import { MailEditorService } from '../../data/mail-editor.service';
import {
  phraseHeading,
  phrasesAt,
  placeTitle,
  unplacedPhrases,
} from '../../rules/mail-phrase-places';
import { EMPTY_MAIL_RESOURCES } from '../../rules/mail-resources';
import {
  BLOCK_PREVIEW_DEBOUNCE_MS,
  MailBlockPreviewsStore,
} from '../../state/mail-block-previews-store';
import { MailPhrasesStore } from '../../state/mail-phrases-store';
import { MailCanvas } from '../mail-canvas/mail-canvas';
import {
  MailFaithfulPreview,
  type MailPhraseSource,
} from '../mail-faithful-preview/mail-faithful-preview';
import { MailPhraseEditor } from '../mail-phrase-editor/mail-phrase-editor';
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

/** Les phrases que l'aperçu et l'essai rendent. */
const PHRASE_SOURCE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'draft', label: 'Brouillons' },
  { value: 'published', label: 'Publiées' },
];

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
 * brouillon et retire le publié. Les deux se confirment sur place.
 *
 * S5b (phrases, cas) et essai : les phrases du modèle s'écrivent en brouillon
 * dans la langue choisie (`MailPhrasesStore`) ; le cas choisi change l'aperçu
 * fidèle ; « M'envoyer un essai » part à l'auteur seul, avec une clé
 * d'intention gardée jusqu'à l'envoi. Quitter un
 * document modifié se retient une fois (garde de sortie, seconde passe).
 *
 * S5e : sélectionner un bloc du modèle ou un cadre (objet, en-tête) dans le
 * canevas montre SES phrases dans la colonne de droite, nommées par leur
 * variante ; les phrases hors carte et celles que le code ne connaît plus
 * ont leur section sous le canevas. Les signaux de l'écran des textes
 * (traduction en retard, texte d'origine changé) sont repris. L'aperçu et
 * l'essai rendent les phrases en brouillon ou publiées, au choix.
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
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldIconComponent,
    FoldDisclosureComponent,
    FoldInlineConfirmComponent,
    FoldPageSectionComponent,
    MailCanvas,
    MailFaithfulPreview,
    MailPhraseEditor,
    MailTemplateHistory,
  ],
  templateUrl: './mail-template-page.html',
  styleUrl: './mail-template-page.scss',
  providers: [MailPhrasesStore, MailBlockPreviewsStore],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class MailTemplatePage implements HasPendingChanges {
  /** Le segment de route `:template` (`withComponentInputBinding`). */
  readonly template = input.required<string>();

  private readonly api = inject(MailEditorService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);
  protected readonly phrases = inject(MailPhrasesStore);
  private readonly previews = inject(MailBlockPreviewsStore);
  /** Le document du dernier rendu demandé : un geste sur lui attend la pause, le reste non. */
  private renderedDocument: MailDocument | null = null;
  /** Une clé par essai voulu (e-mail, langue, cas), renvoyée à chaque clic jusqu'à l'envoi. */
  private readonly intents = new GestureIntents();

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  /** Le retour mène à l'espace de l'e-mail (§ 25, C2) ; tant qu'il n'est pas lu, à la liste. */
  protected readonly back = computed(() => {
    const view = this.view();
    if (view === null) {
      return { label: 'Les e-mails', link: ['/emails'] };
    }
    const space = mailSpaceOfCharter(view.declaration.charter);
    return { label: MAIL_SPACE_LABELS[space], link: ['/emails', 'espaces', space] };
  });
  protected readonly error = signal<string | null>(null);
  protected readonly view = signal<MailEditorView | null>(null);
  /** Le document à l'écran : celui du serveur, puis chaque geste du canevas. */
  readonly document = signal<MailDocument | null>(null);
  readonly locale = signal<MailLocale>('fr');
  /**
   * La langue des PHRASES (plan § 21, tranché le 2026-11-07) : toutes les
   * langues, même celles où l'e-mail ne part pas encore — on les prépare,
   * comme l'écran des textes. Suit la langue du document tant qu'on ne la
   * change pas ; les blocs libres, eux, restent dans `declaration.locales`.
   */
  readonly phraseLocale = linkedSignal<MailLocale>(() => this.locale());
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly reverting = signal(false);
  protected readonly sendingTrial = signal(false);
  /** Le cas affiché (`MailEditorView.cases`) : l'aperçu fidèle et l'essai le rendent. */
  readonly caseId = signal<string | null>(null);
  /** Le bloc du modèle ou le cadre dont la colonne de droite montre les phrases. */
  readonly focus = signal<MailEditorPhrasePlace | null>(null);
  /** Les phrases que l'aperçu fidèle et l'essai rendent (S5e). */
  readonly phraseSource = signal<MailPhraseSource>('draft');
  protected readonly phraseSourceOptions = PHRASE_SOURCE_OPTIONS;
  /** Un e-mail servi sans ressources (le contrat les laisse facultatives) : rien à poser. */
  protected readonly noResources = EMPTY_MAIL_RESOURCES;
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

  /** Toutes les langues : une phrase se prépare même dans une langue où l'e-mail ne part pas. */
  protected readonly phraseLocaleOptions: readonly FoldViewToggleOption[] = MAIL_LOCALES.map(
    (locale) => ({ value: locale, label: locale.toUpperCase(), ariaLabel: LOCALE_LABELS[locale] }),
  );

  /** Le modèle ne part pas dans toutes les langues : le choix des phrases s'ouvre. */
  protected readonly phraseLocalesOpen = computed(() => {
    const locales = this.view()?.declaration.locales ?? [];
    return MAIL_LOCALES.some((locale) => !locales.includes(locale));
  });

  /** Dit, sans rien promettre de plus, que la langue choisie se prépare sans partir. */
  protected readonly phraseLocaleNote = computed(() => {
    const locales = this.view()?.declaration.locales ?? [];
    const chosen = this.phraseLocale();
    if (locales.includes(chosen)) {
      return null;
    }
    const sent = locales.map((locale) => LOCALE_LABELS[locale].toLowerCase()).join(', ');
    return `Cet e-mail part aujourd’hui en ${sent} seulement : les phrases en ${LOCALE_LABELS[chosen].toLowerCase()} se préparent, aucun client ne les reçoit.`;
  });

  /** Les cas du modèle, dans l'ordre du serveur — le premier est l'exemple de l'e-mail. */
  protected readonly caseOptions = computed(() =>
    (this.view()?.cases ?? []).map((example) => ({ value: example.id, label: example.label })),
  );

  /** Ce qui part à l'essai, et à qui : dit avant de confirmer — la source des phrases comprise. */
  protected readonly trialMessage = computed(() => {
    const example = this.view()?.cases.find((candidate) => candidate.id === this.caseId());
    const which = example === undefined ? 'l’exemple de l’e-mail' : `le cas « ${example.label} »`;
    const phrases =
      this.phraseSource() === 'draft'
        ? 'les phrases en brouillon'
        : 'les phrases publiées (celles qui partent aujourd’hui)';
    return `Un essai part à votre seule adresse, en ${LOCALE_LABELS[this.locale()].toLowerCase()}, avec ${which} : l’arrangement enregistré (sinon publié, sinon d’origine) et ${phrases}. Rien n’est publié, aucun client ne le reçoit.`;
  });

  /** Les phrases de la place sélectionnée, dans l'ordre du serveur. */
  protected readonly focusedPhrases = computed(() => {
    const place = this.focus();
    return place === null ? [] : phrasesAt(this.editablePhrases(), place);
  });
  protected readonly focusTitle = computed(() => {
    const place = this.focus();
    return place === null ? '' : placeTitle(place);
  });

  /** Les phrases qu'aucun cadre ni bloc à l'écran ne montre. */
  protected readonly unplaced = computed(() => {
    const document = this.document();
    return document === null ? [] : unplacedPhrases(this.editablePhrases(), document);
  });

  /**
   * Les phrases que l'éditeur laisse écrire : celles de
   * `declaration.editablePhrases` quand le modèle la déclare (§ 23), toutes
   * sinon. Les libellés des blocs système n'apparaissent ni au panneau ni
   * dans « Autres textes ».
   */
  private readonly editablePhrases = computed(() => {
    const declaration = this.view()?.declaration;
    const all = this.phrases.phrases();
    return declaration === undefined
      ? all
      : all.filter((phrase) => isEditablePhrase(declaration, phrase.path));
  });

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
    // Le canevas (S5f) : le document, la langue, le cas, et chaque phrase
    // écrite en brouillon redemandent le rendu — un geste sur le document
    // après une pause, le reste tout de suite.
    effect(() => {
      const payload = this.renderPayload();
      this.phrases.written();
      const view = this.view();
      if (payload === null || view === null) {
        return;
      }
      untracked(() => {
        const delay =
          this.renderedDocument === null || this.renderedDocument === payload.document
            ? 0
            : BLOCK_PREVIEW_DEBOUNCE_MS;
        this.renderedDocument = payload.document;
        this.previews.request(view.template, payload, delay);
      });
    });
  }

  /** Ce que le canevas rend : le document à l'écran, sur les phrases en brouillon. */
  private readonly renderPayload = computed<MailDocumentBlockPreviewPayload | null>(() => {
    const document = this.document();
    if (document === null) {
      return null;
    }
    const caseId = this.caseId();
    return {
      document,
      locale: this.locale(),
      source: 'draft',
      ...(caseId === null ? {} : { caseId }),
    };
  });

  /** « Réessayer » du canevas : le rendu, sans attendre. */
  protected renderNow(): void {
    const view = this.view();
    const payload = this.renderPayload();
    if (view !== null && payload !== null) {
      void this.previews.render(view.template, payload);
    }
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

  protected heading(phrase: MailEditorPhraseView, siblings: number): string | null {
    return phraseHeading(phrase, siblings);
  }

  protected setPhraseSource(value: string): void {
    this.phraseSource.set(value === 'published' ? 'published' : 'draft');
  }

  protected setLocale(value: string): void {
    const locale = this.view()?.declaration.locales.find((candidate) => candidate === value);
    if (locale !== undefined) {
      this.locale.set(locale);
    }
  }

  protected setPhraseLocale(value: string): void {
    const locale = MAIL_LOCALES.find((candidate) => candidate === value);
    if (locale !== undefined) {
      this.phraseLocale.set(locale);
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
      await this.phrases.flush();
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

  /** « M'envoyer un essai » : la langue et le cas courants, à l'auteur seul. */
  async sendTrial(): Promise<void> {
    const view = this.view();
    if (view === null || !this.canWrite() || this.sendingTrial()) {
      return;
    }
    const caseId = this.caseId();
    const locale = this.locale();
    const source = this.phraseSource();
    const subject = `${view.template}\u0000${locale}\u0000${caseId ?? ''}\u0000${source}`;
    this.sendingTrial.set(true);
    this.gestureError.set(null);
    try {
      await this.phrases.flush();
      await this.api.sendTrial(
        view.template,
        { locale, source, ...(caseId === null ? {} : { caseId }) },
        this.intents.keyFor(subject),
      );
      this.intents.done(subject);
      this.notify.success('Essai envoyé à votre adresse.');
    } catch (error) {
      this.gestureError.set(httpErrorMessage(error, 'L’essai n’a pas pu être envoyé.'));
    } finally {
      this.sendingTrial.set(false);
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
    if (this.view()?.template !== view.template) {
      this.focus.set(null);
      this.previews.clear();
      this.renderedDocument = null;
    }
    this.view.set(view);
    this.document.set(view.document);
    this.phrases.use(view.template, view.phrases, view.orphans);
    if (!view.cases.some((candidate) => candidate.id === this.caseId())) {
      this.caseId.set(view.cases[0]?.id ?? null);
    }
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
