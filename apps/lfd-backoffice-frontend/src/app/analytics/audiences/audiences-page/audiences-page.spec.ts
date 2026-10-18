import { TestBed } from '@angular/core/testing';
import type { AudienceDimension, AudiencePeriod, AudiencesView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AudiencesService } from '../audiences.service';
import { AudiencesPage } from './audiences-page';

function viewOf(days: AudiencePeriod): AudiencesView {
  return {
    days,
    from: '2026-09-19',
    to: '2026-10-18',
    minClients: 5,
    segmentations: [
      {
        dimension: 'clientele',
        cells: [
          { status: 'too_few_clients', key: 'pro', label: 'Professionnels' },
          {
            status: 'shown',
            key: 'public',
            label: 'Particuliers',
            clients: 7,
            orders: 12,
            revenueHtCents: 2_880,
            revenueTtcCents: 3_036,
            averageBasketHtCents: 240,
            averageBasketTtcCents: 253,
            topFamilies: [{ familyId: 'fam-pains', name: 'Pains', revenueHtCents: 2_880 }],
          },
        ],
      },
    ],
    subscriptions: {
      status: 'too_few_clients',
      key: 'subscriptions',
      label: 'Commandes d’abonnement',
    },
  };
}

class FakeApi {
  readonly asked: { days: AudiencePeriod; dimension: AudienceDimension | undefined }[] = [];
  fail = false;
  read(days: AudiencePeriod, dimension?: AudienceDimension): Promise<AudiencesView> {
    this.asked.push({ days, dimension });
    return this.fail ? Promise.reject(new Error('réseau')) : Promise.resolve(viewOf(days));
  }
}

async function render(api: FakeApi) {
  TestBed.configureTestingModule({
    imports: [AudiencesPage],
    providers: [{ provide: AudiencesService, useValue: api }],
  });
  const fixture = TestBed.createComponent(AudiencesPage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AudiencesPage', () => {
  it('lit 30 jours par défaut, dit la règle des cinq clients et l’agrégat', async () => {
    const api = new FakeApi();
    const root = (await render(api)).nativeElement as HTMLElement;
    const text = (root.textContent ?? '').replace(/\s+/gu, ' ');
    expect(api.asked).toEqual([{ days: 30, dimension: undefined }]);
    expect(text).toContain('Chiffres agrégés, jamais un client');
    expect(text).toContain('moins de 5 clients distincts');
    expect(text).toContain('Pros et particuliers');
    expect(text).toContain('Abonnements, à part');
  });

  it('montre les chiffres d’une case, et « trop peu de clients » pour une case masquée', async () => {
    const root = (await render(new FakeApi())).nativeElement as HTMLElement;
    const text = (root.textContent ?? '').replace(/\s+/gu, ' ');
    expect(text).toContain('Particuliers');
    expect(text).toContain('Trop peu de clients');
    expect(text).toContain('Pains');
  });

  it('une panne se dit en alerte, avec Réessayer', async () => {
    const api = new FakeApi();
    api.fail = true;
    const root = (await render(api)).nativeElement as HTMLElement;
    expect(root.textContent).toContain('Impossible de charger les audiences');
    expect(root.textContent).toContain('Réessayer');
  });
});
