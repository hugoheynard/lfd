import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { CounterParticularCard } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { CounterParticularsService } from '../counter-particulars.service';
import { CONTACT_TAKEN, ParticularPicker } from './particular-picker';

function card(id: string, patch: Partial<CounterParticularCard> = {}): CounterParticularCard {
  return {
    id,
    firstName: 'Jeanne',
    lastName: '',
    maskedEmail: 'j***@exemple.fr',
    maskedPhone: '06 •• •• •• 12',
    connectable: false,
    noShowCount: 0,
    ...patch,
  };
}

interface Api {
  search: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}

function mount(api: Partial<Api>): {
  fixture: ComponentFixture<ParticularPicker>;
  api: Api;
  chosen: CounterParticularCard[];
} {
  const full: Api = {
    search: api.search ?? vi.fn(() => Promise.resolve([])),
    create: api.create ?? vi.fn(() => Promise.resolve('u_new')),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: CounterParticularsService, useValue: full }],
  });
  const fixture = TestBed.createComponent(ParticularPicker);
  const chosen: CounterParticularCard[] = [];
  fixture.componentInstance.chosen.subscribe((c) => chosen.push(c));
  fixture.detectChanges();
  return { fixture, api: full, chosen };
}

const el = (f: ComponentFixture<ParticularPicker>) => f.nativeElement as HTMLElement;

function fill(f: ComponentFixture<ParticularPicker>): void {
  f.componentInstance['firstName'].set('Jeanne');
  f.componentInstance['email'].set('jeanne@exemple.fr');
  f.componentInstance['phone'].set('0612345612');
}

describe('ParticularPicker — chercher, puis choisir', () => {
  it('ne cherche rien en deçà de deux caractères', async () => {
    const { fixture, api } = mount({});
    await fixture.componentInstance.search('j');
    expect(api.search).not.toHaveBeenCalled();
  });

  it('montre la fiche et ses non retirées, et ne choisit JAMAIS seule, même à résultat unique', async () => {
    const { fixture, chosen } = mount({
      search: vi.fn(() => Promise.resolve([card('u1', { noShowCount: 2, lastName: 'Martin' })])),
    });
    await fixture.componentInstance.search('jea');
    fixture.detectChanges();

    expect(chosen).toEqual([]);
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Jeanne Martin');
    expect(text).toContain('j***@exemple.fr');
    expect(text).toContain('invité');
    expect(el(fixture).querySelector('[data-no-show-badge]')).not.toBeNull();
    expect(text).toContain('2 commandes non retirées');

    el(fixture).querySelector<HTMLElement>('[data-particular-card]')?.click();
    expect(chosen.map((c) => c.id)).toEqual(['u1']);
  });

  it('crée une fiche sous une clé d’intention, puis la reprend par son identifiant', async () => {
    const search = vi.fn(() => Promise.resolve([card('u_other'), card('u_new')]));
    const { fixture, api, chosen } = mount({ search });
    fill(fixture);
    await fixture.componentInstance.create();

    expect(api.create).toHaveBeenCalledWith(
      { firstName: 'Jeanne', email: 'jeanne@exemple.fr', phone: '0612345612' },
      expect.any(String),
    );
    expect(search).toHaveBeenCalledWith('jeanne@exemple.fr');
    expect(chosen.map((c) => c.id)).toEqual(['u_new']);
  });

  it('sur « contact déjà pris », dit le message et relance la recherche avec l’e-mail saisi', async () => {
    const refusal = new HttpErrorResponse({
      status: 409,
      error: { code: CONTACT_TAKEN, message: 'Cette adresse est celle de Jeanne.' },
    });
    const search = vi.fn(() => Promise.resolve([card('u1')]));
    const { fixture, chosen } = mount({ search, create: vi.fn(() => Promise.reject(refusal)) });
    fixture.componentInstance['openCreate']();
    fill(fixture);
    await fixture.componentInstance.create();
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-create-error]')?.textContent).toContain(
      'Cette adresse est celle de Jeanne.',
    );
    expect(search).toHaveBeenCalledWith('jeanne@exemple.fr');
    expect(el(fixture).querySelectorAll('[data-particular-card]').length).toBe(1);
    expect(chosen).toEqual([]);
  });
});
