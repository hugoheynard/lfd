import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { MarketingPreferenceState } from '@lfd/contracts/shop-values';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../../../auth/auth.facade';
import { marketingConsentCopy } from '../../copy/screens/marketing-consent.copy';
import { MarketingPreferencesSection } from './marketing-preferences-section';

const COPY = marketingConsentCopy('fr');
const ME = '/me/marketing';

/**
 * **« Mes e-mails »** (lot C3) : l'état en toutes lettres, et le geste qui
 * convient — puis on relit, l'écran ne devine jamais l'état d'après.
 */
async function mount(
  state: MarketingPreferenceState,
  partnersOffered = false,
): Promise<{
  fixture: ComponentFixture<MarketingPreferencesSection>;
  http: HttpTestingController;
}> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MarketingPreferencesSection],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: () => true, accessToken$: () => of('j') },
      },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(MarketingPreferencesSection);
  fixture.detectChanges();
  http
    .expectOne((r) => r.url.endsWith(ME))
    .flush({ spaces: [{ space: 'lfc', state, askable: false }], partnersOffered });
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, http };
}

const text = (fixture: ComponentFixture<MarketingPreferencesSection>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

const action = (fixture: ComponentFixture<MarketingPreferencesSection>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector('[data-marketing-action]');

describe('MarketingPreferencesSection', () => {
  const cases: readonly [MarketingPreferenceState, string, string, string][] = [
    ['subscribed', COPY.stateSubscribed, COPY.unsubscribe, 'unsubscribe'],
    ['pending', COPY.statePending, COPY.unsubscribe, 'unsubscribe'],
    ['not_subscribed', COPY.stateNotSubscribed, COPY.subscribe, 'subscribe'],
    ['unsubscribed', COPY.stateUnsubscribed, COPY.resubscribe, 'resubscribe'],
  ];

  for (const [state, label, button, gesture] of cases) {
    it(`« ${state} » : « ${label} » et « ${button} »`, async () => {
      const { fixture } = await mount(state);

      expect(text(fixture)).toContain(COPY.spaceLfc);
      expect(text(fixture)).toContain(label);
      expect(action(fixture)?.textContent?.trim()).toBe(button);
      expect(action(fixture)?.getAttribute('data-marketing-action')).toBe(gesture);
    });
  }

  it('se réinscrire écrit la version du texte et la langue, puis relit', async () => {
    const { fixture, http } = await mount('unsubscribed');
    action(fixture)?.click();
    await Promise.resolve();

    const write = http.expectOne((r) => r.url.endsWith('/me/marketing/subscriptions'));
    expect(write.request.body).toEqual({ space: 'lfc', textVersion: 'society.v1', locale: 'fr' });
    write.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    http.expectOne((r) => r.url.endsWith(ME));
  });

  it('se désinscrire écrit l’espace seul', async () => {
    const { fixture, http } = await mount('subscribed');
    action(fixture)?.click();
    await Promise.resolve();

    const write = http.expectOne((r) => r.url.endsWith('/me/marketing/unsubscriptions'));
    expect(write.request.body).toEqual({ space: 'lfc' });
  });

  it('un refus se dit en ligne, la carte reste', async () => {
    const { fixture, http } = await mount('not_subscribed');
    action(fixture)?.click();
    await Promise.resolve();
    http
      .expectOne((r) => r.url.endsWith('/me/marketing/subscriptions'))
      .flush('non', { status: 500, statusText: 'Erreur' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain(COPY.preferencesWriteFailed);
    expect(action(fixture)).not.toBeNull();
  });

  it('la case partenaires ne paraît pas tant que l’API ne la propose pas', async () => {
    const { fixture } = await mount('subscribed');

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-marketing-partners]'),
    ).toBeNull();
  });

  it('proposée, elle paraît et écrit `partners.v1`', async () => {
    const { fixture, http } = await mount('subscribed', true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(COPY.partnersV1);
    el.querySelector<HTMLInputElement>('[data-marketing-partners] input[type=checkbox]')?.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.partners-save')?.click();
    await Promise.resolve();

    const write = http.expectOne((r) => r.url.endsWith('/me/marketing/partners'));
    expect(write.request.body).toEqual({ textVersion: 'partners.v1', locale: 'fr' });
  });

  it('une lecture en échec : l’état d’erreur fold, et réessayer', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MarketingPreferencesSection],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: () => true, accessToken$: () => of('j') },
        },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MarketingPreferencesSection);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith(ME)).flush('x', { status: 500, statusText: 'Erreur' });
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('fold-empty-state')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('fold-empty-state button')?.click();
    await Promise.resolve();
    http.expectOne((r) => r.url.endsWith(ME));
  });
});
