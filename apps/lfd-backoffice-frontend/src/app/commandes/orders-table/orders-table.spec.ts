import { TestBed } from '@angular/core/testing';
import type { AdminOrderRow, SitePaletteEntryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrdersTable } from './orders-table';

/**
 * Le tableau partagé : la liste de toutes les commandes l'ouvre en `wide`
 * (client et jour), l'onglet d'un compte non — et un clic rend la ligne, sans
 * que le tableau sache où elle mène.
 */

function row(over: Partial<AdminOrderRow> = {}): AdminOrderRow {
  return {
    id: 'o_1',
    orderNumber: 'CMD-1',
    placedAt: '2026-10-12T08:00:00.000Z',
    status: 'placed',
    offPlan: false,
    shortfallReportedAt: null,
    paymentStatus: 'paid',
    fulfillmentMethod: 'delivery',
    fulfillmentDay: '2026-10-14',
    clientele: 'public',
    siteId: null,
    pickupLabel: null,
    fulfillmentWindow: null,
    subtotalCents: 1000,
    vatCents: 55,
    totalCents: 1055,
    customerLabel: 'Léa Martin',
    companyId: null,
    companyDisplayName: null,
    origin: 'self_service',
    ...over,
  };
}

const ADROIT: SitePaletteEntryView = {
  id: 'site_adroit',
  label: 'Adroit',
  supply: 'on_site',
  isDeparture: true,
  pickupColorB2b: '#1e88e5',
  pickupColorB2c: '#fdd835',
  deliveryColorB2b: '#000080',
  deliveryColorB2c: '#43a047',
  resupplyColor: null,
};

function render(
  rows: readonly AdminOrderRow[],
  wide: boolean,
  palette: readonly SitePaletteEntryView[] = [],
) {
  const fixture = TestBed.createComponent(OrdersTable);
  fixture.componentRef.setInput('palette', palette);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('caption', 'Commandes');
  fixture.componentRef.setInput('empty', { title: 'Aucune commande' });
  fixture.componentRef.setInput('wide', wide);
  fixture.detectChanges();
  return fixture;
}

function headers(el: HTMLElement): string[] {
  return [...el.querySelectorAll('th')].map((th) => (th.textContent ?? '').trim()).filter(Boolean);
}

describe('OrdersTable', () => {
  it('en large, dit qui a commandé et pour quand', () => {
    const el = render([row()], true).nativeElement as HTMLElement;
    expect(headers(el)).toEqual(
      expect.arrayContaining(['Commande', 'Client', 'Passée le', 'Pour le', 'Total TTC']),
    );
    expect(el.querySelector('fold-badge[data-clientele]')?.textContent).toContain('Particulier');
    expect(el.textContent).toContain('Livraison');
  });

  it("dans un compte, ni client ni jour : c'est le même partout", () => {
    const el = render([row()], false).nativeElement as HTMLElement;
    expect(headers(el)).not.toContain('Client');
    expect(headers(el)).not.toContain('Pour le');
  });

  it("une commande d'avant la distinction n'a pas de badge de clientèle", () => {
    const el = render([row({ clientele: null })], true).nativeElement as HTMLElement;
    expect(el.querySelector('fold-badge[data-clientele]')).toBeNull();
  });

  it('sépare le jour et le mode : « Pour le » ne dit plus que le jour', () => {
    const el = render([row()], true).nativeElement as HTMLElement;
    expect(headers(el)).toEqual(expect.arrayContaining(['Pour le', 'Mode']));
    expect(el.querySelector('[data-mode]')?.textContent?.trim()).toBe('Livraison');
  });

  it('un retrait dit son site, à la couleur de sa catégorie', () => {
    const el = render(
      [row({ fulfillmentMethod: 'pickup', siteId: ADROIT.id, clientele: 'pro' })],
      true,
      [ADROIT],
    ).nativeElement as HTMLElement;
    const swatch = el.querySelector<HTMLElement>('[data-mode] .ls-swatch');
    expect(swatch?.textContent?.trim()).toBe('Retrait Adroit');
    expect(swatch?.style.backgroundColor).toBe('rgb(30, 136, 229)');
  });

  it('une livraison prend la couleur du site de départ, par clientèle', () => {
    const el = render([row()], true, [ADROIT]).nativeElement as HTMLElement;
    expect(el.querySelector<HTMLElement>('[data-mode] .ls-swatch')?.style.backgroundColor).toBe(
      'rgb(67, 160, 71)',
    );
  });

  it("un retrait sans site connu (d'avant S2) : « Retrait », teinte neutre", () => {
    const el = render([row({ fulfillmentMethod: 'pickup', siteId: null })], true, [ADROIT])
      .nativeElement as HTMLElement;
    const swatch = el.querySelector<HTMLElement>('[data-mode] .ls-swatch');
    expect(swatch?.textContent?.trim()).toBe('Retrait');
    expect(swatch?.classList.contains('is-neutral')).toBe(true);
  });

  it('un retrait sans site dans son snapshot dit le point figé, en teinte neutre', () => {
    const el = render(
      [
        row({
          fulfillmentMethod: 'pickup',
          siteId: null,
          pickupLabel: 'Boutique',
          clientele: 'public',
        }),
      ],
      true,
      [ADROIT],
    ).nativeElement as HTMLElement;
    const swatch = el.querySelector<HTMLElement>('[data-mode] .ls-swatch');
    expect(swatch?.textContent?.trim()).toBe('Retrait Boutique');
    expect(swatch?.classList.contains('is-neutral')).toBe(true);
  });

  it("empile l'heure sous le jour : passation à Paris, et le créneau du service", () => {
    const el = render(
      [row({ fulfillmentWindow: { start: '09:00', end: '11:00', source: 'override' } })],
      true,
    ).nativeElement as HTMLElement;
    expect(el.querySelector('[data-placed] .ot-time')?.textContent?.trim()).toBe('10:00');
    expect(el.querySelector('[data-service] .ot-time')?.textContent?.trim()).toBe('09:00 – 11:00');
  });

  it('sans créneau figé, « Pour le » ne dit que le jour', () => {
    const el = render([row()], true).nativeElement as HTMLElement;
    expect(el.querySelector('[data-service] .ot-time')).toBeNull();
  });

  it('rend la ligne cliquée', () => {
    const fixture = render([row()], true);
    const opened: AdminOrderRow[] = [];
    fixture.componentInstance.opened.subscribe((r) => opened.push(r));
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('tbody tr')?.click();
    expect(opened.map((r) => r.id)).toEqual(['o_1']);
  });

  /** Lot O3 (`plan-reglages-commandes.md` §8.3) : reçue sur un plan arrêté, pas reprise. */
  it('met en alerte une commande hors plan, et dit le geste', () => {
    const fixture = render([row({ offPlan: true })], true);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-off-plan]')?.textContent).toContain('Hors plan');
    expect(el.querySelector('[data-off-plan]')?.textContent).toContain(
      'Reprendre la journée au fournil',
    );
    expect(fixture.componentInstance['rowTone'](row({ offPlan: true }))).toBe('alert');
    expect(fixture.componentInstance['rowTone'](row())).toBeNull();
  });

  /** Lot E6a : le colisage a signalé un manque, la commande attend une décision. */
  it('montre « Manque signalé — décision attendue » à côté de l’avancement', () => {
    const fixture = render([row({ shortfallReportedAt: '2026-10-12T05:00:00.000Z' })], true);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-shortfall]')?.textContent).toContain(
      'Manque signalé — décision attendue',
    );
  });

  it('ne dit rien du manque sans signalement', () => {
    const el = render([row()], true).nativeElement as HTMLElement;

    expect(el.querySelector('[data-shortfall]')).toBeNull();
  });
});
