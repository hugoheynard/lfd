import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../auth/auth.facade';
import { EN } from '../client/copy/en';
import { FR } from '../client/copy/fr';
import { ClientLocale } from '../client/client-locale.service';
import { ShopCopyOverrides } from '../client/copy/shop-copy-overrides';
import { LoginPage } from './login-page';

function boot(isLoading = false): ComponentFixture<LoginPage> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      provideRouter([]),
      {
        provide: AuthFacade,
        useValue: { isLoading: signal(isLoading), isAuthenticated: signal(false) },
      },
    ],
  });
  const fixture = TestBed.createComponent(LoginPage);
  fixture.detectChanges();
  return fixture;
}

const el = (fixture: ComponentFixture<LoginPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

/**
 * Lot T4 des textes de la boutique : les textes de `/login` étaient en dur dans
 * le gabarit, hors de portée d'un remplacement et du français seulement.
 */
describe('LoginPage — ses textes', () => {
  it('les lit au dictionnaire, dans la langue de l’écran', () => {
    const fixture = boot();
    expect(el(fixture).querySelector('h1')?.textContent).toBe(FR.signup.loginPage.title);

    TestBed.inject(ClientLocale).current.set('en');
    fixture.detectChanges();

    expect(el(fixture).querySelector('h1')?.textContent).toBe(EN.signup.loginPage.title);
    expect(el(fixture).textContent).toContain(EN.signup.loginPage.signIn);
  });

  it('dit la vérification de session pendant qu’Auth0 répond', () => {
    expect(el(boot(true)).textContent).toContain(FR.signup.loginPage.checking);
  });

  it('se redessine quand un remplacement de son texte arrive', () => {
    const fixture = boot();
    TestBed.inject(ShopCopyOverrides).receive('fr', { 'signup.loginPage.lead': 'Entrez.' });
    fixture.detectChanges();

    expect(el(fixture).querySelector('.login-lead')?.textContent).toBe('Entrez.');
  });
});
