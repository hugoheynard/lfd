import { inject, Injectable } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import type { WorkshopLine, WorkshopShortcutView } from '@lfd/contracts';

import { WORKSHOP_NARROW } from '../rules/workshop-view';

import { type KeypadData, WorkshopKeypad } from '../workshop-keypad/workshop-keypad';

/**
 * **Ouvre le pavé** et rend la quantité déclarée, ou `null` si on le ferme.
 *
 * Sous le seuil du fournil (`WORKSHOP_NARROW`), le pavé monte du bas, sous le
 * pouce ; au-dessus, il s'ouvre au centre.
 *
 * Le côté se lit AU CLIC, jamais en signal : c'est la largeur de ce moment qui
 * compte (règle « Saisir » du `CLAUDE.md` de la boutique).
 */
@Injectable()
export class WorkshopKeypadOpener {
  private readonly panels = inject(FoldPanelHostService);

  /** Le pavé d'une ligne, prérempli de `preset` — au moins une pièce. */
  openFor(
    line: WorkshopLine,
    preset: number,
    shortcuts: readonly WorkshopShortcutView[],
  ): Promise<number | null> {
    return this.open({
      productName: line.productName,
      preset: Math.max(1, preset),
      remaining: line.remaining,
      container: line.container,
      shortcuts,
      saleUnit: line.saleUnit,
    });
  }

  async open(data: KeypadData): Promise<number | null> {
    const narrow =
      typeof window !== 'undefined' && window.matchMedia?.(WORKSHOP_NARROW).matches === true;
    const ref = this.panels.open<KeypadData, number>(WorkshopKeypad, {
      data,
      side: narrow ? 'bottom' : 'center',
    });
    return (await ref.closed) ?? null;
  }
}
