import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { AddressPointDecisionPayload, AddressPointSuggestionsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { suggestionOf } from '../address-suggestions.fixture';
import { AddressSuggestionsService } from '../address-suggestions.service';
import { AddressSuggestionsPage } from './address-suggestions-page';

/** Le transport doublé : ce qu'il rend, et les gestes qu'il a reçus. */
class FakeSuggestions {
  current: AddressPointSuggestionsView = {
    suggestions: [suggestionOf()],
    minConcordant: 3,
    minGapM: 50,
  };
  calls: string[] = [];
  refuse: HttpErrorResponse | null = null;
  fail = false;

  list(): Promise<AddressPointSuggestionsView> {
    this.calls.push('list');
    return this.fail ? Promise.reject(new Error('down')) : Promise.resolve(this.current);
  }

  apply(addressId: string, decision: AddressPointDecisionPayload): Promise<void> {
    this.calls.push(`apply ${addressId} ${decision.kind} ${String(decision.point.lat)}`);
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.current = { ...this.current, suggestions: [] };
    return Promise.resolve();
  }

  ignore(addressId: string, decision: AddressPointDecisionPayload): Promise<void> {
    this.calls.push(`ignore ${addressId} ${decision.kind}`);
    this.current = { ...this.current, suggestions: [] };
    return Promise.resolve();
  }
}

async function boot(
  fake: FakeSuggestions,
): Promise<{ fixture: ComponentFixture<AddressSuggestionsPage>; element: HTMLElement }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AddressSuggestionsService,
        useValue: fake satisfies Pick<AddressSuggestionsService, 'list' | 'apply' | 'ignore'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(AddressSuggestionsPage);
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ComponentFixture<AddressSuggestionsPage>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('AddressSuggestionsPage — « Carnet à corriger » (§6)', () => {
  it('montre le client, l’adresse, la phrase, les coordonnées et le lien carte', async () => {
    const { element } = await boot(new FakeSuggestions());

    const card = element.querySelector('[data-suggestion]');
    expect(card?.textContent).toContain('Hôtel du Parc SAS · Hôtel du Parc');
    expect(card?.querySelector('[data-suggestion-sentence]')?.textContent).toContain(
      'La porte de livraison semble être à 120 m du point enregistré (4 livraisons concordantes).',
    );
    expect(card?.textContent).toContain('45.56608, 5.91800');
    expect(card?.querySelector('[data-suggestion-map] a')?.getAttribute('href')).toContain(
      'travelmode=walking',
    );
  });

  it('« Appliquer » envoie le point vu, puis relit : la liste se vide', async () => {
    const fake = new FakeSuggestions();
    const { fixture, element } = await boot(fake);

    (element.querySelector('[data-apply]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(fake.calls).toEqual(['list', 'apply a1 door 45.56608', 'list']);
    expect(element.querySelector('[data-empty]')).not.toBeNull();
  });

  it('« Ignorer » envoie la décision, puis relit', async () => {
    const fake = new FakeSuggestions();
    const { fixture, element } = await boot(fake);

    (element.querySelector('[data-ignore]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(fake.calls).toEqual(['list', 'ignore a1 door', 'list']);
  });

  it('un refus (la suggestion a changé) reste sur la carte, la liste aussi', async () => {
    const fake = new FakeSuggestions();
    fake.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Cette suggestion a changé ou n’existe plus depuis l’affichage.' },
    });
    const { fixture, element } = await boot(fake);

    (element.querySelector('[data-apply]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(element.querySelector('[data-suggestion-refusal]')).not.toBeNull();
    expect(element.querySelector('[data-suggestion]')).not.toBeNull();
  });

  it('le serveur muet : l’état d’erreur, pas un « carnet tient » qui mentirait', async () => {
    const fake = new FakeSuggestions();
    fake.fail = true;
    const { element } = await boot(fake);

    expect(element.querySelector('[data-error]')).not.toBeNull();
    expect(element.querySelector('[data-empty]')).toBeNull();
  });
});
