import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { SalesContextAdminView } from '@lfd/pim-contracts';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { SalesContextAdminStore } from '../sales-context-admin.store';

/** Charge passée à `open()` : le contexte à régler. Absente = création. */
export interface SalesContextPanelData {
  readonly context: SalesContextAdminView;
}

/**
 * Panneau **contexte de vente** — ouverture ou réglage, plus la zone dangereuse.
 *
 * Deux champs y sont particuliers, et le panneau doit le DIRE plutôt que de le
 * subir :
 *
 * - la **clé** est une identité que trois tables citent. Saisissable à
 *   l'ouverture, verrouillée ensuite — la renommer serait le chemin en deux
 *   temps vers une autre ligne ;
 * - la **portée** décide de la forme des lignes déjà écrites. Elle se choisit
 *   une fois, a l'ouverture, et se lit ensuite.
 *
 * Le serveur refuse les deux de toute façon. Ce qui se joue ici, c'est de ne pas
 * offrir un geste qui répondrait 409.
 */
@Component({
  selector: 'app-sales-context-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
  ],
  templateUrl: './sales-context-panel.html',
  styleUrl: './sales-context-panel.scss',
})
export class SalesContextPanel {
  private readonly store = inject(SalesContextAdminStore);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input<SalesContextPanelData | undefined>(undefined);

  protected readonly draftKey = signal('');
  protected readonly draftLabel = signal('');
  protected readonly draftSuffix = signal('');
  protected readonly draftActive = signal(true);
  protected readonly draftProjected = signal(false);
  /** Saisie de confirmation de suppression (doit égaler la clé). */
  protected readonly confirmKey = signal('');
  protected readonly busy = signal(false);
  /** La zone dangereuse reste repliée : on ne supprime pas par inadvertance. */
  protected readonly dangerOpen = signal(false);

  protected readonly context = computed(() => this.data()?.context);
  protected readonly isEdit = computed(() => this.context() !== undefined);
  protected readonly isRoot = computed(() => this.context()?.root === true);

  protected readonly heading = computed(() =>
    this.isEdit() ? 'Régler le contexte' : 'Nouveau contexte de vente',
  );

  /** Ce qui retient ce contexte — zéro partout donc suppression sans conséquence. */
  protected readonly held = computed(() => {
    const target = this.context();
    if (target === undefined) {
      return 0;
    }
    return target.soldBy + target.ratedBy + target.offeredByLocations;
  });

  protected readonly heldLabel = computed(() => {
    const target = this.context();
    if (target === undefined) {
      return '';
    }
    return [
      target.soldBy > 0 ? `${String(target.soldBy)} vente(s)` : null,
      target.ratedBy > 0 ? `${String(target.ratedBy)} taux réglé(s)` : null,
      target.offeredByLocations > 0
        ? `${String(target.offeredByLocations)} point(s) de vente`
        : null,
    ]
      .filter((part) => part !== null)
      .join(' · ');
  });

  /** Pour supprimer, la clé retapée doit correspondre exactement. */
  protected readonly confirmMatches = computed(
    () => this.confirmKey().trim() === (this.context()?.key ?? ' '),
  );

  protected readonly canDelete = computed(
    () => !this.isRoot() && this.held() === 0 && this.confirmMatches() && !this.busy(),
  );

  constructor() {
    effect(() => {
      const target = this.context();
      if (target !== undefined) {
        this.draftKey.set(target.key);
        this.draftLabel.set(target.label);
        this.draftSuffix.set(target.handleSuffix);
        this.draftActive.set(target.active);
        this.draftProjected.set(target.shopifyProjected);
      }
    });
  }

  protected get canSubmit(): boolean {
    return this.draftKey().trim() !== '' && this.draftLabel().trim() !== '' && !this.busy();
  }

  protected async submit(): Promise<void> {
    await this.run(() => this.persist());
  }

  protected async remove(): Promise<void> {
    const target = this.context();
    if (target === undefined) {
      return;
    }
    await this.run(() => this.store.remove(target.key));
  }

  protected toggleDanger(): void {
    this.dangerOpen.update((open) => !open);
  }

  protected cancel(): void {
    this.ref.close();
  }

  /**
   * Le va-et-vient commun. Le panneau **reste ouvert** sur un refus : le message
   * dit pourquoi — « on ne change pas la portée d'un contexte après sa
   * création » — et les champs sont encore la pour corriger.
   */
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.ref.close(true);
    } catch (caught) {
      this.notify.refused(caught, 'Opération refusée.');
    } finally {
      this.busy.set(false);
    }
  }

  private async persist(): Promise<void> {
    const target = this.context();
    if (target === undefined) {
      await this.store.create({
        key: this.draftKey().trim(),
        label: this.draftLabel().trim(),
        handleSuffix: this.draftSuffix().trim(),
        active: this.draftActive(),
        shopifyProjected: this.draftProjected(),
      });
      return;
    }
    await this.store.update(target.key, {
      label: this.draftLabel().trim(),
      handleSuffix: this.draftSuffix().trim(),
      active: this.draftActive(),
      shopifyProjected: this.draftProjected(),
      position: target.position,
    });
  }
}
