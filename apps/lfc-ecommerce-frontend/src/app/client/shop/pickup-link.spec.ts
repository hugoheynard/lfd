import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { OrderDoors } from './order-doors';
import { PickupLink } from './pickup-link';
import { ServicePoints } from './pickup-points.store';

const LABO = { id: 'pa_labo', label: 'Le Labo', ligne1: '1 rue du Four', ville: 'Annecy' };

describe('PickupLink — le lien direct d’un point de retrait', () => {
  let router: Router;
  const known = signal(false);
  const pickups = signal<readonly (typeof LABO)[]>([]);
  const designate = vi.fn();

  async function open(
    url: string,
    platform: 'browser' | 'server' = 'browser',
  ): Promise<PickupLink> {
    TestBed.resetTestingModule();
    designate.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'boutique', children: [] }]),
        { provide: PLATFORM_ID, useValue: platform },
        {
          provide: ServicePoints,
          useValue: { pickupsKnown: known, pickups, hydrate: () => Promise.resolve() },
        },
        { provide: OrderDoors, useValue: { designate } },
        PickupLink,
      ],
    });
    router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    const link = TestBed.inject(PickupLink);
    await settle();
    return link;
  }

  async function settle(): Promise<void> {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  beforeEach(() => {
    known.set(true);
    pickups.set([LABO]);
  });

  it('un point offert devient le retrait retenu, et le paramètre quitte l’adresse', async () => {
    await open('/boutique?retrait=pa_labo&rayon=pains');
    expect(designate).toHaveBeenCalledWith(LABO);
    expect(router.url).toBe('/boutique?rayon=pains');
  });

  it('attend la liste servie pour qui regarde avant de décider', async () => {
    known.set(false);
    await open('/boutique?retrait=pa_labo');
    expect(designate).not.toHaveBeenCalled();
    expect(router.url).toBe('/boutique?retrait=pa_labo');
    known.set(true);
    await settle();
    expect(designate).toHaveBeenCalledTimes(1);
    expect(router.url).toBe('/boutique');
  });

  it('un point inconnu, archivé ou non offert est ignoré sans erreur', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await open('/boutique?retrait=pa_ferme');
    expect(designate).not.toHaveBeenCalled();
    expect(router.url).toBe('/boutique');
    expect(info).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });

  it('au rendu serveur, le paramètre se lit sans rien appliquer', async () => {
    const link = await open('/boutique?retrait=pa_labo', 'server');
    expect(link.param()).toBe('pa_labo');
    expect(designate).not.toHaveBeenCalled();
    expect(router.url).toBe('/boutique?retrait=pa_labo');
  });
});
