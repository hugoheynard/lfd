import { Injector, runInInjectionContext, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ClientLocale, type LocaleCode } from '../client-locale.service';
import { ClientCopyService } from './client-copy.service';
import { screenCopy, textsOfSpace } from './shop-copy-composer';
import { ShopCopyOverrides } from './shop-copy-overrides';

interface DemoCopy {
  readonly title: string;
  readonly nested: { readonly cta: string };
}

const COPIES: Readonly<Record<LocaleCode, DemoCopy>> = {
  fr: { title: 'Où je la prends ?', nested: { cta: 'Choisir' } },
  en: { title: 'Where do I pick it up?', nested: { cta: 'Choose' } },
  it: { title: 'Dove lo ritiro?', nested: { cta: 'Scegli' } },
};

function boot(): Signal<DemoCopy> {
  TestBed.resetTestingModule();
  return runInInjectionContext(TestBed.inject(Injector), () =>
    screenCopy('housePicker', (locale) => COPIES[locale]),
  );
}

describe('screenCopy — les textes d’un écran, remplacements compris', () => {
  it('rend le texte du code tant qu’aucun remplacement n’est arrivé', () => {
    expect(boot()().title).toBe('Où je la prends ?');
  });

  it('se recompose quand un remplacement de SON espace arrive', () => {
    const copy = boot();
    expect(copy().nested.cta).toBe('Choisir');

    TestBed.inject(ShopCopyOverrides).receive('fr', { 'housePicker.nested.cta': 'Je choisis' });

    expect(copy().nested.cta).toBe('Je choisis');
    expect(copy().title).toBe('Où je la prends ?');
  });

  it('ignore les remplacements d’un autre espace, même au chemin identique', () => {
    const copy = boot();
    TestBed.inject(ShopCopyOverrides).receive('fr', { 'slotPicker.title': 'Autre écran' });

    expect(copy().title).toBe('Où je la prends ?');
  });

  it('suit la langue, avec les remplacements de cette langue seulement', () => {
    const copy = boot();
    TestBed.inject(ShopCopyOverrides).receive('fr', {
      'housePicker.title': 'Remplacé en français',
    });
    TestBed.inject(ClientLocale).current.set('en');

    expect(copy().title).toBe('Where do I pick it up?');
  });
});

describe('textsOfSpace', () => {
  it('ne garde que les clés de l’espace, préfixe retiré', () => {
    expect(textsOfSpace({ 'a.b': '1', 'ab.c': '2', 'a.d.e': '3' }, 'a')).toEqual({
      b: '1',
      'd.e': '3',
    });
  });

  it('rend tout pour le dictionnaire général', () => {
    expect(textsOfSpace({ 'cart.whoTitle': 'x' }, '')).toEqual({ 'cart.whoTitle': 'x' });
  });
});

describe('ClientCopyService.everyLocale', () => {
  it('rend chaque langue AVEC ses remplacements', async () => {
    TestBed.resetTestingModule();
    TestBed.inject(ShopCopyOverrides).receive('en', { 'chrome.signIn': 'Log in now' });
    const service = TestBed.inject(ClientCopyService);
    await Promise.all([service.whenReady('en'), service.whenReady('it')]);

    const labels = service.everyLocale((copy) => copy.chrome.signIn);

    expect(labels[1]).toBe('Log in now');
    expect(labels).toHaveLength(3);
  });

  it('ne télécharge pas une langue jamais choisie pour mesurer un libellé', () => {
    TestBed.resetTestingModule();

    const labels = TestBed.inject(ClientCopyService).everyLocale((copy) => copy.chrome.signIn);

    expect(labels).toHaveLength(1);
  });
});
