import {
  type CdkDragDrop,
  CdkDrag,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';
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
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { GestureIntents, shownOnce } from '../../../shared/gesture-intents';
import { WorkstationsService } from '../../workstations.service';
import { ReorderHandle, type ReorderStep } from '../reorder-handle/reorder-handle';

/** Au toucher, un appui long avant de saisir : le doigt fait d'abord défiler. */
const DRAG_START_DELAY = { touch: 250, mouse: 0 } as const;

/** Un rayon racine et les produits sans poste qu'il porte — « Partir des rayons ». */
interface ShelfSeed {
  readonly id: string;
  readonly name: string;
  readonly unplacedSkus: readonly string[];
}

/**
 * **Les postes du fournil** (`documentation/fournil/les-postes-du-fournil.md`, § 3.8) :
 * les ajouter (nommés à l'écran), les renommer, les ordonner — chaque poste est
 * une carte qu'on glisse par sa poignée, ou qu'on déplace au clavier par les
 * flèches sur celle-ci —, les archiver, et « Partir des rayons ».
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
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    CdkDropList,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
    ReorderHandle,
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
  /** « Produits du poste » : la page ouvre l'onglet des produits sur ce poste. */
  readonly openProducts = output<string>();
  /** « Organiser les lignes » : la page ouvre la pile de ce poste. */
  readonly openStack = output<string>();

  protected readonly dragDelay = DRAG_START_DELAY;

  /** Les postes servis, puis l'ordre qu'on vient d'envoyer, le temps que la relecture arrive. */
  protected readonly stations = linkedSignal<readonly WorkstationView[]>(() => this.workstations());
  /** Lu par les lecteurs d'écran (`aria-live`) après chaque déplacement. */
  protected readonly announcement = signal('');

  protected readonly newName = signal('');
  /** Le popover « Ajouter un poste » — public pour que la spec joue le geste sans le DOM projeté. */
  readonly addOpen = signal(false);
  /** Le nombre de produits rangés à chaque poste — la ligne secondaire de sa carte. */
  protected readonly counts = computed<ReadonlyMap<string, number>>(() => {
    const counts = new Map<string, number>();
    for (const product of this.products()) {
      if (product.workstationId !== null) {
        counts.set(product.workstationId, (counts.get(product.workstationId) ?? 0) + 1);
      }
    }
    return counts;
  });

  protected countLabel(id: string): string {
    const count = this.counts().get(id) ?? 0;
    return count === 0 ? 'Aucun produit' : count === 1 ? '1 produit' : `${String(count)} produits`;
  }

  /** Le poste dont le popover « Renommer » est ouvert — public pour que la spec joue le geste. */
  readonly renaming = signal<string | null>(null);
  /** Le nom en cours d'édition dans ce popover, reparti du nom servi à l'ouverture. */
  readonly renameDraft = signal('');
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

  /** Ouvre (ou ferme) le popover « Renommer » d'un poste, prérempli de son nom. */
  setRenaming(station: WorkstationView, open: boolean): void {
    if (open) {
      this.renameDraft.set(station.name);
      this.renaming.set(station.id);
    } else if (this.renaming() === station.id) {
      this.renaming.set(null);
    }
  }

  protected renamable(station: WorkstationView): boolean {
    const draft = this.renameDraft().trim();
    return draft !== '' && draft !== station.name;
  }

  protected declare(): Promise<void> {
    const name = this.newName().trim();
    return this.run(async () => {
      await shownOnce(this.intents, `declare:${name}`, (key) => this.api.declare(name, key));
      this.newName.set('');
      this.addOpen.set(false);
    }, 'Le poste n’a pas pu être ajouté.');
  }

  rename(station: WorkstationView): Promise<void> {
    const name = this.renameDraft().trim();
    return this.run(async () => {
      await shownOnce(this.intents, `rename:${station.id}:${name}`, (key) =>
        this.api.rename(station.id, name, key),
      );
      this.renaming.set(null);
    }, 'Le poste n’a pas pu être renommé.');
  }

  /** Monte (`-1`) ou descend (`+1`) un poste d'un rang — les flèches sur sa poignée. */
  protected move(index: number, delta: ReorderStep): Promise<void> {
    return this.moveTo(index, index + delta);
  }

  protected dropped(event: CdkDragDrop<unknown>): Promise<void> {
    return this.moveTo(event.previousIndex, event.currentIndex);
  }

  /** Envoie l'ordre complet, par intention ; un refus remet l'ordre d'avant. */
  private async moveTo(from: number, to: number): Promise<void> {
    const current = this.stations();
    const moved = current[from];
    if (moved === undefined || from === to || to < 0 || to >= current.length) {
      return;
    }
    if (!this.canWrite() || this.busy()) {
      return;
    }
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, moved);
    const ids = next.map((station) => station.id);
    this.stations.set(next);
    await this.run(
      () =>
        shownOnce(this.intents, `reorder:${ids.join(',')}`, (key) => this.api.reorder(ids, key)),
      'L’ordre des postes n’a pas pu être enregistré.',
    );
    if (this.refusal() === null) {
      this.announcement.set(
        `« ${moved.name} » est maintenant en place ${String(to + 1)} sur ${String(next.length)}.`,
      );
    } else {
      this.stations.set(current);
      this.announcement.set('Le déplacement n’a pas été enregistré.');
    }
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
