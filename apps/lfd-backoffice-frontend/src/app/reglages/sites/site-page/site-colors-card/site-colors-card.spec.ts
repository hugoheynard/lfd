import { TestBed } from '@angular/core/testing';
import type { SiteColorsPayload, SiteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { SitesService } from '../../sites.service';
import { SiteColorsCard } from './site-colors-card';

const SITE: SiteView = {
  id: 'site_1',
  label: 'Adroit',
  ligne1: '1 rue',
  ligne2: '',
  codePostal: '73000',
  ville: 'Val',
  pays: 'France',
  isDefault: true,
  discount: null,
  discountAudiences: { b2b: true, b2c: true },
  opening: { publicOpening: null, proPickup: null },
  gps: null,
  handsOver: true,
  supply: 'on_site',
  dispatches: false,
  transferMode: 'integrated',
  counterSetupMinutes: 0,
  pickupColorB2b: '#ffcc00',
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  archivedAt: null,
};

class FakeSites {
  readonly sent: SiteColorsPayload[] = [];

  setColors(_id: string, payload: SiteColorsPayload): Promise<void> {
    this.sent.push(payload);
    return Promise.resolve();
  }
}

function mount(site: SiteView = SITE) {
  const sites = new FakeSites();
  TestBed.configureTestingModule({
    imports: [SiteColorsCard],
    providers: [
      { provide: SitesService, useValue: sites },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(SiteColorsCard);
  fixture.componentRef.setInput('site', site);
  fixture.detectChanges();
  return { fixture, sites };
}

describe('SiteColorsCard', () => {
  it('ne montre que les couleurs que les rôles rendent utiles', () => {
    const { fixture } = mount();
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('Retrait B2B');
    expect(text).not.toContain('Livraison B2B');
  });

  it('montre les couleurs de livraison à un site qui expédie', () => {
    const { fixture } = mount({ ...SITE, dispatches: true });
    expect(fixture.nativeElement.textContent).toContain('Livraison B2C');
  });

  it('🔴 annonce À LA SAISIE qu’un vert est réservé, et ne l’envoie pas', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['setColor']('pickupColorB2c', '#00ff00');
    fixture.detectChanges();

    await fixture.componentInstance['save']();

    expect(fixture.nativeElement.textContent).toContain('réservés aux surligneurs OK / KO');
    expect(sites.sent).toEqual([]);
  });

  it('ne peint pas la pastille d’une couleur refusée', () => {
    const { fixture } = mount();
    fixture.componentInstance['setColor']('pickupColorB2c', '#ff0000');

    expect(fixture.componentInstance['swatch']('pickupColorB2c')).toBeNull();
    expect(fixture.componentInstance['swatch']('pickupColorB2b')).toBe('#ffcc00');
  });

  it('envoie les quatre couleurs EN BLOC, normalisées en minuscules', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['setColor']('pickupColorB2c', '#FF8000');

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([
      {
        pickupColorB2b: '#ffcc00',
        pickupColorB2c: '#ff8000',
        deliveryColorB2b: null,
        deliveryColorB2c: null,
      },
    ]);
  });

  it('vider une couleur jamais posée la rend à « non saisie »', () => {
    const { fixture } = mount();
    fixture.componentInstance['setColor']('pickupColorB2c', '#ff');
    fixture.componentInstance['setColor']('pickupColorB2c', '');

    expect(fixture.componentInstance['draft']().pickupColorB2c).toBeNull();
    expect(fixture.componentInstance['dirty']()).toBe(false);
  });

  it('vider une couleur posée est refusé : elle se change, elle ne s’efface pas', () => {
    const { fixture } = mount();
    fixture.componentInstance['setColor']('pickupColorB2b', '');

    expect(fixture.componentInstance['canSave']()).toBe(false);
  });
});
