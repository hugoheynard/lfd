import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  ContentLocale,
  SalesTerms,
  SalesTermsHeading,
  SalesTermsParagraph,
  SalesTermsParagraphPayload,
  SalesTermsProse,
} from '@lfd/contracts';
// Les VALEURS par `content-values`, qui ne tire pas zod (cf. l'écran du pied de page).
import { contentLocales, DEFAULT_SALES_TERMS } from '@lfd/contracts/content-values';
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
const EMPTY_PROSE: SalesTermsProse = { title: '', body: '' };

/** Une charge utile vide — les trois langues, puisqu'elles n'existent qu'ensemble. */
const EMPTY_PAYLOAD: SalesTermsParagraphPayload = {
  fr: EMPTY_PROSE,
  en: EMPTY_PROSE,
  it: EMPTY_PROSE,
};

/** L'état de la LECTURE, pas celui des écritures : un enregistrement refusé ne
 *  fait pas disparaître le document de l'écran. */
type LoadState = 'loading' | 'ready' | 'error';

/** Garde de type : évite un `as` là où une vérification suffit. */
function isLocale(value: string): value is ContentLocale {
  return (contentLocales as readonly string[]).includes(value);
}

/**
 * **Conditions générales de vente** — le document que la boutique B2B fait
 * accepter, administré ici.
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
  selector: 'app-cgv-page',
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
  templateUrl: './cgv-page.html',
  styleUrl: './cgv-page.scss',
})
export class CgvPage {
  private readonly api = inject(PlatformContentService);
  private readonly notify = inject(NotifyService);

  protected readonly localeOptions = LOCALE_OPTIONS;
  protected readonly locale = signal<ContentLocale>('fr');

  protected readonly state = signal<LoadState>('loading');
  protected readonly busy = signal(false);

  /**
   * La révision LUE. Zéro veut dire que personne n'a jamais enregistré : ce qui
   * est à l'écran est le document de démonstration, et il faut le dire — des
   * CGV de démonstration se lisent comme opposables si rien ne les distingue.
   */
  protected readonly revision = signal(0);

  /**
   * L'écriture est passée, la relecture non. Le contenu affiché reste, mais il
   * peut dater : c'est un échec PARTIEL, pas une page morte.
   */
  protected readonly stale = signal(false);

  private readonly document = signal<SalesTerms>(DEFAULT_SALES_TERMS);

  protected readonly paragraphs = computed<readonly SalesTermsParagraph[]>(
    () => this.document().paragraphs,
  );

  /** Le titre en cours de saisie, dans ses trois langues. */
  protected readonly titleDraft = signal<SalesTermsHeading>(DEFAULT_SALES_TERMS.title);

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
  protected readonly editDraft = signal<SalesTermsProse>(EMPTY_PROSE);

  protected readonly editComplete = computed(
    () => this.editDraft().title.trim().length > 0 && this.editDraft().body.trim().length > 0,
  );

  /** La saisie d'un nouvel article — les trois langues, ouvertes ensemble. */
  protected readonly adding = signal(false);
  private readonly addDraft = signal<SalesTermsParagraphPayload>(EMPTY_PAYLOAD);

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
    void this.load();
  }

  /** La lecture d'entrée, et celle du bouton « Réessayer ». */
  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      await this.read();
      this.state.set('ready');
    } catch (error) {
      this.notify.error(error, 'Conditions illisibles — la lecture a échoué.');
      this.state.set('error');
    }
  }

  private async read(): Promise<void> {
    const view = await this.api.salesTerms();
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
  protected prose(paragraph: SalesTermsParagraph): SalesTermsProse {
    return paragraph[this.locale()];
  }

  protected setTitle(value: string): void {
    const locale = this.locale();
    this.titleDraft.update((draft) => ({ ...draft, [locale]: value }));
  }

  protected async saveTitle(): Promise<void> {
    await this.write(
      () => this.api.renameSalesTerms(this.titleDraft()),
      'Titre enregistré, dans les trois langues.',
      'Titre refusé — les trois langues doivent être remplies.',
    );
  }

  protected startEdit(paragraph: SalesTermsParagraph): void {
    this.editingId.set(paragraph.id);
    this.editDraft.set(this.prose(paragraph));
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected setEdit(field: keyof SalesTermsProse, value: string): void {
    this.editDraft.update((draft) => ({ ...draft, [field]: value }));
  }

  /**
   * Réécrit l'article ENTIER : la langue affichée depuis la saisie, les deux
   * autres telles qu'elles sont. La route remplace la charge utile — omettre
   * une langue l'effacerait.
   */
  protected async saveEdit(paragraph: SalesTermsParagraph): Promise<void> {
    const locale = this.locale();
    const saved: SalesTermsParagraphPayload = {
      fr: paragraph.fr,
      en: paragraph.en,
      it: paragraph.it,
    };
    const payload: SalesTermsParagraphPayload = { ...saved, [locale]: this.editDraft() };
    const done = await this.write(
      () => this.api.editSalesTermsParagraph(paragraph.id, payload),
      'Article enregistré.',
      'Article refusé — un titre et un corps sont exigés.',
    );
    if (done) {
      this.editingId.set(null);
    }
  }

  protected async remove(paragraphId: string): Promise<void> {
    await this.write(
      () => this.api.removeSalesTermsParagraph(paragraphId),
      'Article retiré du document.',
      'Suppression refusée.',
    );
  }

  /** Déplace un article au rang demandé — le rang est compté à partir de zéro. */
  protected async move(paragraphId: string, position: number): Promise<void> {
    await this.write(
      () => this.api.moveSalesTermsParagraph(paragraphId, position),
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

  protected setAdd(locale: ContentLocale, field: keyof SalesTermsProse, value: string): void {
    this.addDraft.update((draft) => ({
      ...draft,
      [locale]: { ...draft[locale], [field]: value },
    }));
  }

  protected async submitAdd(): Promise<void> {
    const done = await this.write(
      async () => {
        await this.api.addSalesTermsParagraph(this.addDraft());
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
   * La relecture est séparée de l'écriture dans le traitement d'erreur, et ce
   * n'est pas une précaution de style : une écriture passée dont la relecture
   * échoue laisse un écran juste mais périmé, ce que le bandeau `stale` dit —
   * alors qu'une écriture refusée n'a rien changé du tout.
   */
  private async write(
    action: () => Promise<void>,
    success: string,
    fallback: string,
  ): Promise<boolean> {
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      this.notify.refused(error, fallback);
      this.busy.set(false);
      return false;
    }
    try {
      await this.read();
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
