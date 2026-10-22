import { TestBed } from '@angular/core/testing';
import type { SiteTableView, SiteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { SitesService } from '../../sites.service';
import { SiteTablesCard } from './site-tables-card';

const SITE: SiteView = {
  id: 'site_1',
  label: 'Village',
  ligne1: '1 place',
  ligne2: '',
  codePostal: '73000',
  ville: 'Val',
  pays: 'France',
  discounts: { b2b: null, b2c: null },
  opening: { publicOpening: null, proPickup: null },
  gps: null,
  pickup: true,
  supply: 'on_site',
  deliveryDeparture: false,
  transferMode: 'integrated',
  counterSetupMinutes: 0,
  eatIn: true,
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  resupplyColor: null,
  archivedAt: null,
  isDeparture: false,
};

const WITH_QR: SiteTableView = {
  number: 1,
  hasQr: true,
  qrUrl: 'https://boutique.test/table/tok_1',
  qrCreatedAt: '2026-01-01T00:00:00.000Z',
};
const BARE: SiteTableView = { number: 2, hasQr: false, qrUrl: null, qrCreatedAt: null };

/** La grille en mémoire : chaque écriture est notée, puis relue. */
class FakeSites {
  readonly calls: string[] = [];
  grid: readonly SiteTableView[] = [WITH_QR, BARE];
  refusal: unknown = null;

  tables(): Promise<{ tables: readonly SiteTableView[] }> {
    return Promise.resolve({ tables: this.grid });
  }

  setTableCount(_id: string, count: number): Promise<void> {
    return this.write(`count:${count}`);
  }

  generateTableQr(_id: string, table: number): Promise<void> {
    return this.write(`qr:${table}`);
  }

  removeTableQr(_id: string, table: number): Promise<void> {
    return this.write(`unqr:${table}`);
  }

  private write(call: string): Promise<void> {
    this.calls.push(call);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }
}

async function mount(readOnly = false) {
  const sites = new FakeSites();
  TestBed.configureTestingModule({
    imports: [SiteTablesCard],
    providers: [
      { provide: SitesService, useValue: sites },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(SiteTablesCard);
  fixture.componentRef.setInput('site', SITE);
  fixture.componentRef.setInput('readOnly', readOnly);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, sites };
}

describe('SiteTablesCard', () => {
  it('montre chaque table, le QR de celle qui en a un, et le geste pour l’autre', async () => {
    const { fixture } = await mount();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Table 1');
    expect(text).toContain('Table 2');
    expect(fixture.nativeElement.querySelectorAll('app-qr-code')).toHaveLength(1);
    expect(text).toContain('Générer le QR');
  });

  it('enregistre un nombre changé, et seulement lui', async () => {
    const { fixture, sites } = await mount();
    fixture.componentInstance['count'].set(5);
    await fixture.componentInstance['saveCount']();
    expect(sites.calls).toEqual(['count:5']);
  });

  it('n’envoie pas un nombre inchangé', async () => {
    const { fixture, sites } = await mount();
    await fixture.componentInstance['saveCount']();
    expect(sites.calls).toEqual([]);
  });

  it('génère et retire un QR table par table', async () => {
    const { fixture, sites } = await mount();
    await fixture.componentInstance['generateQr'](2);
    await fixture.componentInstance['removeQr'](1);
    expect(sites.calls).toEqual(['qr:2', 'unqr:1']);
  });

  it('garde le refus du serveur dans la carte', async () => {
    const { fixture, sites } = await mount();
    sites.refusal = { status: 409, error: { message: 'Le site n’a pas de salle.' } };
    fixture.componentInstance['count'].set(3);
    await fixture.componentInstance['saveCount']();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Le site n’a pas de salle.');
  });

  it('n’offre aucun geste en lecture seule', async () => {
    const { fixture } = await mount(true);
    const text: string = fixture.nativeElement.textContent;
    expect(text).not.toContain('Générer le QR');
    expect(text).not.toContain('Enregistrer le nombre');
  });
});
