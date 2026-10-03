import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FoldButtonComponent, FoldElementTitleComponent } from 'fold-ng';

import { stopHue } from '../delivery-loading-floor';
import type { StackTile } from '../delivery-loading-rows';
import {
  type TileColumn,
  tileAriaLabel,
  type TileState,
  tileState,
} from '../delivery-loading-tiles';

/**
 * **La rangée vue des portes** — comme le livreur la voit, debout à l'arrière
 * du véhicule : une colonne par pile, de gauche à droite, et dans chacune les
 * bacs du bas vers le haut, posés sur le plancher.
 *
 * Trois états lisibles sans la couleur : pointillé (à charger), plein + ✓
 * (chargé), cerclé (à poser maintenant). Le numéro d'arrêt est toujours
 * écrit. Toucher un bac à charger le DÉSIGNE comme prochain ; toucher un bac
 * chargé offre de le DÉCHARGER, sous la rangée. L'écran décide du reste.
 */
@Component({
  selector: 'app-loading-row-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldElementTitleComponent],
  templateUrl: './loading-row-view.html',
  styleUrl: './loading-row-view.scss',
})
export class LoadingRowView {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly columns = input.required<readonly TileColumn[]>();
  /** La clé du bac à poser maintenant, ou `null`. */
  readonly nextKey = input<string | null>(null);
  /** Toucher une tuile la désigne ; `false` : lecture seule. */
  readonly canPick = input(false);
  /** Le poste fixe du dépôt dessine plus grand. */
  readonly size = input<'phone' | 'depot'>('phone');

  /** La clé du bac désigné d'un toucher. */
  readonly picked = output<string>();
  /** Le bac (ou la moitié) à décharger, par son identifiant. */
  readonly unload = output<string>();

  /** La tuile chargée touchée : ses bacs se proposent au déchargement. */
  protected readonly chosen = signal<string | null>(null);
  protected readonly chosenTile = computed(() => {
    const key = this.chosen();
    const tile = this.columns()
      .flatMap((column) => column.tiles)
      .find((candidate) => candidate.key === key);
    return tile === undefined || !this.canPick() ? null : tile.bins.filter((bin) => bin.loaded);
  });

  protected state(tile: StackTile): TileState {
    return tileState(tile, this.nextKey());
  }

  protected label(tile: StackTile): string {
    return tileAriaLabel(tile, this.state(tile), this.canPick());
  }

  protected stops(tile: StackTile): string {
    return tile.stopPositions.map(String).join('·');
  }

  protected codes(tile: StackTile): string {
    return tile.bins.map((bin) => bin.code).join(' · ');
  }

  /** Les deux teintes d'une tuile : une par moitié d'un bac partagé, la même sinon. */
  protected hues(tile: StackTile): string {
    const first = tile.stopPositions[0] ?? 1;
    const second = tile.stopPositions[1] ?? first;
    return `hue-a-${String(stopHue(first))} hue-b-${String(stopHue(second))}`;
  }

  protected pick(tile: StackTile): void {
    if (!this.canPick()) {
      return;
    }
    const pending = tile.bins.find((bin) => !bin.loaded);
    if (pending !== undefined) {
      this.chosen.set(null);
      this.picked.emit(pending.key);
    } else {
      this.chosen.update((key) => (key === tile.key ? null : tile.key));
    }
  }

  protected unloadBin(binId: string): void {
    this.chosen.set(null);
    this.unload.emit(binId);
  }
}
