import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { FR } from '../../copy/fr';
import { FavoriteToggle } from './favorite-toggle';
import { AuthFacade } from '../../../auth/auth.facade';
import { of } from 'rxjs';

describe('FavoriteToggle', () => {
  afterEach(() => localStorage.removeItem('lfc.favorites'));

  const mount = () => {
    TestBed.configureTestingModule({
      imports: [FavoriteToggle],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: () => false, accessToken$: () => of('jeton') },
        },
      ],
    });
    const fixture = TestBed.createComponent(FavoriteToggle);
    fixture.componentRef.setInput('sku', 'VIE-001');
    fixture.detectChanges();
    const button = (): HTMLButtonElement =>
      (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
    return { fixture, button };
  };

  it('annonce son état et nomme le geste à venir', () => {
    const { fixture, button } = mount();
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().getAttribute('aria-label')).toBe(FR.product.favoriteAdd);

    button().click();
    fixture.detectChanges();

    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(button().getAttribute('aria-label')).toBe(FR.product.favoriteRemove);
  });
});
