import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type {
  ContentLocale,
  LegalDocument,
  LegalDocumentHeading,
  LegalDocumentParagraph,
  LegalDocumentParagraphPayload,
  LegalDocumentProse,
  LegalMention,
} from '@lfd/contracts';
// Les VALEURS par `content-values`, qui ne tire pas zod (cf. l'écran du pied de page).
import {
  contentLocales,
  legalMentionLabels,
  legalMentionOrder,
} from '@lfd/contracts/content-values';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldsetComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldTextareaComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { PlatformContentService } from '../platform-content.service';

/** Les trois langues en segments — le libellé court, la valeur canonique. */
const LOCALE_OPTIONS: readonly FoldViewToggleOption[] = contentLocales.map((code) => ({
  value: code,
  label: code.toUpperCase(),
}));

/** Le nom PLEIN d'une langue. Les segments disent « EN » ; le formulaire de
 *  création, lui, nomme ce qu'il réclame — c'est là qu'on hésite. */
const LOCALE_NAMES: Readonly<Record<ContentLocale, string>> = {
  fr: 'Français',
  en: 'English',
  it: 'Italiano',
};

/** Un texte vide, pour ouvrir une saisie. */
const EMPTY_PROSE: LegalDocumentProse = { title: '', body: '' };

/** Une charge utile vide — les trois langues, puisqu'elles n'existent qu'ensemble. */
const EMPTY_PAYLOAD: LegalDocumentParagraphPayload = {
  fr: EMPTY_PROSE,
  en: EMPTY_PROSE,
  it: EMPTY_PROSE,
};

/**
 * Le document d'avant la lecture — et il n'atteint JAMAIS l'écran : tant que
 * rien n'est lu, l'état est `loading` et le gabarit ne rend que fold.
 *
 * Il est vide plutôt que `DEFAULT_LEGAL_DOCUMENT(…)` d'une mention choisie au
 * hasard : un titre de repli emprunté à une autre mention aurait clignoté sous
 * le titre de la bonne au moindre décalage de rendu.
 */
const BLANK_DOCUMENT: LegalDocument = {
  title: { fr: '', en: '', it: '' },
  paragraphs: [],
};

/**
 * L'état de la LECTURE, pas celui des écritures : un enregistrement refusé ne
 * fait pas disparaître le document de l'écran.
 *
 * `unknown` est à part, et avant toute lecture : le segment d'URL ne désigne
 * aucune mention du vocabulaire, donc il n'y a rien à demander au serveur.
 */
type LoadState = 'unknown' | 'loading' | 'ready' | 'error';

/** Garde de type : évite un `as` là où une vérification suffit. */
function isLocale(value: string): value is ContentLocale {
  return (contentLocales as readonly string[]).includes(value);
}

/**
 * Le segment d'URL désigne-t-il une mention du vocabulaire fermé ?
 *
 * 🔴 C'est ce qui empêche d'appeler le serveur avec une mention inventée : une
 * clé libre ouvrirait un bloc de contenu que le pied de page ne peut pas
 * cocher et que personne ne saurait retrouver.
 */
function isMention(value: string): value is LegalMention {
  return (legalMentionOrder as readonly string[]).includes(value);
}

/**
 * **Une mention légale** — le document que la boutique B2B publie, administré
 * ici.
 *
 * Un SEUL écran pour les cinq mentions : elles ont exactement la même forme —
 * un titre, puis des articles titrés, dans les trois langues — et ce qui les
 * distingue est leur CLÉ, lue dans le segment de route. Cinq copies auraient
 * divergé au premier correctif.
 *
 * Deux natures de saisie se partagent l'écran, et elles n'ont pas le même
 * rapport aux langues :
 *
 * - **corriger** un texte existant se fait dans la langue affichée par le
 *   sélecteur, une à la fois : c'est le geste du traducteur, qui reprend une
 *   version sans toucher aux autres ;
 * - **ajouter** un article demande les TROIS d'un coup, parce que le document
 *   n'accepte pas d'article à moitié traduit. Le formulaire de création vit donc
 *   HORS du sélecteur et montre les trois blocs ensemble : la contrainte se voit
 *   dans la forme du formulaire avant qu'on ait tapé un mot, plutôt que dans un
 *   refus après l'avoir rempli.
 *
 * Les écritures ne rendent rien (cf. le contrat) : après chacune, l'écran
 * **relit**. C'est aussi ce qui lui fait voir ce qu'un autre rédacteur a
 * enregistré entre-temps — le document est un JSON unique, le dernier gagne.
 */
@Component({
  selector: 'app-mentions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFieldsetComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldTextareaComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './mentions-page.html',
  styleUrl: './mentions-page.scss',
})
export class MentionsPage {
  private readonly api = inject(PlatformContentService);
  private readonly notify = inject(NotifyService);

  /**
   * Le segment `:mention` de la route, tel qu'il est écrit dans l'URL — donc
   * une chaîne quelconque tant qu'on ne l'a pas confrontée au vocabulaire.
   */
  readonly mention = input.required<string>();

  /** La mention à éditer, ou `null` si le segment n'en désigne aucune. */
  protected readonly target = computed<LegalMention | null>(() => {
    const segment = this.mention();
    return isMention(segment) ? segment : null;
  });

  /**
   * Le titre de l'écran vient du CONTRAT, pas du document : une mention légale
   * porte un nom consacré, et l'écran doit se nommer avant d'avoir lu quoi que
   * ce soit. Le titre du document, lui, est ce que le dialogue affiche.
   */
  protected readonly heading = computed(() => {
    const mention = this.target();
    return mention === null ? 'Mention inconnue' : legalMentionLabels.fr[mention];
  });

  protected readonly localeOptions = LOCALE_OPTIONS;
  protected readonly locale = signal<ContentLocale>('fr');

  protected readonly state = signal<LoadState>('loading');
  protected readonly busy = signal(false);

  /**
   * La révision LUE. Zéro veut dire que personne n'a jamais enregistré : ce qui
   * est à l'écran est le document de démonstration, et il faut le dire — un
   * document de démonstration se lit comme opposable si rien ne le distingue.
   */
  protected readonly revision = signal(0);

  /**
   * L'écriture est passée, la relecture non. Le contenu affiché reste, mais il
   * peut dater : c'est un échec PARTIEL, pas une page morte.
   */
  protected readonly stale = signal(false);

  private readonly document = signal<LegalDocument>(BLANK_DOCUMENT);

  protected readonly paragraphs = computed<readonly LegalDocumentParagraph[]>(
    () => this.document().paragraphs,
  );

  /** Le titre en cours de saisie, dans ses trois langues. */
  protected readonly titleDraft = signal<LegalDocumentHeading>(BLANK_DOCUMENT.title);

  protected readonly titleChanged = computed(() => {
    const saved = this.document().title;
    const draft = this.titleDraft();
    return contentLocales.some((code) => saved[code] !== draft[code]);
  });

  protected readonly titleComplete = computed(() =>
    contentLocales.every((code) => this.titleDraft()[code].trim().length > 0),
  );

  /** L'article en cours de modification, et son texte dans la langue affichée. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly editDraft = signal<LegalDocumentProse>(EMPTY_PROSE);

  protected readonly editComplete = computed(
    () => this.editDraft().title.trim().length > 0 && this.editDraft().body.trim().length > 0,
  );

  /** La saisie d'un nouvel article — les trois langues, ouvertes ensemble. */
  protected readonly adding = signal(false);
  private readonly addDraft = signal<LegalDocumentParagraphPayload>(EMPTY_PAYLOAD);

  /** Les trois blocs du formulaire de création, dans l'ordre du contrat. */
  protected readonly addFields = computed(() =>
    contentLocales.map((code) => ({
      code,
      name: LOCALE_NAMES[code],
      prose: this.addDraft()[code],
    })),
  );

  /** Les langues encore à écrire — c'est ce qui rend le refus prévisible. */
  private readonly addMissing = computed(() =>
    contentLocales.filter((code) => {
      const prose = this.addDraft()[code];
      return prose.title.trim().length === 0 || prose.body.trim().length === 0;
    }),
  );

  protected readonly addComplete = computed(() => this.addMissing().length === 0);

  /**
   * Ce que dit la carte d'ajout, selon ce qui manque.
   *
   * La phrase de départ énonce la règle AVANT la saisie ; les suivantes
   * nomment ce qui reste. Aucune n'arrive après un refus du serveur : le bouton
   * ne s'arme qu'une fois les trois langues écrites.
   */
  protected readonly addSubtitle = computed(() => {
    const missing = this.addMissing();
    if (missing.length === 0) {
      return 'Les trois langues sont écrites — l’article peut entrer au document.';
    }
    if (missing.length === contentLocales.length) {
      return 'Un article naît dans les trois langues à la fois : le document n’en accepte pas d’à moitié traduit.';
    }
    return `Encore à écrire : ${missing.map((code) => LOCALE_NAMES[code]).join(', ')}.`;
  });

  constructor() {
    // La mention est un SEGMENT de route : le routeur réutilise le composant
    // quand on passe d'une mention à l'autre, donc la lecture se rejoue sur le
    // changement d'entrée et pas seulement à la construction. Sans ça, le menu
    // montrerait le document précédent sous le titre du suivant.
    effect(() => {
      const mention = this.target();
      void this.open(mention);
    });
  }

  /** Ouvre une mention : remet l'écran à zéro, puis lit — ou dit qu'elle n'existe pas. */
  private async open(mention: LegalMention | null): Promise<void> {
    this.editingId.set(null);
    this.cancelAdd();
    this.document.set(BLANK_DOCUMENT);
    this.titleDraft.set(BLANK_DOCUMENT.title);
    this.stale.set(false);
    this.revision.set(0);
    if (mention === null) {
      this.state.set('unknown');
      return;
    }
    await this.load(mention);
  }

  /** La lecture d'entrée, et celle du bouton « Réessayer ». */
  protected async load(mention: LegalMention): Promise<void> {
    this.state.set('loading');
    try {
      await this.read(mention);
      this.state.set('ready');
    } catch (error) {
      this.notify.error(error, 'Document illisible — la lecture a échoué.');
      this.state.set('error');
    }
  }

  /** Le geste de relecture depuis le gabarit, où la mention est déjà résolue. */
  protected async reload(): Promise<void> {
    const mention = this.target();
    if (mention !== null) {
      await this.load(mention);
    }
  }

  private async read(mention: LegalMention): Promise<void> {
    const view = await this.api.legalDocument(mention);
    this.document.set(view.content);
    this.revision.set(view.revision);
    this.titleDraft.set(view.content.title);
    this.stale.set(false);
  }

  protected pickLocale(value: string): void {
    if (isLocale(value)) {
      this.locale.set(value);
      // La modification en cours porte sur la langue AFFICHÉE : la garder
      // ouverte après un changement de segment ferait écrire un texte italien
      // dans la case française.
      this.editingId.set(null);
    }
  }

  /** Le texte d'un article dans la langue affichée. */
  protected prose(paragraph: LegalDocumentParagraph): LegalDocumentProse {
    return paragraph[this.locale()];
  }

  protected setTitle(value: string): void {
    const locale = this.locale();
    this.titleDraft.update((draft) => ({ ...draft, [locale]: value }));
  }

  protected async saveTitle(): Promise<void> {
    await this.write(
      (mention) => this.api.renameLegalDocument(mention, this.titleDraft()),
      'Titre enregistré, dans les trois langues.',
      'Titre refusé — les trois langues doivent être remplies.',
    );
  }

  protected startEdit(paragraph: LegalDocumentParagraph): void {
    this.editingId.set(paragraph.id);
    this.editDraft.set(this.prose(paragraph));
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected setEdit(field: keyof LegalDocumentProse, value: string): void {
    this.editDraft.update((draft) => ({ ...draft, [field]: value }));
  }

  /**
   * Réécrit l'article ENTIER : la langue affichée depuis la saisie, les deux
   * autres telles qu'elles sont. La route remplace la charge utile — omettre
   * une langue l'effacerait.
   */
  protected async saveEdit(paragraph: LegalDocumentParagraph): Promise<void> {
    const locale = this.locale();
    const saved: LegalDocumentParagraphPayload = {
      fr: paragraph.fr,
      en: paragraph.en,
      it: paragraph.it,
    };
    const payload: LegalDocumentParagraphPayload = { ...saved, [locale]: this.editDraft() };
    const done = await this.write(
      (mention) => this.api.editLegalParagraph(mention, paragraph.id, payload),
      'Article enregistré.',
      'Article refusé — un titre et un corps sont exigés.',
    );
    if (done) {
      this.editingId.set(null);
    }
  }

  protected async remove(paragraphId: string): Promise<void> {
    await this.write(
      (mention) => this.api.removeLegalParagraph(mention, paragraphId),
      'Article retiré du document.',
      'Suppression refusée.',
    );
  }

  /** Déplace un article au rang demandé — le rang est compté à partir de zéro. */
  protected async move(paragraphId: string, position: number): Promise<void> {
    await this.write(
      (mention) => this.api.moveLegalParagraph(mention, paragraphId, position),
      'Ordre de lecture mis à jour.',
      'Déplacement refusé.',
    );
  }

  protected openAdd(): void {
    this.addDraft.set(EMPTY_PAYLOAD);
    this.adding.set(true);
  }

  protected cancelAdd(): void {
    this.adding.set(false);
    this.addDraft.set(EMPTY_PAYLOAD);
  }

  protected setAdd(locale: ContentLocale, field: keyof LegalDocumentProse, value: string): void {
    this.addDraft.update((draft) => ({
      ...draft,
      [locale]: { ...draft[locale], [field]: value },
    }));
  }

  protected async submitAdd(): Promise<void> {
    const done = await this.write(
      async (mention) => {
        await this.api.addLegalParagraph(mention, this.addDraft());
      },
      'Article ajouté, dans les trois langues.',
      'Ajout refusé — les trois langues sont exigées ensemble.',
    );
    if (done) {
      this.cancelAdd();
    }
  }

  /**
   * Le cycle commun des écritures : écrire, RELIRE, dire.
   *
   * La mention est passée à l'action plutôt que relue par chacune : elle est
   * résolue UNE fois, et l'écriture comme la relecture portent alors sur le
   * même document même si le menu a changé de page entre-temps.
   *
   * La relecture est séparée de l'écriture dans le traitement d'erreur, et ce
   * n'est pas une précaution de style : une écriture passée dont la relecture
   * échoue laisse un écran juste mais périmé, ce que le bandeau `stale` dit —
   * alors qu'une écriture refusée n'a rien changé du tout.
   */
  private async write(
    action: (mention: LegalMention) => Promise<void>,
    success: string,
    fallback: string,
  ): Promise<boolean> {
    const mention = this.target();
    if (mention === null) {
      return false;
    }
    this.busy.set(true);
    try {
      await action(mention);
    } catch (error) {
      this.notify.refused(error, fallback);
      this.busy.set(false);
      return false;
    }
    try {
      await this.read(mention);
      this.notify.success(success);
    } catch (error) {
      this.notify.error(error, 'Enregistré, mais la relecture a échoué.');
      this.stale.set(true);
    } finally {
      this.busy.set(false);
    }
    return true;
  }
}
