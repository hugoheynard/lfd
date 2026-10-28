import { inject, Injectable } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import type { WorkshopLine, WorkshopShortcutView } from '@lfd/contracts';

import { type KeypadData, WorkshopKeypad } from './workshop-keypad/workshop-keypad';

/**
 * Le seuil du fournil (`fiche-atelier.ts`, `WORKSHOP_NARROW`) : en dessous, le
 * pavé monte du bas, sous le pouce ; au-dessus, il s'ouvre au centre.
 */
const NARROW = '(max-width: 1023px)';

/**
 * **Ouvre le pavé** et rend la quantité déclarée, ou `null` si on le ferme.
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
    });
  }

  async open(data: KeypadData): Promise<number | null> {
    const narrow = typeof window !== 'undefined' && window.matchMedia?.(NARROW).matches === true;
    const ref = this.panels.open<KeypadData, number>(WorkshopKeypad, {
      data,
      side: narrow ? 'bottom' : 'center',
    });
    return (await ref.closed) ?? null;
  }
}
