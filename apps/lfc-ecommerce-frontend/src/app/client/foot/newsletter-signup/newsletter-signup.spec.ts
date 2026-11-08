import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { marketingConsentCopy } from '../../copy/screens/marketing-consent.copy';
import { NewsletterSignup } from './newsletter-signup';

const COPY = marketingConsentCopy('fr');
const ROUTE = '/mail/newsletter';

/**
 * **« Recevoir nos nouvelles »** (lot C5) : la même phrase quelle que soit
 * l'adresse (pas d'oracle), le piège invisible, et le débit dit à part.
 */
function mount(): { fixture: ComponentFixture<NewsletterSignup>; http: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [NewsletterSignup],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(NewsletterSignup);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

const el = (fixture: ComponentFixture<NewsletterSignup>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function type(fixture: ComponentFixture<NewsletterSignup>, selector: string, value: string): void {
  const input = el(fixture).querySelector<HTMLInputElement>(selector);
  if (input === null) {
    throw new Error(`Pas de champ ${selector}.`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function send(
  fixture: ComponentFixture<NewsletterSignup>,
  http: HttpTestingController,
  email: string,
  status: number,
): Promise<unknown> {
  type(fixture, 'fold-input input', email);
  el(fixture).querySelector('form')?.dispatchEvent(new Event('submit'));
  const request = http.expectOne((r) => r.url.endsWith(ROUTE));
  request.flush(null, { status, statusText: 'x' });
  await fixture.whenStable();
  fixture.detectChanges();
  return request.request.body;
}

const notice = (fixture: ComponentFixture<NewsletterSignup>): string =>
  el(fixture).querySelector('[data-newsletter-notice]')?.textContent?.trim() ?? '';

describe('NewsletterSignup', () => {
  it('envoie l’adresse, la version de la phrase, la langue et le piège vide', async () => {
    const { fixture, http } = mount();
    const body = await send(fixture, http, ' marie@exemple.fr ', 202);

    expect(body).toEqual({
      email: 'marie@exemple.fr',
      textVersion: 'newsletter.v1',
      locale: 'fr',
      website: '',
    });
  });

  it('dit la MÊME phrase pour deux adresses quelconques — aucun oracle', async () => {
    const first = mount();
    await send(first.fixture, first.http, 'connue@exemple.fr', 202);
    const said = notice(first.fixture);
    const second = mount();
    await send(second.fixture, second.http, 'inconnue@exemple.fr', 202);

    expect(said).toBe(COPY.newsletterSent);
    expect(notice(second.fixture)).toBe(said);
  });

  it('429 : « trop de tentatives »', async () => {
    const { fixture, http } = mount();
    await send(fixture, http, 'marie@exemple.fr', 429);

    expect(notice(fixture)).toBe(COPY.newsletterTooMany);
  });

  it('une adresse mal formée ne part pas, et l’erreur est sous le champ', () => {
    const { fixture, http } = mount();
    type(fixture, 'fold-input input', 'pas-une-adresse');
    el(fixture).querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    http.expectNone((r) => r.url.endsWith(ROUTE));
    expect(el(fixture).querySelector('fold-input')?.textContent).toContain(COPY.newsletterInvalid);
  });

  it('le piège est caché aux lecteurs d’écran et hors de la tabulation', () => {
    const { fixture } = mount();
    const trap = el(fixture).querySelector<HTMLInputElement>('[data-newsletter-trap]');

    expect(trap?.getAttribute('tabindex')).toBe('-1');
    expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(trap?.getAttribute('autocomplete')).toBe('off');
  });

  it('un piège rempli part tel quel : c’est le serveur qui l’ignore', async () => {
    const { fixture, http } = mount();
    type(fixture, '[data-newsletter-trap]', 'http://spam.example');
    const body = await send(fixture, http, 'robot@exemple.fr', 202);

    expect(body).toMatchObject({ website: 'http://spam.example' });
    expect(notice(fixture)).toBe(COPY.newsletterSent);
  });

  it('la phrase d’information est celle de `newsletter.v1`, avec la mention', () => {
    const { fixture } = mount();

    expect(el(fixture).textContent).toContain(COPY.newsletterV1);
    expect(el(fixture).querySelector('.sentence a')?.getAttribute('href')).toBe('/confidentialite');
  });
});
