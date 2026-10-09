import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthFacade } from '../../auth/auth.facade';
import type { SignInFailure as Failure } from '../../auth/sign-in-failure';
import { SignInFailure } from './sign-in-failure';

describe('SignInFailure', () => {
  function render(failure: Failure | null): string {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SignInFailure],
      providers: [
        provideRouter([]),
        { provide: AuthFacade, useValue: { signInFailure: signal(failure) } },
      ],
    });
    const fixture = TestBed.createComponent(SignInFailure);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  /** Régression 2026-10-09 : ce refus retombait sur l'accueil sans un mot. */
  it('nomme le refus d’Auth0 tel quel', () => {
    const text = render({ code: 'invalid_request', description: 'the connection is not enabled' });

    expect(text).toContain("La connexion n'a pas abouti");
    expect(text).toContain('the connection is not enabled');
    expect(text).toContain("Revenir à l'accueil");
  });

  it('une annulation se dit sans texte technique', () => {
    const text = render({ code: 'access_denied', description: 'User did not authorize' });

    expect(text).toContain('Connexion annulée');
    expect(text).not.toContain('User did not authorize');
  });

  it('sans refus lisible, le message générique suffit', () => {
    const text = render(null);

    expect(text).toContain("La connexion n'a pas abouti");
    expect(text).not.toContain('(');
  });
});
