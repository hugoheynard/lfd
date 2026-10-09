import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthFacade } from '../../auth/auth.facade';
import { EmailCodeEntry } from './email-code-entry';

describe('EmailCodeEntry', () => {
  let calls: string[];
  let navigated: string[];

  function boot(authenticated: boolean): void {
    calls = [];
    navigated = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EmailCodeEntry],
      providers: [
        provideRouter([]),
        {
          provide: AuthFacade,
          useValue: {
            isAuthenticated: signal(authenticated),
            continueWithEmailCode: (target: string, hint?: string): void => {
              calls.push(`code:${target}:${hint ?? '—'}`);
            },
          },
        },
      ],
    });
    TestBed.inject(Router).navigateByUrl = (url): Promise<boolean> => {
      navigated.push(String(url));
      return Promise.resolve(true);
    };
    const fixture = TestBed.createComponent(EmailCodeEntry);
    fixture.detectChanges();
    TestBed.tick();
  }

  /**
   * 🔴 Aucune adresse ne voyage : l'URL du lien de l'e-mail n'en porte pas, et
   * la façade part donc sans `login_hint` (2026-10-09).
   */
  it('part aussitôt sur la connexion par code, sans souffler d’adresse', () => {
    boot(false);

    expect(calls).toEqual(['code:/accueil:—']);
    expect(navigated).toEqual([]);
  });

  it('qui est déjà entré va à l’accueil de son espace, sans repasser par Auth0', () => {
    boot(true);

    expect(calls).toEqual([]);
    expect(navigated).toEqual(['/accueil']);
  });
});
