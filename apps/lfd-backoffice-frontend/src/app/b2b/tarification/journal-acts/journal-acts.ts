import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import {
  PRICING_ACT_LABELS,
  type PricingJournalEntryView,
  type PricingJournalPageView,
  type PricingSubjectType,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPaginatorComponent,
  type FoldPaginatorLabels,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { staffAuthor } from '../../../shared/staff-author';
import { TarificationService } from '../tarification.service';

/** De quoi on lit l'histoire. */
export interface JournalSubject {
  readonly subjectType: PricingSubjectType;
  readonly subjectId: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/** Vingt actes par page : un journal se lit, il ne se fait pas défiler sans fin. */
const PAGE_SIZE = 20;

/** Le paginator parle anglais par défaut ; ce journal, non. */
const PAGINATOR_LABELS: FoldPaginatorLabels = {
  pageSize: 'Actes par page',
  perPage: 'par page',
  nav: 'Pagination du journal',
  previous: 'Page précédente',
  next: 'Page suivante',
  empty: 'Aucun acte',
  page: (page) => `Page ${page}`,
  range: (start, end, total) => `${start}–${end} sur ${total}`,
};

/**
 * **Les actes d'un sujet de prix**, du plus récent au plus ancien — lecture
 * seule, par pages sur un instantané.
 *
 * Extrait du panneau de journal le 2026-10-05 (`plan-sous-comptes.md`, S3) :
 * l'onglet Tarifs d'une fiche client le pose EN PLACE, dans une carte, et le
 * panneau l'entoure de son en-tête. Un seul lecteur de journal, deux cadres.
 *
 * Les pages suivantes renvoient l'ancre `asOf` rendue par la page 1 — sans
 * quoi un acte écrit entre deux clics pousserait tout d'un rang. Revenir à la
 * page 1 rouvre un instantané neuf.
 */
@Component({
  selector: 'app-journal-acts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPaginatorComponent,
  ],
  templateUrl: './journal-acts.html',
  styleUrl: './journal-acts.scss',
})
export class JournalActs {
  private readonly tarification = inject(TarificationService);
  private readonly notify = inject(NotifyService);

  readonly subject = input<JournalSubject | undefined>(undefined);
  /** Ce que dit un journal vide — il ne veut pas dire la même chose partout. */
  readonly emptySubtitle = input(
    "Cette décision est antérieure au journal, ou personne n'y a touché depuis.",
  );

  protected readonly state = signal<LoadState>('loading');
  protected readonly entries = signal<readonly PricingJournalEntryView[]>([]);
  /** La page affichée — celle que le serveur a rendue, pas celle qu'on a demandée. */
  protected readonly page = signal(1);
  /** Les actes de l'instantané : c'est lui qui dit au paginateur combien de pages existent. */
  protected readonly total = signal(0);
  /** Une page suivante est en lecture : la liste reste, le paginateur se fige. */
  protected readonly paging = signal(false);
  /** Une page suivante n'a pas pu être lue ; la précédente reste à l'écran. */
  protected readonly pageError = signal(false);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly paginatorLabels = PAGINATOR_LABELS;

  /** L'ancre de l'instantané parcouru, rendue par la page 1. */
  private asOf: string | null = null;
  /** Numéro de la dernière lecture lancée : une réponse plus ancienne est jetée. */
  private requestSeq = 0;

  /** Le nom de l'auteur de l'acte ; `system` et les marqueurs restent tels quels. */
  protected readonly author = staffAuthor;

  constructor() {
    effect(() => {
      const data = this.subject();
      if (data !== undefined) {
        void this.open(data);
      }
    });
  }

  /** Le verbe, dans les mots de la maison. */
  protected actLabel(entry: PricingJournalEntryView): string {
    return PRICING_ACT_LABELS[entry.act];
  }

  /**
   * Le jour et l'heure, en clair.
   *
   * L'heure compte ici, à la différence d'une date de validité : « suspendue à
   * 14 h 05 » répond à « pourquoi la commande de 14 h 10 n'a pas eu la remise ».
   */
  protected when(entry: PricingJournalEntryView): string {
    return new Date(entry.occurredAt).toLocaleString('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  /** Relit depuis la page 1, sur un instantané neuf — le geste « Réessayer ». */
  protected retry(): void {
    const data = this.subject();
    if (data !== undefined) {
      void this.open(data);
    }
  }

  /**
   * Le paginateur change de page. La page 1 rouvre un instantané neuf : c'est
   * le seul moyen de voir un acte arrivé depuis l'ouverture.
   */
  protected async goTo(page: number): Promise<void> {
    const data = this.subject();
    if (data === undefined) {
      return;
    }
    if (page === 1) {
      await this.open(data);
      return;
    }
    const seq = ++this.requestSeq;
    this.paging.set(true);
    this.pageError.set(false);
    try {
      const view = await this.tarification.journalPage(data.subjectType, data.subjectId, {
        page,
        pageSize: PAGE_SIZE,
        ...(this.asOf === null ? {} : { asOf: this.asOf }),
      });
      if (seq === this.requestSeq) {
        this.show(view);
      }
    } catch (error) {
      if (seq === this.requestSeq) {
        this.notify.error(error, "Cette page du journal n'a pas pu être lue.");
        this.pageError.set(true);
      }
    } finally {
      if (seq === this.requestSeq) {
        this.paging.set(false);
      }
    }
  }

  /** La page 1, sans ancre : la réponse fixe l'instantané que les suivantes liront. */
  private async open(data: JournalSubject): Promise<void> {
    const seq = ++this.requestSeq;
    this.state.set('loading');
    this.paging.set(false);
    this.pageError.set(false);
    try {
      const view = await this.tarification.journalPage(data.subjectType, data.subjectId, {
        page: 1,
        pageSize: PAGE_SIZE,
      });
      if (seq !== this.requestSeq) {
        return;
      }
      this.show(view);
      this.state.set('ready');
    } catch (error) {
      if (seq === this.requestSeq) {
        this.notify.error(error, "Le journal n'a pas pu être lu.");
        this.state.set('error');
      }
    }
  }

  private show(view: PricingJournalPageView): void {
    this.entries.set(view.entries);
    this.page.set(view.page);
    this.total.set(view.total);
    this.asOf = view.asOf;
  }
}
