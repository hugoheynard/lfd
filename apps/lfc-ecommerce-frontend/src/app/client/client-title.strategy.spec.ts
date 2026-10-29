import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router, TitleStrategy } from '@angular/router';

import { ClientLocale } from './client-locale.service';
import { ClientCopyService } from './copy/client-copy.service';
import { ClientTitleStrategy, pageTitle } from './client-title.strategy';

@Component({ selector: 'app-blank', template: '' })
class Blank {}

/**
 * Pré-audit RGAA 8.3 / 8.6 (2026-10-26) : l'onglet restait en français et
 * `<html lang>` à `fr` quand le visiteur passait en anglais ou en italien.
 */
describe('ClientTitleStrategy — l’onglet et la langue suivent le visiteur', () => {
  let title: Title;
  let locale: ClientLocale;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'boutique', data: pageTitle('shop'), component: Blank },
          { path: 'ancien', title: 'Titre écrit', component: Blank },
        ]),
        { provide: TitleStrategy, useExisting: ClientTitleStrategy },
      ],
    });
    title = TestBed.inject(Title);
    locale = TestBed.inject(ClientLocale);
    router = TestBed.inject(Router);
  });

  afterEach(() => locale.current.set('fr'));

  it('traduit le titre d’une route qui porte une clé', async () => {
    await router.navigateByUrl('/boutique');
    expect(title.getTitle()).toBe('Boutique — La Folie Coffee');
  });

  it('réécrit l’onglet au changement de langue', async () => {
    await router.navigateByUrl('/boutique');
    locale.current.set('en');
    TestBed.tick();
    // L'anglais se charge à la demande : on attend son dictionnaire.
    await TestBed.inject(ClientCopyService).whenReady('en');
    TestBed.tick();
    expect(title.getTitle()).toBe('Shop — La Folie Coffee');
  });

  it('n’écrase pas un titre posé par l’écran (la fiche d’un article)', async () => {
    await router.navigateByUrl('/boutique');
    title.setTitle('Croissant — La Folie Coffee');
    locale.current.set('it');
    TestBed.tick();
    expect(title.getTitle()).toBe('Croissant — La Folie Coffee');
  });

  it('garde le titre écrit d’une route sans clé', async () => {
    await router.navigateByUrl('/ancien');
    expect(title.getTitle()).toBe('Titre écrit');
  });

  it('tient <html lang> sur la langue choisie', () => {
    locale.current.set('it');
    TestBed.tick();
    expect(document.documentElement.lang).toBe('it');
    locale.current.set('fr');
    TestBed.tick();
    expect(document.documentElement.lang).toBe('fr');
  });
});
