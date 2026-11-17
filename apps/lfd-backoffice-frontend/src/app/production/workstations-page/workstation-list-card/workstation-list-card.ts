import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  inject,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import type { WorkstationProductView, WorkstationView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
} from 'fold-ng';

import { GestureIntents, shownOnce } from '../../../shared/gesture-intents';
import { WorkstationsService } from '../../workstations.service';

/** Un rayon racine et les produits sans poste qu'il porte — « Partir des rayons ». */
interface ShelfSeed {
  readonly id: string;
  readonly name: string;
  readonly unplacedSkus: readonly string[];
}

/**
 * **Les postes du fournil** (plan `fournil/plan-postes-du-fournil.md`, § 3.8) :
 * les ajouter (nommés à l'écran), les renommer, les ordonner, les archiver, et
 * « Partir des rayons ».
 *
 * Chaque geste porte la clé d'une intention : un double clic ne déclare pas
 * deux postes, et un renommage rejoué ne défait pas celui d'un autre. Le
 * sujet de l'intention porte ce que le geste envoie — un autre nom, un autre
 * ordre est un autre geste.
 */
@Component({
  selector: 'app-workstation-list-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
  ],
  templateUrl: './workstation-list-card.html',
  styleUrl: './workstation-list-card.scss',
})
export class WorkstationListCard {
  private readonly api = inject(WorkstationsService);
  private readonly intents = new GestureIntents();

  readonly workstations = input.required<readonly WorkstationView[]>();
  readonly products = input.required<readonly WorkstationProductView[]>();
  readonly canWrite = input.required<boolean>();
  /** Après un geste accepté : le parent relit. */
  readonly changed = output();

  protected readonly newName = signal('');
  /** Les noms en cours d'édition, par poste ; repartent des noms servis à chaque relecture. */
  protected readonly drafts = linkedSignal<ReadonlyMap<string, string>>(
    () => new Map(this.workstations().map((station) => [station.id, station.name])),
  );
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** Les rayons racine des produits, et ceux de leurs produits qui n'ont pas de poste. */
  protected readonly shelfSeeds = computed<readonly ShelfSeed[]>(() => {
    const seeds = new Map<string, { name: string; position: number; skus: string[] }>();
    for (const product of this.products()) {
      const family = product.family;
      if (family === null) {
        continue;
      }
      const root = family.root ?? { id: family.id, name: family.name, position: family.position };
      const seed = seeds.get(root.id) ?? { name: root.name, position: root.position, skus: [] };
      seeds.set(root.id, seed);
      if (product.workstationId === null) {
        seed.skus.push(product.productSku);
      }
    }
    return [...seeds]
      .sort(([, left], [, right]) => left.position - right.position)
      .map(([id, seed]) => ({ id, name: seed.name, unplacedSkus: seed.skus }));
  });

  protected draftOf(id: string): string {
    return this.drafts().get(id) ?? '';
  }

  protected setDraft(id: string, name: string): void {
    this.drafts.update((drafts) => new Map([...drafts, [id, name]]));
  }

  protected renamable(station: WorkstationView): boolean {
    const draft = this.draftOf(station.id).trim();
    return draft !== '' && draft !== station.name;
  }

  protected declare(): Promise<void> {
    const name = this.newName().trim();
    return this.run(async () => {
      await shownOnce(this.intents, `declare:${name}`, (key) => this.api.declare(name, key));
      this.newName.set('');
    }, 'Le poste n’a pas pu être ajouté.');
  }

  protected rename(station: WorkstationView): Promise<void> {
    const name = this.draftOf(station.id).trim();
    return this.run(
      () =>
        shownOnce(this.intents, `rename:${station.id}:${name}`, (key) =>
          this.api.rename(station.id, name, key),
        ),
      'Le poste n’a pas pu être renommé.',
    );
  }

  /** Monte (`-1`) ou descend (`+1`) un poste d'un rang. */
  protected move(index: number, delta: -1 | 1): Promise<void> {
    const ids = this.workstations().map((station) => station.id);
    const target = index + delta;
    const moved = ids[index];
    const swapped = ids[target];
    if (moved === undefined || swapped === undefined) {
      return Promise.resolve();
    }
    ids[index] = swapped;
    ids[target] = moved;
    return this.run(
      () =>
        shownOnce(this.intents, `reorder:${ids.join(',')}`, (key) => this.api.reorder(ids, key)),
      'L’ordre des postes n’a pas pu être enregistré.',
    );
  }

  protected archive(station: WorkstationView): Promise<void> {
    return this.run(
      () =>
        shownOnce(this.intents, `archive:${station.id}`, (key) =>
          this.api.archive(station.id, key),
        ),
      'Le poste n’a pas pu être archivé.',
    );
  }

  /**
   * « Partir des rayons » : un poste par rayon racine — repris s'il porte déjà
   * ce nom —, puis ses produits SANS poste y sont placés. Un produit déjà rangé
   * ne bouge pas : le geste propose un premier jeu, il ne défait rien.
   */
  protected fromShelves(): Promise<void> {
    return this.run(async () => {
      const byName = new Map(this.workstations().map((station) => [station.name, station.id]));
      for (const seed of this.shelfSeeds()) {
        const id =
          byName.get(seed.name) ??
          (await shownOnce(this.intents, `seed:${seed.id}`, (key) =>
            this.api.declare(seed.name, key),
          ));
        if (seed.unplacedSkus.length > 0) {
          await shownOnce(this.intents, `seed-place:${seed.id}:${id}`, (key) =>
            this.api.place({ productSkus: [...seed.unplacedSkus], workstationId: id }, key),
          );
        }
      }
    }, 'Les postes n’ont pas pu être créés depuis les rayons.');
  }

  private async run(gesture: () => Promise<unknown>, fallback: string): Promise<void> {
    if (!this.canWrite() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await gesture();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, fallback));
    } finally {
      this.busy.set(false);
      // Même après un refus : un « Partir des rayons » interrompu a pu créer des postes.
      this.changed.emit();
    }
  }
}
