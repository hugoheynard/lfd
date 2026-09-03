import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { VatOverridePanel, type VatOverridePanelData } from './vat-override-panel';

/**
 * Ce que ces cas tiennent : **le choix ressort du panneau**.
 *
 * Il n'en avait aucun. Le panneau rend un `rateId` à son ouvreur, qui en fait
 * une écriture — si ce `rateId` se perd, la dérogation ne s'enregistre jamais et
 * rien ne le signale : l'écran se referme comme si tout allait bien.
 *
 * On passe par le DOM : c'est le gabarit qui câble la liste et les boutons, et
 * `tsc` ne le lit pas.
 */

function data(over: Partial<VatOverridePanelData> = {}): VatOverridePanelData {
  return {
    contextKey: 'b2b',
    contextLabel: 'B2B',
    rates: [
      {
        id: 'tva_55',
        name: 'Réduit',
        description: '',
        percent: 5.5,
        usage: { takeaway: 0, eatIn: 0 },
      },
      {
        id: 'tva_20',
        name: 'Normal',
        description: '',
        percent: 20,
        usage: { takeaway: 0, eatIn: 0 },
      },
    ],
    inheritedLabel: 'Réduit · 5,5 %',
    current: null,
    ...over,
  };
}

function make(input: VatOverridePanelData) {
  const closes: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [{ provide: FoldPanelRef, useValue: { close: (r: unknown) => closes.push(r) } }],
  });
  const fixture = TestBed.createComponent(VatOverridePanel);
  fixture.componentRef.setInput('data', input);
  fixture.detectChanges();

  const buttonNamed = (label: string): HTMLButtonElement => {
    const found = [...fixture.nativeElement.querySelectorAll('button')].find(
      (node): node is HTMLButtonElement =>
        node instanceof HTMLButtonElement && node.textContent?.trim() === label,
    );
    if (found === undefined) {
      throw new Error(`Bouton « ${label} » introuvable.`);
    }
    return found;
  };

  /** Choisit une option comme le ferait un clic — par le libellé affiché. */
  const pick = async (label: string): Promise<void> => {
    const option = [...fixture.nativeElement.querySelectorAll('[role="option"]')].find(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && (node.textContent ?? '').includes(label),
    );
    if (option === undefined) {
      const seen = [...fixture.nativeElement.querySelectorAll('[role="option"]')]
        .map((n) => (n as HTMLElement).textContent?.trim())
        .join(' | ');
      throw new Error(`Option « ${label} » introuvable. Vues : ${seen}`);
    }
    option.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const openList = async (): Promise<void> => {
    const trigger = fixture.nativeElement.querySelector('fold-listbox button, [role="combobox"]');
    if (trigger instanceof HTMLElement) {
      trigger.click();
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };

  return { fixture, closes, buttonNamed, pick, openList };
}

describe('le panneau de dérogation de TVA rend le taux choisi', () => {
  it('rend le taux que l’on vient de choisir', async () => {
    const { closes, buttonNamed, pick, openList } = make(data());

    await openList();
    await pick('Normal');
    buttonNamed('Appliquer').click();

    expect(closes).toEqual([{ rateId: 'tva_20' }]);
  });

  it('rend `null` quand on revient à l’héritage', async () => {
    const { closes, buttonNamed, pick, openList } = make(data({ current: 'tva_20' }));

    await openList();
    await pick('Hérité de la famille');
    buttonNamed('Appliquer').click();

    expect(closes).toEqual([{ rateId: null }]);
  });

  it('ne rend rien quand on annule', () => {
    const { closes, buttonNamed } = make(data({ current: 'tva_20' }));

    buttonNamed('Annuler').click();

    expect(closes).toEqual([undefined]);
  });
});
