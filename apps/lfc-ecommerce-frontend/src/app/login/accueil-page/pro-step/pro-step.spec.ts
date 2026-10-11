import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PRO_ACCOUNT_FR } from '../../../client/copy/screens/pro-account.copy';
import { ShopCopyOverrides } from '../../../client/copy/shop-copy-overrides';
import { ProStep } from './pro-step';

function boot(): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ProStep] });
  const fixture = TestBed.createComponent(ProStep);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ProStep — ses textes', () => {
  it('dit la porte pro avec le texte du code', () => {
    expect(boot().querySelector('.title')?.textContent).toBe(PRO_ACCOUNT_FR.door.eyebrow);
  });

  /** Lot T4 des textes : un remplacement reçu redessine l'écran, sans rechargement. */
  it('se redessine quand un remplacement de son texte arrive', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ProStep] });
    const fixture = TestBed.createComponent(ProStep);
    fixture.detectChanges();

    TestBed.inject(ShopCopyOverrides).receive('fr', {
      'proAccount.door.eyebrow': 'Mon compte pro',
    });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.title')?.textContent).toBe(
      'Mon compte pro',
    );
  });
});
