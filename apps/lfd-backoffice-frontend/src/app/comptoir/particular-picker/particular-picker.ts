import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { COUNTER_PARTICULAR_SEARCH_MIN_LENGTH, type CounterParticularCard } from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldSearchComponent,
} from 'fold-ng';

import { GestureIntents } from '../../shared/gesture-intents';
import { CounterParticularsService } from '../counter-particulars.service';

/** L'accalmie avant de chercher : la durée d'une frappe. */
export const PARTICULAR_SEARCH_DELAY_MS = 300;

/** Le refus d'une création dont l'e-mail ou le téléphone est déjà celui d'une fiche. */
export const CONTACT_TAKEN = 'account.counter_particular.contact_taken';

/** Le sujet de l'intention de créer : une fiche à la fois. */
const CREATE_INTENT = 'create';

type SearchState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * **Trouver LA personne, ou créer sa fiche** (`commande-particulier-reglee-en-boutique.md`, § 3).
 *
 * L'équipe CLIQUE sur la personne : aucun choix automatique, pas même à
 * résultat unique — une adresse mal entendue au téléphone rattacherait la
 * commande à quelqu'un d'autre. Seule exception, et ce n'en est pas une : la
 * fiche qu'on vient de créer, reconnue par l'identifiant que le serveur rend.
 *
 * Un 409 « contact déjà pris » ne publie aucun identifiant : l'écran relance
 * la recherche avec l'e-mail saisi, pour que la fiche existante apparaisse à
 * choisir.
 */
@Component({
  selector: 'app-particular-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldSearchComponent,
  ],
  templateUrl: './particular-picker.html',
  styleUrl: './particular-picker.scss',
})
export class ParticularPicker {
  private readonly api = inject(CounterParticularsService);
  private readonly intents = new GestureIntents();

  /** La personne choisie par l'équipe. */
  readonly chosen = output<CounterParticularCard>();

  protected readonly delayMs = PARTICULAR_SEARCH_DELAY_MS;
  protected readonly query = signal('');
  protected readonly state = signal<SearchState>('idle');
  protected readonly results = signal<readonly CounterParticularCard[]>([]);
  /** Le numéro de la dernière recherche : une réponse plus ancienne est jetée. */
  private searchSeq = 0;

  protected readonly creating = signal(false);
  protected readonly firstName = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly saving = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly canCreate = computed(
    () =>
      this.firstName().trim() !== '' &&
      this.email().trim() !== '' &&
      this.phone().trim() !== '' &&
      !this.saving(),
  );

  /** Cherche — en deçà de deux caractères, rien n'est demandé. */
  async search(query: string): Promise<void> {
    this.query.set(query);
    const q = query.trim();
    const seq = ++this.searchSeq;
    if (q.length < COUNTER_PARTICULAR_SEARCH_MIN_LENGTH) {
      this.results.set([]);
      this.state.set('idle');
      return;
    }
    this.state.set('loading');
    try {
      const found = await this.api.search(q);
      if (seq === this.searchSeq) {
        this.results.set(found);
        this.state.set('ready');
      }
    } catch {
      if (seq === this.searchSeq) {
        this.state.set('error');
      }
    }
  }

  protected retry(): void {
    void this.search(this.query());
  }

  protected choose(card: CounterParticularCard): void {
    this.chosen.emit(card);
  }

  protected openCreate(): void {
    this.creating.set(true);
    this.createError.set(null);
  }

  protected closeCreate(): void {
    this.creating.set(false);
    this.createError.set(null);
  }

  /** « Nouvelle fiche » : les trois champs, une fois par intention. */
  async create(): Promise<void> {
    if (!this.canCreate()) {
      return;
    }
    this.saving.set(true);
    this.createError.set(null);
    const email = this.email().trim();
    try {
      const id = await this.api.create(
        { firstName: this.firstName().trim(), email, phone: this.phone().trim() },
        this.intents.keyFor(CREATE_INTENT),
      );
      this.intents.done(CREATE_INTENT);
      await this.search(email);
      const created = this.results().find((card) => card.id === id);
      if (created !== undefined) {
        this.creating.set(false);
        this.chosen.emit(created);
      }
    } catch (error: unknown) {
      this.createError.set(httpErrorMessage(error, 'La fiche n’a pas pu être créée. Réessayez.'));
      if (httpErrorCode(error) === CONTACT_TAKEN) {
        // La fiche existe : la faire apparaître, pour que l'équipe la choisisse.
        this.intents.done(CREATE_INTENT);
        await this.search(email);
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** « Jeanne Martin », ou le prénom seul d'une fiche invitée. */
  protected nameOf(card: CounterParticularCard): string {
    return `${card.firstName} ${card.lastName}`.trim();
  }

  /** E-mail et téléphone tels que servis — masqués —, et la nature de la fiche. */
  protected detailOf(card: CounterParticularCard): string {
    return [card.maskedEmail, card.maskedPhone, card.connectable ? 'compte' : 'invité']
      .filter((part) => part !== '')
      .join(' · ');
  }

  protected noShowLabel(count: number): string {
    return count > 1 ? `${String(count)} commandes non retirées` : '1 commande non retirée';
  }
}
