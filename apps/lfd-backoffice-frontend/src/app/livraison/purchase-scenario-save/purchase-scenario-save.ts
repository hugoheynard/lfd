import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type {
  PurchaseScenarioDisplay,
  PurchaseTablePayload,
  SavePurchaseScenarioPayload,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { PurchaseScenariosService } from '../purchase-scenarios.service';

/** Le scénario dont vient la sélection à l'écran. */
export interface CurrentPurchaseScenario {
  readonly id: string;
  readonly name: string;
}

/**
 * **Enregistrer la sélection du tableau** (`plan-bibliotheque-d-achat.md`,
 * B-D5) : « Enregistrer comme scénario » sous un nom, ou « Remplacer » le
 * scénario ouvert. Affiché seulement sous `delivery_rounds:write` — c'est le
 * tableau qui en décide. Le nom, ses bornes et son unicité sont tenus par le
 * serveur : son refus s'affiche tel quel.
 */
@Component({
  selector: 'app-purchase-scenario-save',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
  ],
  templateUrl: './purchase-scenario-save.html',
  styleUrl: './purchase-scenario-save.scss',
})
export class PurchaseScenarioSave {
  private readonly scenarios = inject(PurchaseScenariosService);
  private readonly notify = inject(NotifyService);

  /** La sélection à garder ; `null` tant qu'il manque un véhicule ou un format. */
  readonly selection = input.required<PurchaseTablePayload | null>();
  readonly display = input.required<PurchaseScenarioDisplay>();
  readonly current = input<CurrentPurchaseScenario | null>(null);

  readonly saved = output<CurrentPurchaseScenario>();

  protected readonly formOpen = signal(false);
  protected readonly name = signal('');
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected openForm(): void {
    this.name.set('');
    this.refusal.set(null);
    this.formOpen.set(true);
  }

  protected async saveAs(): Promise<void> {
    const name = this.name().trim();
    await this.write(name, (payload) => this.scenarios.create(payload));
  }

  protected async replace(): Promise<void> {
    const current = this.current();
    if (current === null) return;
    await this.write(current.name, (payload) =>
      this.scenarios.replace(current.id, payload).then(() => current.id),
    );
  }

  private async write(
    name: string,
    send: (payload: SavePurchaseScenarioPayload) => Promise<string>,
  ): Promise<void> {
    const selection = this.selection();
    if (selection === null || this.saving()) return;
    this.saving.set(true);
    this.refusal.set(null);
    try {
      const id = await send({ name, selection, display: this.display() });
      this.formOpen.set(false);
      this.notify.success(`Scénario « ${name} » enregistré.`);
      this.saved.emit({ id, name });
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le scénario n’a pas pu être enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }
}
