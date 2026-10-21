import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ResupplyProductionDayView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldStatusBadgeComponent,
} from 'fold-ng';

import { parisClock, RESUPPLY_TARGET_LABELS, resupplyTitle } from '../../../shared/resupply-labels';
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';
import { resupplyMountRows, type ResupplyMountRow } from './resupply-mount-rows';

/**
 * **« Monté »** — le signal du fournil au comptoir d'un point servi sur place
 * (lot R3e, `reassort-boutiques/plan-reapprovisionnement.md`, Hugo
 * 2026-10-21 : « comment le fournil dit à la boutique Labo : je t'envoie
 * ça ? »). Le même signal que la réception du transfert au Village : le
 * réassort passe à « arrivé » et la cloche sonne au comptoir.
 *
 * Un réassort par ligne : le point, son nom (R1g), la visée, les pièces. Le
 * bouton est sous `production_resupply:write` (`canMount`), le droit de la
 * route ; sans lui, la carte se lit.
 */
@Component({
  selector: 'app-resupply-mount-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldStatusBadgeComponent,
  ],
  templateUrl: './resupply-mount-card.html',
  styleUrl: './resupply-mount-card.scss',
})
export class ResupplyMountCard {
  private readonly service = inject(BakehouseResuppliesService);

  readonly view = input.required<ResupplyProductionDayView>();
  readonly canMount = input.required<boolean>();
  /** Un « Monté » a réussi : l'onglet relit. */
  readonly mounted = output();

  protected readonly rows = computed(() => resupplyMountRows(this.view()));
  protected readonly targetLabels = RESUPPLY_TARGET_LABELS;
  protected readonly pending = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);

  protected titleOf(row: ResupplyMountRow): string {
    return resupplyTitle(row.name, row.siteLabel, row.siteLabel);
  }

  protected arrivedLine(row: ResupplyMountRow): string {
    const at = row.arrivedAt === null ? '' : ` à ${parisClock(row.arrivedAt)}`;
    return `Monté${row.arrivedBy === null ? '' : ` par ${row.arrivedBy}`}${at}`;
  }

  protected async mount(row: ResupplyMountRow): Promise<void> {
    if (this.pending() !== null) {
      return;
    }
    this.pending.set(row.resupplyId);
    this.failure.set(null);
    try {
      await this.service.mounted(row.siteId, row.resupplyId);
      this.mounted.emit();
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "« Monté » n'a pas pu être enregistré."));
    } finally {
      this.pending.set(null);
    }
  }
}
