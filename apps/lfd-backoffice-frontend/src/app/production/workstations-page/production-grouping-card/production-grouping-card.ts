import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ProductionDisplayView, ProductionGrouping } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { blobRefusalMessage } from '../../../shared/download/blob-refusal';
import { ProductionSettingsService } from '../../production-settings.service';
import { WorkstationsService } from '../../workstations.service';

const MODE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'shelf', label: 'Mode boutique' },
  { value: 'workstation', label: 'Mode prod' },
];

/**
 * **Le rangement du fournil, et ses deux simulations** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.9 et § 3.11).
 *
 * Passer en mode prod demande une confirmation qui donne le compte des
 * produits commandés sans poste ; le serveur, lui, ne refuse que la bascule à
 * vide, et son refus s'affiche tel quel. Les simulations ouvrent le PDF du
 * catalogue rangé dans chaque mode, quel que soit le réglage.
 */
@Component({
  selector: 'app-production-grouping-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './production-grouping-card.html',
  styleUrl: './production-grouping-card.scss',
})
export class ProductionGroupingCard {
  private readonly settings = inject(ProductionSettingsService);
  private readonly workstations = inject(WorkstationsService);

  /** Le réglage servi ; `null` : il n'a pas pu être lu, ou n'est pas permis. */
  readonly display = input.required<ProductionDisplayView | null>();
  /** Les produits commandés ces jours-ci sans poste : le compte de la confirmation. */
  readonly unplacedOrdered = input.required<number>();
  readonly canWrite = input.required<boolean>();
  /** Le réglage est-il permis en lecture ? Sinon la carte ne garde que les simulations. */
  readonly canRead = input.required<boolean>();
  /** Après une bascule acceptée : le parent relit. */
  readonly saved = output();

  protected readonly mode = computed<ProductionGrouping>(() => this.display()?.grouping ?? 'shelf');
  /** La bascule vers le mode prod, en attente de confirmation. */
  protected readonly confirming = signal(false);
  protected readonly shown = computed(() => (this.confirming() ? 'workstation' : this.mode()));
  protected readonly busy = signal(false);
  /** Les deux modes ; désarmés sans le droit, ou pendant l'envoi. */
  protected readonly modeOptions = computed<readonly FoldViewToggleOption[]>(() =>
    MODE_OPTIONS.map((option) => ({ ...option, disabled: !this.canWrite() || this.busy() })),
  );
  protected readonly refusal = signal<string | null>(null);

  protected readonly simulating = signal<ProductionGrouping | null>(null);
  protected readonly simulationRefusal = signal<string | null>(null);
  /** Le navigateur a bloqué l'onglet : un lien de téléchargement à la place. */
  protected readonly blockedPdf = signal<{ url: string; fileName: string } | null>(null);
  private objectUrl: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  protected choose(value: string): void {
    const wanted: ProductionGrouping = value === 'workstation' ? 'workstation' : 'shelf';
    this.refusal.set(null);
    if (wanted === this.mode()) {
      this.confirming.set(false);
      return;
    }
    if (wanted === 'workstation' && this.unplacedOrdered() > 0) {
      this.confirming.set(true);
      return;
    }
    void this.save(wanted);
  }

  protected confirm(): void {
    void this.save('workstation');
  }

  protected cancel(): void {
    this.confirming.set(false);
  }

  private async save(grouping: ProductionGrouping): Promise<void> {
    const display = this.display();
    if (display === null || !this.canWrite() || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.settings.saveDisplay({ showSubcategories: display.showSubcategories, grouping });
      this.confirming.set(false);
      this.saved.emit();
    } catch (error) {
      this.confirming.set(false);
      this.refusal.set(httpErrorMessage(error, 'Le rangement n’a pas pu être enregistré.'));
    } finally {
      this.busy.set(false);
    }
  }

  /** Ouvre le catalogue simulé dans ce mode, dans un nouvel onglet. */
  protected async simulate(mode: ProductionGrouping): Promise<void> {
    if (this.simulating() !== null) {
      return;
    }
    this.simulating.set(mode);
    this.simulationRefusal.set(null);
    this.blockedPdf.set(null);
    try {
      const blob = await this.workstations.simulationPdf(mode);
      this.revoke();
      const url = URL.createObjectURL(blob);
      this.objectUrl = url;
      if (window.open(url, '_blank') === null) {
        const fileName = `simulation-${mode === 'shelf' ? 'boutique' : 'prod'}.pdf`;
        this.blockedPdf.set({ url, fileName });
      }
    } catch (error) {
      this.simulationRefusal.set(await blobRefusalMessage(error));
    } finally {
      this.simulating.set(null);
    }
  }

  private revoke(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
