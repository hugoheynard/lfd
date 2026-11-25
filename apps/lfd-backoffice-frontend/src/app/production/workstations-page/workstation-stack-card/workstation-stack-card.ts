import { type CdkDragDrop, CdkDrag, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import type { WorkstationProductView, WorkstationView } from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { GestureIntents, shownOnce } from '../../../shared/gesture-intents';
import { WorkstationsService } from '../../workstations.service';
import { ReorderHandle, type ReorderStep } from '../reorder-handle/reorder-handle';

/** Le refus d'une pile périmée : la liste envoyée n'est plus celle du poste. */
export const ORDER_MISMATCH = 'production.workstation.order_mismatch';

/** Au toucher, un appui long avant de saisir : le doigt fait d'abord défiler. */
const DRAG_START_DELAY = { touch: 250, mouse: 0 } as const;

/**
 * La pile d'un poste : ses produits qui ont une place, du plus petit rang au
 * plus grand, puis ceux sans place dans l'ordre reçu (celui du catalogue).
 */
export function stackOf(
  products: readonly WorkstationProductView[],
  workstationId: string,
): readonly WorkstationProductView[] {
  const mine = products.filter((product) => product.workstationId === workstationId);
  const placed = mine
    .filter((product) => product.position !== null)
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  return [...placed, ...mine.filter((product) => product.position === null)];
}

function nameOf(product: WorkstationProductView): string {
  return product.productName ?? product.variants[0]?.variantName ?? product.productSku;
}

/**
 * **La pile d'un poste** (`documentation/fournil/les-postes-du-fournil.md`,
 * « La pile d'un poste ») : l'ordre dans lequel un poste voit ses produits en
 * mode prod. On choisit un poste, puis on déplace ses produits — de petites
 * cartes — par glisser-déposer, ou au clavier par les flèches sur leur poignée. Chaque
 * déplacement envoie la pile entière, par intention ; le parent relit ensuite.
 */
@Component({
  selector: 'app-workstation-stack-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDragPlaceholder,
    CdkDropList,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    ReorderHandle,
  ],
  templateUrl: './workstation-stack-card.html',
  styleUrl: './workstation-stack-card.scss',
})
export class WorkstationStackCard {
  private readonly api = inject(WorkstationsService);
  private readonly intents = new GestureIntents();

  readonly workstations = input.required<readonly WorkstationView[]>();
  readonly products = input.required<readonly WorkstationProductView[]>();
  readonly canWrite = input.required<boolean>();
  /** Après un geste (accepté ou refusé) : le parent relit. */
  readonly changed = output();

  protected readonly dragDelay = DRAG_START_DELAY;

  /** Le poste choisi ; reste le même à la relecture tant qu'il existe, sinon le premier. */
  protected readonly selected = linkedSignal<readonly WorkstationView[], string | null>({
    source: () => this.workstations(),
    computation: (stations, previous) => {
      const kept = previous?.value;
      if (kept != null && stations.some((station) => station.id === kept)) {
        return kept;
      }
      return stations[0]?.id ?? null;
    },
  });

  protected readonly options = computed<readonly FoldSelectOption<string>[]>(() =>
    this.workstations().map((station) => ({ value: station.id, label: station.name })),
  );

  /** La pile servie, puis celle qu'on vient d'envoyer, le temps que la relecture arrive. */
  protected readonly stack = linkedSignal<readonly WorkstationProductView[]>(() => {
    const id = this.selected();
    return id === null ? [] : stackOf(this.products(), id);
  });

  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);
  /** Lu par les lecteurs d'écran (`aria-live`) après chaque déplacement. */
  protected readonly announcement = signal('');

  protected readonly nameOf = nameOf;

  protected select(id: string | null): void {
    this.selected.set(id);
    this.refusal.set(null);
    this.announcement.set('');
  }

  /** Monte (`-1`) ou descend (`+1`) un produit d'une place — les flèches sur sa poignée. */
  protected move(index: number, delta: ReorderStep): Promise<void> {
    return this.moveTo(index, index + delta);
  }

  protected dropped(event: CdkDragDrop<unknown>): Promise<void> {
    return this.moveTo(event.previousIndex, event.currentIndex);
  }

  private async moveTo(from: number, to: number): Promise<void> {
    const id = this.selected();
    const current = this.stack();
    const moved = current[from];
    if (
      id === null ||
      moved === undefined ||
      from === to ||
      to < 0 ||
      to >= current.length ||
      !this.canWrite() ||
      this.busy()
    ) {
      return;
    }
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, moved);
    const skus = next.map((product) => product.productSku);
    this.busy.set(true);
    this.refusal.set(null);
    this.stack.set(next);
    try {
      await shownOnce(this.intents, `stack:${id}:${skus.join(',')}`, (key) =>
        this.api.reorderProducts(id, skus, key),
      );
      this.announcement.set(
        `« ${nameOf(moved)} » est maintenant en place ${String(to + 1)} sur ${String(next.length)}.`,
      );
    } catch (error) {
      this.stack.set(current);
      this.refusal.set(
        httpErrorCode(error) === ORDER_MISMATCH
          ? 'La pile de ce poste a changé entre-temps : elle vient d’être relue. Refaites le déplacement.'
          : httpErrorMessage(error, 'L’ordre de la pile n’a pas pu être enregistré.'),
      );
      this.announcement.set('Le déplacement n’a pas été enregistré.');
    } finally {
      this.busy.set(false);
      this.changed.emit();
    }
  }
}
