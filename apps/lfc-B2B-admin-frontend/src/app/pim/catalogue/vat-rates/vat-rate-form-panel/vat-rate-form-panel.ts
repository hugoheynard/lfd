import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { formatPercent } from '../../../data/channels';
import { type VatRate } from '../../catalogue-api';
import { VatRateStore } from '../vat-store';

/** Charge passée à `open()` : le taux à modifier. Absente = création. */
export interface VatRatePanelData {
  readonly rate: VatRate;
}

/**
 * Panneau **taux de TVA** : création ou modification, ouvert impérativement via
 * `FoldPanelHostService.open()`. Sans `data` il crée ; avec `{ rate }` il
 * modifie, et la **zone dangereuse** de suppression vit au bas du même panneau.
 *
 * Elle avait un mode `delete` à elle, ouvert depuis un menu déroulant du
 * tableau. Deux ouvertures pour un même objet obligeaient à choisir son
 * intention AVANT de voir l'objet — or c'est en le regardant qu'on décide de le
 * supprimer. Le menu a disparu, le mode aussi.
 *
 * La zone dangereuse dit ce qui va vraiment se passer : la base pose un
 * `Restrict`, donc un taux encore visé par une famille n'est pas supprimé, la
 * requête échoue. On le dit avant, et on bloque.
 */
@Component({
  selector: 'app-vat-rate-form-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
  ],
  templateUrl: './vat-rate-form-panel.html',
  styleUrl: './vat-rate-form-panel.scss',
})
export class VatRateFormPanel {
  private readonly store = inject(VatRateStore);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  /** Le taux visé ; absent = création. */
  readonly data = input<VatRatePanelData | undefined>(undefined);

  protected readonly draftName = signal('');
  protected readonly draftDescription = signal('');
  protected readonly draftPercent = signal<number | null>(null);
  /** Saisie de confirmation de suppression (doit égaler le nom du taux). */
  protected readonly confirmName = signal('');
  protected readonly busy = signal(false);
  /** La zone dangereuse reste repliée : on ne supprime pas par inadvertance. */
  protected readonly dangerOpen = signal(false);

  protected readonly rate = computed(() => this.data()?.rate);
  protected readonly isEdit = computed(() => this.rate() !== undefined);

  protected readonly heading = computed(() =>
    this.isEdit() ? 'Modifier le taux' : 'Nouveau taux de TVA',
  );
  protected readonly subtitle = computed(() => 'Un nom et un taux — 5,5 %, 10 %, 20 %.');

  /** La VALEUR du taux visé, formatée : « 5,5 % ». */
  protected readonly percentLabel = computed(() => {
    const target = this.rate();
    return target === undefined ? '—' : formatPercent(target.percent);
  });

  /** Familles ET fiches dérogeantes qui visent ce taux — 0 = suppression sans conséquence. */
  protected readonly usageTotal = computed(() => {
    const target = this.rate();
    return target === undefined
      ? 0
      : Object.values(target.usage).reduce((total, count) => total + count, 0);
  });

  /** Pour supprimer, le nom retapé doit correspondre exactement. */
  protected readonly confirmMatches = computed(() => {
    const target = this.rate();
    return target !== undefined && this.confirmName().trim() === target.name;
  });

  /** Supprimable : aucune famille ne le vise, et le nom est confirmé. */
  protected readonly canDelete = computed(
    () => this.usageTotal() === 0 && this.confirmMatches() && !this.busy(),
  );

  constructor() {
    // Préremplit les champs quand un taux est fourni (modification).
    effect(() => {
      const target = this.rate();
      if (target !== undefined) {
        this.draftName.set(target.name);
        this.draftDescription.set(target.description);
        this.draftPercent.set(target.percent);
      }
    });
  }

  protected get canSubmit(): boolean {
    return this.draftName().trim() !== '' && this.draftPercent() !== null && !this.busy();
  }

  protected async submit(): Promise<void> {
    await this.run(() => this.persist());
  }

  protected async remove(): Promise<void> {
    const target = this.rate();
    if (target === undefined) {
      return;
    }
    await this.run(() => this.store.remove(target.id));
  }

  protected toggleDanger(): void {
    this.dangerOpen.update((open) => !open);
  }

  protected cancel(): void {
    this.ref.close();
  }

  /**
   * Le va-et-vient commun : occupé, panneau fermé si ça passe, toast sinon.
   *
   * Le panneau **reste ouvert** sur un refus, et c'est le point : le message dit
   * pourquoi (« Un taux de TVA existe déjà à 5,5 % »), et le champ est encore là
   * pour corriger. Le message part en toast plutôt qu'en bandeau interne — il
   * s'efface tout seul, alors qu'un bandeau resterait sous les yeux après la
   * correction.
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
    const name = this.draftName().trim();
    const percent = this.draftPercent();
    if (name === '' || percent === null) {
      return;
    }
    const payload = { name, description: this.draftDescription(), percent };
    const target = this.rate();
    if (target === undefined) {
      await this.store.create(payload);
    } else {
      await this.store.update(target.id, payload);
    }
  }
}
