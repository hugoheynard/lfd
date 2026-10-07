import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { type DatedEvent } from '../mock-event';
import { CurrentEvents } from './current-events';

const EVENT: DatedEvent = {
  badge: 'Pâques',
  countdown: 'J‑9',
  title: 'Pâques prend de l’altitude.',
  dates: 'Du 28 mars au 6 avril',
  teaser: 'Neuf pièces coulées à la main.',
  image: 'https://example.test/paques.jpg',
  route: '/boutique',
};

function mount() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(CurrentEvents);
  fixture.componentRef.setInput('event', EVENT);
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
});
