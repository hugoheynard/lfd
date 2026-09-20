import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { ClientCopyService } from '../../../copy/client-copy.service';
import type { CompletionItem, CompletionTarget } from '../completion-items';

/**
 * **L'encart « à compléter » d'une carte** de Mon compte : les éléments de
 * CETTE carte, et un geste par dialogue — le même que la synthèse du haut.
 *
 * La même forme que les mentions manquantes du mandat (`MandateBlockers`) : un
 * encart d'avertissement inset, une phrase, une liste, les gestes à droite.
 * Deux encarts voisins qui disent la même sorte de chose ne se dessinent pas
 * deux fois.
 *
 * Il n'ouvre rien lui-même : il émet la cible, et la page ouvre le dialogue —
 * un seul endroit sait quel dialogue va avec quelle cible.
 */
@Component({
  selector: 'app-completion-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './completion-callout.html',
  styleUrl: './completion-callout.scss',
})
export class CompletionCallout {
  /** Les éléments de la carte — vide, l'encart ne s'affiche pas. */
  readonly items = input.required<readonly CompletionItem[]>();

  /** Le client demande à compléter : la cible du dialogue à ouvrir. */
  readonly act = output<CompletionTarget>();

  protected readonly t = inject(ClientCopyService).t;

  /** Un geste par dialogue : la TVA et l'identité ouvrent le même, un seul bouton suffit. */
  protected readonly gestures = computed(() => {
    const seen = new Set<CompletionTarget>();
    return this.items().filter((item) => {
      if (item.action === '' || seen.has(item.target)) {
        return false;
      }
      seen.add(item.target);
      return true;
    });
  });
}
