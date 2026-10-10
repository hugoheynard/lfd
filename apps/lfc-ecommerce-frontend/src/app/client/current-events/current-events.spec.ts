import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { type DatedEvent } from '../shop/operation-event';
import { CurrentEvents } from './current-events';

const EVENT: DatedEvent = {
  badge: null,
  countdown: 'J‑9',
  title: 'Noël au fournil',
  dates: 'Retrait du 20 au 24 déc.',
  teaser: 'Neuf bûches.',
  image: { src: 'https://media.example.test/noel.jpg', srcset: '', alt: 'Une bûche' },
  route: '/boutique',
  queryParams: { rayon: 'op:noel' },
};

function mount(event: DatedEvent = EVENT) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(CurrentEvents);
  fixture.componentRef.setInput('event', event);
  fixture.componentRef.setInput('heading', 'En ce moment');
  fixture.componentRef.setInput('lead', 'Ce qui ne revient pas.');
  fixture.componentRef.setInput('cta', 'Découvrir');
  fixture.detectChanges();
  return fixture;
}

describe('CurrentEvents — le panneau des opérations datées', () => {
  it('pose le titre, la phrase d’appel et les deux cartes', () => {
    const host: HTMLElement = mount().nativeElement;

    expect(host.querySelector('.events-title')?.textContent).toContain('En ce moment');
    expect(host.querySelector('.events-lead')?.textContent).toContain('Ce qui ne revient pas.');
    expect(host.querySelector('app-event-banner')).not.toBeNull();
    expect(host.querySelector('app-event-card')).not.toBeNull();
  });

  it('relaie l’ouverture de la carte vers l’accueil', () => {
    const fixture = mount();
    let opened = 0;
    fixture.componentInstance.opened.subscribe(() => (opened += 1));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('app-event-card button')
      ?.click();

    expect(opened).toBe(1);
  });

  it('cadre la photo dans une bannière 21/9, couverte et centrée', () => {
    const host: HTMLElement = mount().nativeElement;
    const banner = host.querySelector<HTMLElement>('app-event-banner .event');
    const photo = host.querySelector<HTMLImageElement>('app-event-banner img.photo');

    expect(photo?.getAttribute('src')).toBe(EVENT.image?.src);
    expect(photo?.getAttribute('alt')).toBe('Une bûche');
    expect(banner && getComputedStyle(banner).aspectRatio.replace(/\s/g, '')).toBe('21/9');
    expect(photo && getComputedStyle(photo).objectFit).toBe('cover');
  });

  it('sans image, pas de balise : l’aplat de la palette reste', () => {
    const host: HTMLElement = mount({ ...EVENT, image: null }).nativeElement;

    expect(host.querySelector('app-event-banner img')).toBeNull();
    expect(host.querySelector('app-event-banner .count')?.textContent).toContain('J‑9');
    expect(host.querySelector('app-event-banner .badge')).toBeNull();
  });
});
