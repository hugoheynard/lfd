import { HttpErrorResponse } from '@angular/common/http';
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
  viewChild,
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
  type MailPreviewSituation,
} from '@lfd/mail-blocks';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldDisclosureComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import type { HasPendingChanges } from '../../../pim/catalogue/product-form/pending-changes.guard';
import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { LOCALE_LABELS } from '../../../textes-boutique/rules/copy-text';
import { mailLabel, mailWhoAndWhen } from '../../rules/mail-labels';
import { GestureIntents } from '../../../shared/gesture-intents';
import { MailEditorService } from '../../data/mail-editor.service';
import {
  phraseHeading,
  phrasesAt,
  placeTitle,
  unplacedPhrases,
} from '../../rules/mail-phrase-places';
import { SITUATION_LABELS } from '../../rules/mail-block-conditions';
import { reshapesFullWidthImages } from '../../rules/mail-image-framing';
import { EMPTY_MAIL_RESOURCES } from '../../rules/mail-resources';
import {
  BLOCK_PREVIEW_DEBOUNCE_MS,
  MailBlockPreviewsStore,
} from '../../state/mail-block-previews-store';
import { MailPhrasesStore, PHRASE_DRAFT_DEBOUNCE_MS } from '../../state/mail-phrases-store';
import { MailCanvas } from '../mail-canvas/mail-canvas';
import {
  MailFaithfulPreview,
  type MailPhraseSource,
  type PreviewDevice,
  type PreviewScheme,
} from '../mail-faithful-preview/mail-faithful-preview';
import { MailPhraseEditor } from '../mail-phrase-editor/mail-phrase-editor';
import { MailPublishDialog } from '../mail-publish-dialog/mail-publish-dialog';
import { MailRevertDialog } from '../mail-revert-dialog/mail-revert-dialog';
import { MailTemplateTabs } from '../mail-template-tabs/mail-template-tabs';
import { MailTrialDialog, type MailTrialChoice } from '../mail-trial-dialog/mail-trial-dialog';

/** Qui reçoit l'e-mail, dans la confirmation de « Publier ». */
const RECIPIENTS: Readonly<Record<MailAudience, string>> = {
  customer: 'les clients',
  team: 'l’équipe',
  agency: 'l’agence',
};

/** La pause après une frappe ou un geste avant d'enregistrer le brouillon — celle des phrases. */
export const DOCUMENT_DRAFT_DEBOUNCE_MS = PHRASE_DRAFT_DEBOUNCE_MS;

/** L'heure d'un enregistrement, à l'heure de la boulangerie : « 14 h 32 ». */
const SAVED_AT = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/** L'état d'enregistrement du brouillon du document, dit en haut à droite. */
export type MailDraftSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'refused';

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

const DEVICE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'desktop', label: 'Ordinateur' },
  { value: 'phone', label: 'Téléphone' },
];

const SCHEME_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

/** « 14 h 32 ». */
function savedAtLabel(at: Date): string {
  const parts = SAVED_AT.formatToParts(at);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '';
  return `${hour} h ${minute}`;
}

/**
 * **La page d'un e-mail** (§ 6, S5a) : le canevas (S5b) monté avec le
 * document que l'éditeur ouvre — le brouillon, sinon le publié, sinon le
 * document de départ — et la déclaration du modèle ; la langue au-dessus,
 * parmi celles du modèle ; l'aperçu fidèle à la demande.
 *
 * Le brouillon du document s'enregistre TOUT SEUL (retouche de l'en-tête,
 * 2026-11-07), après une pause dans la frappe ou un geste — la mécanique des
 * phrases : la révision lue, un enregistrement à la fois, un refus du serveur
 * gardé et dit (`saveState`), le document à l'écran jamais écrasé. Un `409`
 * dit que quelqu'un a écrit entre-temps : seul « Relire » en sort.
 *
 * En haut à droite, l'état d'enregistrement, « Publier » et un menu « … ».
 * « Publier » ouvre une fenêtre fold : ce qui part, les phrases qui partent
 * avec, les refus de `validateMailDocumentForPublication` (bouton désactivé) ;
 * il enregistre d'abord ce qui attend la pause. Le menu ouvre l'essai et le
 * retour au modèle d'origine, chacun dans sa fenêtre. L'historique est un
 * onglet, sa propre route (`/emails/:template/historique`).
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
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldListboxComponent,
    FoldPageSectionComponent,
    FoldPopoverTriggerDirective,
    MailCanvas,
    MailFaithfulPreview,
    MailPhraseEditor,
    MailTemplateTabs,
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
  private readonly panels = inject(FoldPanelHostService);
  /** L'aperçu fidèle : la barre d'outils le fait rendre. */
  protected readonly faithful = viewChild(MailFaithfulPreview);
  /** La pause en cours avant d'enregistrer le brouillon. */
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** L'enregistrement en vol, que « Publier » et la sortie attendent. */
  private saveInFlight: Promise<void> | null = null;
  /** Le document du dernier rendu demandé : un geste sur lui attend la pause, le reste non. */
  private renderedDocument: MailDocument | null = null;
  /** Une clé par essai voulu (e-mail, langue, cas), renvoyée à chaque clic jusqu'à l'envoi. */
  private readonly intents = new GestureIntents();

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  /** Le retour mène à l'espace de l'e-mail (§ 25, C2) ; tant qu'il n'est pas lu, à la liste. */
  protected readonly back = computed(() => {
    const view = this.view();
    if (view === null) {
      return { label: 'Email Templates', link: ['/emails'] };
    }
    const space = mailSpaceOfCharter(view.declaration.charter);
    return { label: MAIL_SPACE_LABELS[space], link: ['/emails', 'espaces', space, 'templates'] };
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
  /** Un enregistrement du brouillon est parti au serveur. */
  readonly saving = signal(false);
  /** Le dernier refus d'enregistrement du brouillon, tel que le serveur l'a dit. */
  readonly saveRefusal = signal<string | null>(null);
  /** Le refus est un conflit de révision : seul « Relire » en sort. */
  readonly saveConflict = signal(false);
  /** L'instant du dernier enregistrement réussi, à l'horloge du poste. */
  readonly savedAt = signal<Date | null>(null);
  protected readonly publishing = signal(false);
  protected readonly sendingTrial = signal(false);
  readonly device = signal<PreviewDevice>('desktop');
  readonly scheme = signal<PreviewScheme>('light');
  protected readonly deviceOptions = DEVICE_OPTIONS;
  protected readonly schemeOptions = SCHEME_OPTIONS;
  /** Le cas affiché (`MailEditorView.cases`) : l'aperçu fidèle et l'essai le rendent. */
  readonly caseId = signal<string | null>(null);
  /**
   * La situation de l'aperçu (§ 24) : `example` rend le cas tel quel ; sinon
   * le canevas le rend en retrait ou en livraison, et grise ce qui en est absent.
   */
  readonly situation = signal<MailPreviewSituation | 'example'>('example');
  protected readonly situationOptions = computed(() => {
    const situations = this.view()?.situations ?? [];
    return situations.length === 0
      ? []
      : [
          { value: 'example' as const, label: 'Tel quel' },
          ...situations.map((value) => ({ value, label: SITUATION_LABELS[value] })),
        ];
  });
  /** Le bloc du modèle ou le cadre dont la colonne de droite montre les phrases. */
  readonly focus = signal<MailEditorPhrasePlace | null>(null);
  /** Les phrases que l'aperçu fidèle et l'essai rendent (S5e). */
  readonly phraseSource = signal<MailPhraseSource>('draft');
  protected readonly phraseSourceOptions = PHRASE_SOURCE_OPTIONS;
  /** Un e-mail servi sans ressources (le contrat les laisse facultatives) : rien à poser. */
  protected readonly noResources = EMPTY_MAIL_RESOURCES;
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

  /** Les refus de publication, dits dans la fenêtre de « Publier ». */
  private readonly publicationIssueMessages = computed(() =>
    this.publicationIssues().map((issue) => issue.message),
  );

  /** Où en est le brouillon du document — `pending` : modifié, la pause court. */
  readonly saveState = computed<MailDraftSaveState>(() => {
    if (this.saving()) {
      return 'saving';
    }
    if (this.saveRefusal() !== null) {
      return 'refused';
    }
    if (this.dirty()) {
      return 'pending';
    }
    return this.savedAt() === null ? 'idle' : 'saved';
  });

  /** L'état d'enregistrement en mots ; au repos, d'où vient le document ouvert. */
  protected readonly saveLabel = computed(() => {
    switch (this.saveState()) {
      case 'pending':
        return 'Modifications non enregistrées';
      case 'saving':
        return 'Enregistrement…';
      case 'refused':
        return 'Refusé — voir les blocs';
      case 'saved': {
        const at = this.savedAt();
        return at === null ? 'Brouillon enregistré' : `Brouillon enregistré · ${savedAtLabel(at)}`;
      }
      case 'idle':
        return this.sourceLabel();
    }
  });

  /**
   * Il y a quelque chose à effacer : un brouillon (lu, ou enregistré depuis)
   * ou une version publiée.
   */
  protected readonly canRevert = computed(() => {
    const view = this.view();
    return view !== null && (view.source !== 'starting' || view.published !== null);
  });

  constructor() {
    effect(() => {
      const template = this.template();
      untracked(() => void this.load(template));
    });
    // Le brouillon s'enregistre tout seul : chaque geste ou frappe sur le
    // document relance la pause ; un refus attend le geste suivant.
    effect(() => {
      const document = this.document();
      const dirty = this.dirty();
      if (document === null || !dirty || !this.canWrite()) {
        return;
      }
      untracked(() => this.scheduleSave());
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
        // Une image pleine largeur qui change de voisins (ou de largeur) se
        // relit tout de suite : ses arrondis suivent sa place.
        const before = this.renderedDocument;
        const delay =
          before === null ||
          before === payload.document ||
          reshapesFullWidthImages(before, payload.document)
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
    const situation = this.situation();
    return {
      document,
      locale: this.locale(),
      source: 'draft',
      ...(caseId === null ? {} : { caseId }),
      ...(situation === 'example' ? {} : { situation }),
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

  /** Relance la pause avant d'enregistrer ; un refus s'efface au geste suivant. */
  private scheduleSave(): void {
    this.saveRefusal.set(null);
    this.saveConflict.set(false);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveNow();
    }, DOCUMENT_DRAFT_DEBOUNCE_MS);
  }

  /**
   * Enregistre ce qui attend la pause, tout de suite, et attend l'enregistrement
   * en vol — avant « Publier », un essai, ou la sortie.
   */
  async flushDocument(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.saveNow();
      return;
    }
    await this.saveInFlight;
  }

  /** Un enregistrement à la fois : le suivant part quand le précédent a répondu. */
  private async saveNow(): Promise<void> {
    if (this.saveInFlight !== null) {
      await this.saveInFlight;
    }
    const view = this.view();
    const document = this.document();
    if (view === null || document === null || !this.canWrite() || document === view.document) {
      return;
    }
    const run = this.writeDraft(view, document);
    this.saveInFlight = run;
    try {
      await run;
    } finally {
      if (this.saveInFlight === run) {
        this.saveInFlight = null;
      }
    }
  }

  /**
   * Écrit le brouillon sur la révision lue, sans relire : la vue prend le
   * document enregistré et la révision suivante — `MailTemplateDocument`
   * l'incrémente d'un à chaque écriture du brouillon (vérifié le 2026-11-07,
   * `apps/lfd-api/src/mail/documents/domain/mail-template-document.ts`). Une
   * relecture écraserait ce qui s'est tapé pendant l'appel.
   */
  private async writeDraft(view: MailEditorView, document: MailDocument): Promise<void> {
    this.saving.set(true);
    try {
      await this.api.saveDraft(view.template, { document, expectedRevision: view.revision });
      this.view.set({ ...view, document, source: 'draft', revision: view.revision + 1 });
      this.savedAt.set(new Date());
    } catch (error) {
      this.saveConflict.set(error instanceof HttpErrorResponse && error.status === 409);
      this.saveRefusal.set(httpErrorMessage(error, 'Le brouillon n’a pas pu être enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }

  /** « Rendre l'aperçu » de la barre d'outils. */
  protected renderFaithful(): void {
    void this.faithful()?.render();
  }

  protected setDevice(value: string): void {
    this.device.set(value === 'phone' ? 'phone' : 'desktop');
  }

  protected setScheme(value: string): void {
    this.scheme.set(value === 'dark' ? 'dark' : 'light');
  }

  /** « Publier » : la fenêtre qui dit ce qui part, et les refus. */
  openPublish(): void {
    const view = this.view();
    if (view === null || !this.canWrite()) {
      return;
    }
    this.panels.open(MailPublishDialog, {
      data: {
        recipients: RECIPIENTS[view.audience],
        issues: this.publicationIssueMessages,
        pendingPhrases: this.phrases.pendingCount,
        saveRefusal: this.saveRefusal.asReadonly(),
        publish: () => this.publish(),
      },
    });
  }

  /**
   * Met en service le brouillon et les phrases en attente : enregistre
   * d'abord ce qui attend la pause. Rend le refus tel quel, ou `null`.
   */
  async publish(): Promise<string | null> {
    if (!this.canWrite() || this.publishing()) {
      return null;
    }
    this.publishing.set(true);
    try {
      await this.flushDocument();
      const refused = this.saveRefusal();
      if (refused !== null) {
        return refused;
      }
      if (this.publicationIssues().length > 0) {
        return 'Cet e-mail ne peut pas encore être publié.';
      }
      const view = this.view();
      if (view === null) {
        return null;
      }
      await this.phrases.flush();
      const { publicationVersion } = await this.api.publish(view.template, {
        expectedRevision: view.revision,
      });
      this.apply(await this.api.load(view.template));
      this.notify.success(`Publié — version des textes ${publicationVersion}.`);
      return null;
    } catch (error) {
      return httpErrorMessage(error, 'Cet e-mail n’a pas pu être publié.');
    } finally {
      this.publishing.set(false);
    }
  }

  /** « Revenir au modèle d'origine » : la fenêtre qui dit ce qui est effacé. */
  openRevert(): void {
    const view = this.view();
    if (view === null || !this.canWrite()) {
      return;
    }
    const erased: string[] = [];
    if (view.source === 'draft' || this.dirty()) {
      erased.push('Le brouillon de l’arrangement est effacé, modifications en cours comprises.');
    }
    if (view.published !== null) {
      erased.push(
        `La version publiée (n° ${view.published.version}) est retirée — elle reste dans l’historique.`,
      );
    }
    this.panels.open(MailRevertDialog, { data: { erased, revert: () => this.revert() } });
  }

  /** Efface le brouillon et retire le publié ; rend le refus tel quel, ou `null`. */
  async revert(): Promise<string | null> {
    if (!this.canWrite() || this.publishing()) {
      return null;
    }
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveInFlight;
    const view = this.view();
    if (view === null) {
      return null;
    }
    try {
      await this.api.revert(view.template, { expectedRevision: view.revision });
      this.apply(await this.api.load(view.template));
      this.notify.success('Cet e-mail repart dans son arrangement d’origine.');
      return null;
    } catch (error) {
      return httpErrorMessage(error, 'Cet e-mail n’a pas pu revenir au modèle d’origine.');
    }
  }

  /** « M'envoyer un essai » : la fenêtre, avec la langue, le cas et les phrases courants. */
  openTrial(): void {
    const view = this.view();
    if (view === null || !this.canWrite()) {
      return;
    }
    this.panels.open(MailTrialDialog, {
      data: {
        locale: this.locale(),
        caseId: this.caseId(),
        source: this.phraseSource(),
        locales: view.declaration.locales.map((locale) => ({
          value: locale,
          label: LOCALE_LABELS[locale],
        })),
        cases: this.caseOptions(),
        send: (choice: MailTrialChoice) => this.sendTrial(choice),
      },
    });
  }

  /**
   * Envoie l'essai à l'auteur seul ; la clé d'intention vaut pour ce choix
   * (e-mail, langue, cas, phrases) jusqu'à l'envoi. Rend le refus, ou `null`.
   */
  async sendTrial(choice: MailTrialChoice): Promise<string | null> {
    const view = this.view();
    if (view === null || !this.canWrite() || this.sendingTrial()) {
      return null;
    }
    const { locale, caseId, source } = choice;
    const subject = `${view.template}\u0000${locale}\u0000${caseId ?? ''}\u0000${source}`;
    this.sendingTrial.set(true);
    try {
      await this.flushDocument();
      await this.phrases.flush();
      await this.api.sendTrial(
        view.template,
        { locale, source, ...(caseId === null ? {} : { caseId }) },
        this.intents.keyFor(subject),
      );
      this.intents.done(subject);
      this.notify.success('Essai envoyé à votre adresse.');
      return null;
    } catch (error) {
      return httpErrorMessage(error, 'L’essai n’a pas pu être envoyé.');
    } finally {
      this.sendingTrial.set(false);
    }
  }

  /** « Relire » après un conflit : la version enregistrée remplace celle à l'écran. */
  protected async reloadAfterConflict(): Promise<void> {
    this.saveRefusal.set(null);
    this.saveConflict.set(false);
    await this.load();
  }

  /**
   * Garde de sortie — vers l'historique compris. Tout est enregistré : rien à
   * garder. Un enregistrement en attente ou en cours (qu'on lance tout de
   * suite), ou refusé : la sortie est retenue une fois, et le dit ; la
   * seconde passe.
   */
  canLeave(): boolean {
    if (!this.canWrite() || this.leaveWarned() || this.saveState() === 'idle') {
      return true;
    }
    if (this.saveState() === 'saved') {
      return true;
    }
    if (this.saveState() === 'pending') {
      void this.flushDocument();
    }
    this.leaveWarned.set(true);
    return false;
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    const state = this.saveState();
    if (this.canWrite() && (state === 'pending' || state === 'saving' || state === 'refused')) {
      event.preventDefault();
    }
  }

  /** Pose la vue lue ; garde la langue choisie si le modèle la parle encore. */
  private apply(view: MailEditorView): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saveRefusal.set(null);
    this.saveConflict.set(false);
    if (this.view()?.template !== view.template) {
      this.savedAt.set(null);
      this.focus.set(null);
      this.previews.clear();
      this.renderedDocument = null;
    }
    this.view.set(view);
    this.document.set(view.document);
    this.phrases.use(view.template, view.phrases, view.orphans);
    const situation = this.situation();
    if (situation !== 'example' && !(view.situations ?? []).includes(situation)) {
      this.situation.set('example');
    }
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
