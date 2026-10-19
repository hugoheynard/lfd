import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { FoldPanelHostService } from 'fold-ng';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthFacade } from '../../../auth/auth.facade';
import { SignInDialog } from '../../../login/sign-in-dialog/sign-in-dialog';
import { matchMediaAt } from '../../mon-compte/account.fixture';
import { FR } from '../../copy/fr';
import { ProVisit } from '../pro-visit.service';
import { ProVisitNote } from './pro-visit-note';

describe('ProVisitNote — le repère de la visite pro', () => {
  let fixture: ComponentFixture<ProVisitNote>;
  let opened: { readonly component: unknown; readonly data: unknown }[];
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label,
    );
    if (found === undefined) {
      throw new Error(`Bouton « ${label} » absent du repère.`);
    }
    return found;
  };

  beforeEach(async () => {
    opened = [];
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    TestBed.configureTestingModule({
      imports: [ProVisitNote],
      providers: [
        provideRouter([{ path: 'boutique', component: ProVisitNote }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthFacade, useValue: { isAuthenticated: signal(false) } },
        {
          provide: FoldPanelHostService,
          useValue: {
            open: (component: unknown, options: { data?: unknown }): { close: () => void } => {
              opened.push({ component, data: options.data });
              return { close: (): void => undefined };
            },
          },
        },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/boutique#pro');
    fixture = TestBed.createComponent(ProVisitNote);
    fixture.detectChanges();
  });

  it('dit que les prix sont les tarifs pro hors taxe', () => {
    expect(el().textContent).toContain(FR.shop.proVisitNote);
  });

  it('dit qu’on commande une fois connecté', () => {
    expect(el().textContent).toContain('Connectez-vous pour commander à vos conditions.');
  });

  it('« Je me connecte » ouvre la connexion vers l’espace pro', () => {
    button(FR.shop.proVisitSignIn).click();

    expect(opened).toEqual([
      { component: SignInDialog, data: { target: '/mon-compte', email: '' } },
    ]);
  });

  it('« Voir les prix TTC » retire #pro de l’adresse, le choix et le repère', async () => {
    button(FR.shop.proVisitShowTtc).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/boutique');
    expect(TestBed.inject(ProVisit).active()).toBe(false);
    expect(el().textContent).not.toContain(FR.shop.proVisitNote);
  });
});
