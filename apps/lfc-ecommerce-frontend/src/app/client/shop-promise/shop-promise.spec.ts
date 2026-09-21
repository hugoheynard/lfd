import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ShopLevel } from '@lfd/contracts';

import { ClientLocale } from '../client-locale.service';
import { PRO_ACCOUNT_EN, PRO_ACCOUNT_FR } from '../copy/screens/pro-account.copy';
import { ShopPromise } from './shop-promise';

describe('ShopPromise', () => {
  function render(level: ShopLevel): ComponentFixture<ShopPromise> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ShopPromise] });
    const fixture = TestBed.createComponent(ShopPromise);
    fixture.componentRef.setInput('level', level);
    fixture.detectChanges();
    return fixture;
  }

  const text = (fixture: ComponentFixture<ShopPromise>): string =>
    ((fixture.nativeElement as HTMLElement).textContent ?? '').trim();

  const callout = (fixture: ComponentFixture<ShopPromise>): Element | null =>
    (fixture.nativeElement as HTMLElement).querySelector('fold-callout');

  it('promet l’ouverture sous `closed`, sans inviter au rayon', () => {
    const fixture = render('closed');

    expect(callout(fixture)).not.toBeNull();
    expect(text(fixture)).toBe(PRO_ACCOUNT_FR.promise.closed);
  });

  it('invite déjà à regarder la boutique sous `browse`', () => {
    const fixture = render('browse');

    expect(text(fixture)).toBe(PRO_ACCOUNT_FR.promise.browse);
    expect(text(fixture)).toContain('découvrez déjà la boutique');
  });

  /** Plan §3.1 : au niveau `order`, rien à retirer le jour de l'ouverture. */
  it('ne rend rien sous `order`', () => {
    const fixture = render('order');

    expect(callout(fixture)).toBeNull();
    expect(text(fixture)).toBe('');
  });

  it('parle la langue choisie', () => {
    const fixture = render('closed');
    TestBed.inject(ClientLocale).current.set('en');
    fixture.detectChanges();

    expect(text(fixture)).toBe(PRO_ACCOUNT_EN.promise.closed);
  });
});
