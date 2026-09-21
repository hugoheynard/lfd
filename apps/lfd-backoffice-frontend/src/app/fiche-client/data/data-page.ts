import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FoldButtonComponent, FoldEmptyStateComponent, FoldLoadingStateComponent } from 'fold-ng';
import type { CustomerSheetView } from '@lfd/contracts';

import { CustomerSheetService } from '../../commercial/calendrier/customer-sheet/customer-sheet.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Une ligne de journal, mise en forme. */
interface JournalRow {
  readonly id: string;
  readonly type: string;
  readonly when: string;
  readonly actor: string;
}

/** Une donnée d'identité technique du compte. */
interface Fact {
  readonly label: string;
  readonly value: string;
}

/**
 * Le **repli** quand on ne sait pas qui : la nature de l'acteur, qui reste
 * vraie. Les événements journalisés depuis la trace nominative portent un nom ;
 * les anciens, non — et « un membre du staff » vaut mieux qu'un nom inventé ou
 * qu'un `sub` technique au milieu d'une phrase.
 */
const ACTOR_LABEL: Record<string, string> = {
  customer: 'le client',
  staff: 'un membre du staff',
  system: 'le système',
};

/**
 * **Données** d'un compte : ce que le système sait de lui.
 *
 * Volontairement brut — c'est la page qu'on ouvre quand un chiffre paraît faux
 * ailleurs, pour voir d'où il vient. Le **journal** y est intégral (dans la
 * limite de ce que la fiche remonte) et non filtré aux seuls événements
 * commerciaux, contrairement à l'historique du tableau de bord : ici on cherche
 * une trace, pas une lecture.
 */
@Component({
  selector: 'app-client-data-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldEmptyStateComponent, FoldLoadingStateComponent],
  templateUrl: './data-page.html',
  styleUrl: './data-page.scss',
})
export class ClientDataPage {
  readonly id = input.required<string>();

  private readonly api = inject(CustomerSheetService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly sheet = signal<CustomerSheetView | null>(null);

  /** L'identité technique — ce qu'on donne au support quand quelque chose cloche. */
  protected readonly facts = computed<readonly Fact[]>(() => {
    const view = this.sheet();
    if (view === null) {
      return [];
    }
    return [
      { label: 'Identifiant', value: view.companyId },
      { label: 'Référence', value: view.reference },
      { label: 'Code NAF', value: view.nafCode === '' ? '—' : view.nafCode },
      { label: 'Statut', value: view.status },
      { label: 'Inscription', value: isoDay(view.createdAt) },
      {
        label: 'Activation',
        value: view.activatedAt === null ? 'jamais activée' : isoDay(view.activatedAt),
      },
    ];
  });

  protected readonly journal = computed<readonly JournalRow[]>(() =>
    (this.sheet()?.timeline ?? []).map((entry) => ({
      id: entry.id,
      type: entry.type,
      when: new Date(entry.occurredAt).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      // Le nom d'abord — c'est ce qu'on cherche quand on ouvre un journal :
      // à qui parler de cette ligne.
      actor:
        entry.actorName === ''
          ? (ACTOR_LABEL[entry.actorType] ?? entry.actorType)
          : entry.actorName,
    })),
  );

  constructor() {
    // Un `input` de route n'est **pas encore lié** dans le constructeur : le lire
    // ici lève NG0950, et le `catch` en dessous transformait la panne en écran
    // d'erreur muet. L'effet attend la liaison — et rejoue tout seul quand on
    // passe d'un compte à l'autre sans quitter la page (le composant est réutilisé).
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(id: string = this.id()): Promise<void> {
    this.state.set('loading');
    try {
      this.sheet.set(await this.api.sheet(id));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}

/** `2026-08-09T…` → `09/08/2026`. */
function isoDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}
