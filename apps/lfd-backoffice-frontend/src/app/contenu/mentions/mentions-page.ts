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
  LegalMention,
} from '@lfd/contracts';
// Les VALEURS par `content-values`, qui ne tire pas zod (cf. l'écran du pied de page).
import {
  contentLocales,
  legalMentionLabels,
  legalMentionOrder,
  requiredSections,
} from '@lfd/contracts/content-values';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { PlatformContentService } from '../platform-content.service';
import { LegalParagraphCard } from './legal-paragraph-card/legal-paragraph-card';
import { LegalParagraphForm } from './legal-paragraph-form/legal-paragraph-form';
import { LegalTitleCard } from './legal-title-card/legal-title-card';
import {
  RequiredSectionCallout,
  type RequiredSectionSubmission,
} from './required-section-callout/required-section-callout';

/** Le code du refus « quelqu'un a enregistré entre-temps » (409). */
const STALE_REVISION = 'legal_document.revision.stale';

/** Le document d'avant la lecture — vide, jamais celui d'une autre mention :
 *  son titre clignoterait sous celui de la bonne. Il n'atteint pas l'écran. */
const BLANK_DOCUMENT: LegalDocument = {
  title: { fr: '', en: '', it: '' },
  paragraphs: [],
};

/** L'état de la LECTURE, pas des écritures. `unknown` : le segment d'URL ne
 *  désigne aucune mention, rien n'est demandé au serveur. */
type LoadState = 'unknown' | 'loading' | 'ready' | 'error';

/** Garde de type : évite un `as` là où une vérification suffit. */
function isLocale(value: string): value is ContentLocale {
  return (contentLocales as readonly string[]).includes(value);
}

/** 🔴 Garde contre une mention inventée : une clé libre ouvrirait un bloc de
 *  contenu que personne ne saurait retrouver. */
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
 * **Corriger** se fait dans la langue affichée, une à la fois ; **ajouter**
 * demande les trois d'un coup, hors du sélecteur (cf. `LegalParagraphForm`).
 *
 * Toute écriture porte la révision LUE ; le serveur refuse (409) si quelqu'un
 * a enregistré entre-temps, et l'écran le dit avec « Recharger », sans perdre
 * les saisies ouvertes. Après une écriture réussie, l'écran **relit**.
 */
@Component({
  selector: 'app-mentions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    LegalParagraphCard,
    LegalParagraphForm,
    LegalTitleCard,
    RequiredSectionCallout,
  ],
  templateUrl: './mentions-page.html',
  styleUrl: './mentions-page.scss',
})
export class MentionsPage {
  private readonly api = inject(PlatformContentService);
  private readonly notify = inject(NotifyService);

  /** Le segment `:mention` de la route, brut. */
  readonly mention = input.required<string>();

  /** La mention à éditer, ou `null` si le segment n'en désigne aucune. */
  protected readonly target = computed<LegalMention | null>(() => {
    const segment = this.mention();
    return isMention(segment) ? segment : null;
  });

  /** Le titre de l'écran vient du CONTRAT : il se nomme avant toute lecture. */
  protected readonly heading = computed(() => {
    const mention = this.target();
    return mention === null ? 'Mention inconnue' : legalMentionLabels.fr[mention];
  });

  protected readonly locale = signal<ContentLocale>('fr');

  protected readonly state = signal<LoadState>('loading');
  protected readonly busy = signal(false);

  /** La révision LUE, renvoyée par chaque écriture. Zéro : personne n'a
   *  enregistré, l'écran montre le document de démonstration et le dit. */
  protected readonly revision = signal(0);

  /** L'écriture est passée, la relecture non : échec PARTIEL. */
  protected readonly stale = signal(false);

  protected readonly document = signal<LegalDocument>(BLANK_DOCUMENT);

  protected readonly paragraphs = computed<readonly LegalDocumentParagraph[]>(
    () => this.document().paragraphs,
  );

  /** L'article en cours de modification — son brouillon vit dans sa carte. */
  protected readonly editingId = signal<string | null>(null);

  /** La saisie d'un nouvel article est ouverte. */
  protected readonly adding = signal(false);

  /** Le message du serveur sur un 409 « révision périmée », affiché tel quel. */
  protected readonly conflict = signal<string | null>(null);

  /** Les sections que la mention exige et que le document ne porte pas encore. */
  protected readonly missingSections = computed(() => {
    const mention = this.target();
    if (mention === null) {
      return [];
    }
    const present = new Set(this.paragraphs().map((paragraph) => paragraph.section));
    return requiredSections(mention).filter((key) => !present.has(key));
  });

  constructor() {
    // Le routeur réutilise le composant d'une mention à l'autre : la lecture
    // se rejoue sur le changement d'entrée, pas seulement à la construction.
    effect(() => {
      const mention = this.target();
      void this.open(mention);
    });
  }

  /** Ouvre une mention : remet l'écran à zéro, puis lit — ou dit qu'elle n'existe pas. */
  private async open(mention: LegalMention | null): Promise<void> {
    this.editingId.set(null);
    this.adding.set(false);
    this.conflict.set(null);
    this.document.set(BLANK_DOCUMENT);
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
    this.stale.set(false);
  }

  /**
   * « Recharger » après un conflit de révision. La lecture seule, sans passer
   * par l'état `loading` : les saisies ouvertes (titre, article, ajout) restent
   * à l'écran, et se renvoient contre la révision relue.
   */
  protected async reloadAfterConflict(): Promise<void> {
    const mention = this.target();
    if (mention === null) {
      return;
    }
    try {
      await this.read(mention);
      this.conflict.set(null);
    } catch (error) {
      this.notify.error(error, 'La relecture a échoué.');
    }
  }

  protected pickLocale(value: string): void {
    if (isLocale(value)) {
      this.locale.set(value);
      // La correction porte sur la langue AFFICHÉE : la garder ouverte ferait
      // écrire un texte italien dans la case française.
      this.editingId.set(null);
    }
  }

  protected async saveTitle(title: LegalDocumentHeading): Promise<void> {
    await this.write(
      (mention, revision) => this.api.renameLegalDocument(mention, title, revision),
      'Titre enregistré, dans les trois langues.',
      'Titre refusé — les trois langues doivent être remplies.',
    );
  }

  protected async saveEdit(
    paragraph: LegalDocumentParagraph,
    payload: LegalDocumentParagraphPayload,
  ): Promise<void> {
    const done = await this.write(
      (mention, revision) => this.api.editLegalParagraph(mention, paragraph.id, payload, revision),
      'Article enregistré.',
      'Article refusé — un titre et un corps sont exigés.',
    );
    if (done) {
      this.editingId.set(null);
    }
  }

  protected async remove(paragraphId: string): Promise<void> {
    await this.write(
      (mention, revision) => this.api.removeLegalParagraph(mention, paragraphId, revision),
      'Article retiré du document.',
      'Suppression refusée.',
    );
  }

  /** Déplace un article au rang demandé — le rang est compté à partir de zéro. */
  protected async move(paragraphId: string, position: number): Promise<void> {
    await this.write(
      (mention, revision) => this.api.moveLegalParagraph(mention, paragraphId, position, revision),
      'Ordre de lecture mis à jour.',
      'Déplacement refusé.',
    );
  }

  protected async submitAdd(payload: LegalDocumentParagraphPayload): Promise<void> {
    const done = await this.write(
      async (mention, revision) => {
        await this.api.addLegalParagraph(mention, payload, revision);
      },
      'Article ajouté, dans les trois langues.',
      'Ajout refusé — les trois langues sont exigées ensemble.',
    );
    if (done) {
      this.adding.set(false);
    }
  }

  /** Crée une section requise ; son encadré disparaît avec la relecture. */
  protected async submitSection({ section, payload }: RequiredSectionSubmission): Promise<void> {
    await this.write(
      async (mention, revision) => {
        await this.api.addLegalRequiredSection(mention, section, payload, revision);
      },
      'Section créée, dans les trois langues.',
      'Création refusée — les trois langues sont exigées ensemble.',
    );
  }

  /**
   * Le cycle commun des écritures : écrire (contre la révision lue), RELIRE,
   * dire. La mention est résolue UNE fois pour l'écriture et la relecture. Une
   * écriture passée dont la relecture échoue laisse un écran périmé (`stale`) ;
   * une écriture refusée n'a rien changé — et si c'est pour révision périmée,
   * le message du serveur reste affiché avec « Recharger » (`conflict`).
   */
  private async write(
    action: (mention: LegalMention, revision: number) => Promise<void>,
    success: string,
    fallback: string,
  ): Promise<boolean> {
    const mention = this.target();
    if (mention === null) {
      return false;
    }
    this.busy.set(true);
    try {
      // La révision LUE : le serveur refuse si quelqu'un a enregistré depuis.
      await action(mention, this.revision());
    } catch (error) {
      if (httpErrorCode(error) === STALE_REVISION) {
        this.conflict.set(httpErrorMessage(error, fallback));
      } else {
        this.notify.refused(error, fallback);
      }
      this.busy.set(false);
      return false;
    }
    this.conflict.set(null);
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
