import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { PRICING_ACT_LABELS, type PricingJournalEntryView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { TarificationService } from '../tarification.service';

/** Charge d'ouverture : de quoi on veut l'histoire, et comment l'appeler. */
export interface JournalPanelData {
  readonly subjectType: 'rule' | 'floor';
  readonly subjectId: string;
  /** Ce que l'écran appelle cette décision — « Promo de rentrée », « Viennoiseries ». */
  readonly target: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Le journal d'une décision** — qui l'a posée, qui l'a arrêtée, quand.
 *
 * Panneau de **lecture seule**, et il n'existe pas de pendant en écriture : les
 * actes s'écrivent avec la mutation qu'ils racontent, côté serveur, dans la même
 * transaction. Rien ici ne peut en ajouter, en corriger, ni en retirer un.
 *
 * Chaque ligne montre la phrase **figée à l'écriture**, et non l'état
 * d'aujourd'hui : la règle a pu changer ou être archivée depuis, et rendre la
 * phrase courante pour un acte d'hier raconterait l'histoire à l'envers.
 */
@Component({
  selector: 'app-journal-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldEmptyStateComponent, FoldButtonComponent],
  templateUrl: './journal-panel.html',
  styleUrl: './journal-panel.scss',
})
export class JournalPanel {
  private readonly tarification = inject(TarificationService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<JournalPanelData | undefined>(undefined);

  protected readonly state = signal<LoadState>('loading');
  protected readonly entries = signal<readonly PricingJournalEntryView[]>([]);

  protected readonly target = computed(() => this.data()?.target ?? '');

  constructor() {
    effect(() => {
      const data = this.data();
      if (data !== undefined) {
        void this.load(data);
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

  protected close(): void {
    this.ref.close();
  }

  private async load(data: JournalPanelData): Promise<void> {
    this.state.set('loading');
    try {
      this.entries.set(await this.tarification.journalFor(data.subjectType, data.subjectId));
      this.state.set('ready');
    } catch (error) {
      this.notify.error(error, "Le journal n'a pas pu être lu.");
      this.state.set('error');
    }
  }
}
