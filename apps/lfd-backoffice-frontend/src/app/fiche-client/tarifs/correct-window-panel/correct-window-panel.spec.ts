import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { CorrectMercurialeWindowPayload, PosedMercurialeView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { businessDayStart } from '../../../shared/business-day';
import { parisToday } from '../../../shared/paris-today';
import { CompanyPricingService } from '../company-pricing.service';
import { CorrectWindowPanel } from './correct-window-panel';

/**
 * « Corriger les dates » d'une mercuriale à venir : les jours saisis partent
 * en minuit à Paris, avec le motif et le dernier avenant vu ; un refus du
 * serveur reste dans le panneau, en clair ; un succès ferme sur `true`.
 */

const DAY = 86_400_000;
/** Une mercuriale à venir : dans un mois, comparée à l'horloge, donc relative. */
const IN_A_MONTH = parisToday(new Date(Date.now() + 30 * DAY));
const IN_TWO_MONTHS = parisToday(new Date(Date.now() + 60 * DAY));

const MERCURIALE: PosedMercurialeView = {
  id: 'merc_1',
  label: 'Mercuriale 2026',
  validFrom: businessDayStart(IN_A_MONTH) ?? '',
  validTo: null,
  status: 'scheduled',
  ruleCount: 1,
  skuCount: 1,
  createdBy: 'staff_1',
  createdByName: 'Marie Curie',
  lines: [],
  latestAmendmentId: 'amd_7',
};

class FakePricing {
  readonly sent: CorrectMercurialeWindowPayload[] = [];
  readonly keys: string[] = [];
  refuse: unknown = null;
  correctWindow(
    _companyId: string,
    _mercurialeId: string,
    payload: CorrectMercurialeWindowPayload,
    intentKey: string,
  ): Promise<void> {
    this.sent.push(payload);
    this.keys.push(intentKey);
    return this.refuse === null ? Promise.resolve() : Promise.reject(this.refuse);
  }
}

async function render(api: FakePricing) {
  const closedWith: (boolean | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [CorrectWindowPanel],
    providers: [
      { provide: CompanyPricingService, useValue: api },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<boolean>(1, (result) => closedWith.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(CorrectWindowPanel);
  fixture.componentRef.setInput('data', { companyId: 'co_1', mercuriale: MERCURIALE });
  await fixture.whenStable();
  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const type = async (selector: string, value: string): Promise<void> => {
    const field = element().querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    if (field === null) {
      throw new Error(`Champ introuvable : ${selector}`);
    }
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
  };
  const submit = async (): Promise<void> => {
    element().querySelector<HTMLButtonElement>('[data-correct-submit]')?.click();
    await fixture.whenStable();
  };
  return { closedWith, element, type, submit };
}

describe('CorrectWindowPanel', () => {
  it('dit que le geste ne vaut que tant que la mercuriale n’a pas commencé', async () => {
    const { element } = await render(new FakePricing());
    expect(element().textContent).toContain("Possible tant que la mercuriale n'a pas commencé.");
  });

  it('n’envoie rien sans motif', async () => {
    const api = new FakePricing();
    const { submit, closedWith } = await render(api);
    await submit();
    expect(api.sent).toEqual([]);
    expect(closedWith).toEqual([]);
  });

  it('envoie les jours en minuit à Paris, le motif et le dernier avenant vu, puis ferme', async () => {
    const api = new FakePricing();
    const { type, submit, closedWith } = await render(api);
    await type('[data-correct-to] input', IN_TWO_MONTHS);
    await type('[data-correct-reason] textarea', '  Posée un an trop tard ');
    await submit();
    expect(api.sent).toEqual([
      {
        validFrom: businessDayStart(IN_A_MONTH),
        validTo: businessDayStart(IN_TWO_MONTHS),
        reason: 'Posée un an trop tard',
        basedOnAmendmentId: 'amd_7',
      },
    ]);
    expect(closedWith).toEqual([true]);
  });

  it('garde un refus du serveur dans le panneau, en clair, sans fermer', async () => {
    const api = new FakePricing();
    api.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Elle a commencé : clôturez-la, puis posez-en une autre.' },
    });
    const { type, submit, closedWith, element } = await render(api);
    await type('[data-correct-reason] textarea', 'Erreur de saisie');
    await submit();
    expect(closedWith).toEqual([]);
    expect(element().querySelector('[data-correct-refusal]')?.textContent).toContain(
      'clôturez-la, puis posez-en une autre',
    );
  });

  it('renvoie la même clé d’intention au réessai du même envoi, neuve si la saisie change', async () => {
    const api = new FakePricing();
    api.refuse = new HttpErrorResponse({ status: 503, error: { message: 'Indisponible' } });
    const { type, submit } = await render(api);
    await type('[data-correct-reason] textarea', 'Erreur de saisie');
    await submit();
    await submit();
    await type('[data-correct-reason] textarea', 'Autre motif');
    await submit();
    expect(api.keys).toHaveLength(3);
    expect(api.keys[1]).toBe(api.keys[0]);
    expect(api.keys[2]).not.toBe(api.keys[1]);
  });
});
