import { NgTemplateOutlet } from '@angular/common';
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
  LegalDocumentKey,
  LegalDocumentParagraphPayload,
  LegalMention,
  SalesTermsDocument,
} from '@lfd/contracts';
// Les VALEURS par `content-values`, qui ne tire pas zod (cf. l'écran du pied de page).
import {
  contentLocales,
  legalMentionLabels,
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
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { legalMentionOfSlug } from '../../reglages/legal-mention-slugs';
import { PlatformContentService } from '../platform-content.service';
import { LegalParagraphCard } from './legal-paragraph-card/legal-paragraph-card';
import { LegalParagraphForm } from './legal-paragraph-form/legal-paragraph-form';
import { LegalPdfCard } from './legal-pdf-card/legal-pdf-card';
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

/** Les deux onglets de la page des CGV (plan `legal/plan-cgv-par-audience.md`, C5). */
export type SalesTermsTab = 'consumers' | 'pro';

const SALES_TERMS_TABS: readonly FoldTabItem<SalesTermsTab>[] = [
  { key: 'consumers', label: 'Particuliers', icon: 'user' },
  { key: 'pro', label: 'Professionnels', icon: 'company' },
];

/** Garde de type : évite un `as` là où une vérification suffit. */
function isLocale(value: string): value is ContentLocale {
  return (contentLocales as readonly string[]).includes(value);
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
    FoldNavLayoutComponent,
    FoldPageLayoutComponent,
    FoldTabPanelComponent,
    FoldTabsComponent,
    LegalParagraphCard,
    LegalParagraphForm,
    LegalPdfCard,
    LegalTitleCard,
    NgTemplateOutlet,
    RequiredSectionCallout,
  ],
  templateUrl: './mentions-page.html',
  styleUrl: './mentions-page.scss',
})
export class MentionsPage {
  private readonly api = inject(PlatformContentService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  /** Le segment `:mention` de la route, brut — le SEGMENT français
   *  (`/reglages/legal/cgv`), pas la clé du contrat, depuis le 2026-10-15. */
  readonly mention = input.required<string>();

  /** La mention à éditer, ou `null` si le segment n'en désigne aucune.
   *  🔴 Garde contre une mention inventée : une clé libre ouvrirait un bloc de
   *  contenu que personne ne saurait retrouver. */
  protected readonly target = computed<LegalMention | null>(() =>
    legalMentionOfSlug(this.mention()),
  );

  /**
   * L'onglet de la page des CGV : particuliers ou professionnels (C5). Une
   * entrée de menu, deux textes — les autres mentions n'en ont qu'un.
   */
  protected readonly salesTermsTabs = SALES_TERMS_TABS;
  protected readonly salesTermsTab = signal<SalesTermsTab>('consumers');

  /**
   * Le DOCUMENT édité : la mention, ou les CGV pro quand l'onglet
   * « Professionnels » est ouvert sur la page des CGV.
   */
  protected readonly documentKey = computed<LegalDocumentKey | null>(() => {
    const mention = this.target();
    if (mention === 'salesTerms' && this.salesTermsTab() === 'pro') {
      return 'salesTermsPro';
    }
    return mention;
  });

  /** Le texte de CGV ouvert, s'il en est un — c'est lui qui porte un PDF de référence. */
  protected readonly salesTermsDocument = computed<SalesTermsDocument | null>(() => {
    const key = this.documentKey();
    return key === 'salesTerms' || key === 'salesTermsPro' ? key : null;
  });

  /**
   * Écrire demande `lfc_legal:write` (C0). Sans lui, la page se lit : elle le
   * dit, n'ouvre pas l'ajout ni le dépôt, et le serveur refuse le reste (403).
   */
  protected readonly canWrite = computed(() => this.permissions.can('lfc_legal:write'));

  /** La date de la dernière révision du texte — comparée à celle du PDF (C3). */
  protected readonly updatedAt = signal<string | null>(null);

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
    const mention = this.documentKey();
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
      const document = this.documentKey();
      void this.open(document);
    });
  }

  /** Ouvre une mention : remet l'écran à zéro, puis lit — ou dit qu'elle n'existe pas. */
  private async open(mention: LegalDocumentKey | null): Promise<void> {
    this.editingId.set(null);
    this.adding.set(false);
    this.conflict.set(null);
    this.document.set(BLANK_DOCUMENT);
    this.stale.set(false);
    this.revision.set(0);
    this.updatedAt.set(null);
    if (mention === null) {
      this.state.set('unknown');
      return;
    }
    await this.load(mention);
  }

  /** La lecture d'entrée, et celle du bouton « Réessayer ». */
  protected async load(mention: LegalDocumentKey): Promise<void> {
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
    const mention = this.documentKey();
    if (mention !== null) {
      await this.load(mention);
    }
  }

  private async read(mention: LegalDocumentKey): Promise<void> {
    const view = await this.api.legalDocument(mention);
    this.document.set(view.content);
    this.revision.set(view.revision);
    this.updatedAt.set(view.revision === 0 ? null : view.updatedAt);
    this.stale.set(false);
  }

  /**
   * « Recharger » après un conflit de révision. La lecture seule, sans passer
   * par l'état `loading` : les saisies ouvertes (titre, article, ajout) restent
   * à l'écran, et se renvoient contre la révision relue.
   */
  protected async reloadAfterConflict(): Promise<void> {
    const mention = this.documentKey();
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
    action: (mention: LegalDocumentKey, revision: number) => Promise<void>,
    success: string,
    fallback: string,
  ): Promise<boolean> {
    const mention = this.documentKey();
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
