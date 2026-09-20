import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthFacade, type ProRegistration } from '../auth.facade';
import { DevAuth0SignupPage } from './dev-auth0-signup-page';

const REGISTRATION: ProRegistration = {
  firstName: 'Pierre',
  lastName: 'Marchand',
  email: 'pierre@brasserie-marchand.fr',
  phone: '06 12 44 09 87',
  enseigne: 'Brasserie Marchand',
};

describe('l’écran d’Auth0 simulé', () => {
  let fixture: ComponentFixture<DevAuth0SignupPage>;
  let facade: AuthFacade;
  let navigated: string[];

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(label));

  function boot(withSignup: boolean): void {
    navigated = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DevAuth0SignupPage],
      providers: [provideRouter([])],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = (url): Promise<boolean> => {
      navigated.push(String(url));
      return Promise.resolve(true);
    };
    facade = TestBed.inject(AuthFacade);
    if (withSignup) {
      facade.registerPro('/mon-compte', REGISTRATION);
      navigated = [];
    }
    fixture = TestBed.createComponent(DevAuth0SignupPage);
    fixture.detectChanges();
  }

  it('sans inscription en cours, renvoie vers la porte pro', () => {
    boot(false);

    expect(el().textContent).toContain('Aucune inscription en cours');
    button('Revenir')?.click();
    expect(navigated).toEqual(['/ouverture-compte-pro']);
  });

  it('demande un mot de passe, dit l’e-mail simulé, puis rend la main avec la déclaration', () => {
    boot(true);
    expect(el().textContent).toContain(REGISTRATION.email);
    expect(button('Continuer')?.disabled).toBe(true);

    const input = el().querySelector('input');
    if (!input) {
      throw new Error('Pas de champ de mot de passe à l’écran.');
    }
    input.value = 'un-mot-de-passe';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Continuer')?.click();
    fixture.detectChanges();

    expect(el().textContent).toContain('simulé');
    expect(facade.pendingProRegistration()).toBeNull();

    button('Aller à Mon compte')?.click();
    expect(navigated).toEqual(['/mon-compte']);
    expect(facade.pendingProRegistration()).toEqual(REGISTRATION);
  });
});
