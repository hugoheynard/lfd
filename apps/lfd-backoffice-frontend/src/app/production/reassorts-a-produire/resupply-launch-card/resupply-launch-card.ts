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

import { parisClock, resupplyTitle } from '../../../shared/resupply-labels';
import { type ResupplyStep, resupplySteps } from '../../../shared/resupply-steps';
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';
import { resupplyLaunchRows, type ResupplyLaunchRow } from './resupply-launch-rows';

/**
 * **« Lancer »** un réassort « au plus tôt » (R4a,
 * `reassort-boutiques/plan-au-plus-tot.md`, Hugo 2026-10-22 : le fournil lance,
 * pas de lancement automatique). Lancé, le réassort entre au plan du jour et
 * compte dans les fournées ; le comptoir ne peut plus l'annuler.
 *
 * Un réassort par ligne : le point, son nom (R1g), les pièces. Le bouton est
 * sous `production_resupply:write` (`canLaunch`), le droit de la route ; sans
 * lui, la carte se lit. « Lancé par X à HH:MM » suit le fait du fournil :
 * l'affichage peut arriver un instant après le geste.
 *
 * Depuis R4d (2026-10-22), un réassort lancé dit aussi où il en est :
 * « Parti » (sa tournée, Village) puis « Arrivé » (transfert reçu, ou
 * « Monté » au Labo), avec l'heure et l'auteur quand on les a.
 */
@Component({
  selector: 'app-resupply-launch-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldStatusBadgeComponent,
  ],
  templateUrl: './resupply-launch-card.html',
  styleUrl: './resupply-launch-card.scss',
})
export class ResupplyLaunchCard {
  private readonly service = inject(BakehouseResuppliesService);

  readonly view = input.required<ResupplyProductionDayView>();
  readonly canLaunch = input.required<boolean>();
  /** Un « Lancer » a réussi : l'onglet relit. */
  readonly launched = output();

  protected readonly rows = computed(() => resupplyLaunchRows(this.view()));
  protected readonly pending = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);
  /**
   * Lancés depuis ce poste : le serveur a accepté, mais l'affichage « lancé »
   * suit le fait du fournil et peut manquer à la relecture qui suit. Sans
   * ça, « Lancer » réapparaîtrait et un second clic serait refusé (409).
   */
  protected readonly launchedHere = signal<ReadonlySet<string>>(new Set<string>());

  protected titleOf(row: ResupplyLaunchRow): string {
    return resupplyTitle(row.name, row.siteLabel, row.siteLabel);
  }

  protected launchedLine(row: ResupplyLaunchRow): string {
    const at = row.launchedAt === null ? '' : ` à ${parisClock(row.launchedAt)}`;
    return `Lancé${row.launchedBy === null ? '' : ` par ${row.launchedBy}`}${at}`;
  }

  /** Les étapes atteintes APRÈS le lancement : parti, arrivé. */
  protected laterSteps(row: ResupplyLaunchRow): readonly ResupplyStep[] {
    return resupplySteps(row).filter((step) => step.key === 'departed' || step.key === 'arrived');
  }

  protected async launch(row: ResupplyLaunchRow): Promise<void> {
    if (this.pending() !== null) {
      return;
    }
    this.pending.set(row.resupplyId);
    this.failure.set(null);
    try {
      await this.service.launch(this.view().serviceDay, row.resupplyId);
      this.launchedHere.update((ids) => new Set([...ids, row.resupplyId]));
      this.launched.emit();
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le réassort n'a pas pu être lancé."));
    } finally {
      this.pending.set(null);
    }
  }
}
