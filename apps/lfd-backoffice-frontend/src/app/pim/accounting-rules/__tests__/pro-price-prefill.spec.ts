import { TestBed } from '@angular/core/testing';
import type { ProPricePrefillPreviewView, ProPricePrefillRowView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AccountingRulesHttpApi } from '../accounting-rules-http-api';
import { groupedUnderDefaults, ProPricePrefill } from '../pro-price-prefill/pro-price-prefill';

/** Le pré-remplissage du prix pro (lot P, P5) : un aperçu, puis un geste. */

function row(over: Partial<ProPricePrefillRowView> = {}): ProPricePrefillRowView {
  return {
    productId: 'prd_1',
    productName: 'Florentin',
    variantId: 'var_1',
    sku: 'CHO-001-1',
    status: 'to_prefill',
    publicTtcCents: 1_990,
    vatPercent: 5.5,
    servedHtMillicents: 1_697_630,
    prefilledHtMillicents: 1_697_630,
    mismatch: false,
    followsSku: null,
    alignedCause: null,
    ...over,
  };
}

function view(over: Partial<ProPricePrefillPreviewView> = {}): ProPricePrefillPreviewView {
  return {
    method: 'ratio_ttc',
    ratioBp: 9_000,
    rows: [row(), row({ variantId: 'var_2', sku: 'CHO-001-2', status: 'aligned' })],
    toPrefill: 1,
    mismatches: 0,
    ...over,
  };
}

class FakeApi {
  applied = 0;
  constructor(
    private readonly before: ProPricePrefillPreviewView,
    private readonly after: ProPricePrefillPreviewView = before,
  ) {}
  previewProPricePrefill(): Promise<ProPricePrefillPreviewView> {
    return Promise.resolve(this.applied > 0 ? this.after : this.before);
  }
  applyProPricePrefill(): Promise<ProPricePrefillPreviewView> {
    this.applied += 1;
    return Promise.resolve(this.after);
  }
}

async function render(api: FakeApi, granted = true) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PermissionsStore, useValue: { can: () => granted } },
      { provide: AccountingRulesHttpApi, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(ProPricePrefill);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function button(fixture: { nativeElement: unknown }, label: string): HTMLButtonElement {
  const found = [...host(fixture).querySelectorAll('button')].find((candidate) =>
    (candidate.textContent ?? '').includes(label),
  );
  if (found === undefined) {
    throw new TypeError(`bouton « ${label} » absent`);
  }
  return found;
}

async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('ProPricePrefill — l’aperçu', () => {
  it('ne lit rien tant qu’on ne l’a pas demandé', async () => {
    const fixture = await render(new FakeApi(view()));

    expect(host(fixture).querySelector('fold-data-table')).toBeNull();
    expect(host(fixture).textContent).toContain('Voir l');
  });

  it('montre, par déclinaison, le sort, le HT servi et le HT pré-rempli à cinq décimales', async () => {
    const fixture = await render(new FakeApi(view()));

    button(fixture, 'Voir l').click();
    await settle(fixture);

    const text = (host(fixture).textContent ?? '').replace(/\u202f|\u00a0/g, ' ');
    expect(text).toContain('CHO-001-1');
    expect(text).toContain('à pré-remplir');
    expect(text).toContain('suit le défaut');
    expect(text).toContain('16,9763 €');
    expect(button(fixture, 'Pré-remplir 1 prix pro').disabled).toBe(false);
  });

  it('bloque au moindre écart, et le dit dans un encadré', async () => {
    const fixture = await render(
      new FakeApi(
        view({ rows: [row({ servedHtMillicents: null, mismatch: true })], mismatches: 1 }),
      ),
    );

    button(fixture, 'Voir l').click();
    await settle(fixture);

    const callouts = [...host(fixture).querySelectorAll('fold-callout')].map((c) => c.textContent);
    expect(callouts.some((c) => (c ?? '').includes('1 écart'))).toBe(true);
    expect(button(fixture, 'Pré-remplir').disabled).toBe(true);
  });

  it('n’offre pas l’écriture sans le droit comptable', async () => {
    const fixture = await render(new FakeApi(view()), false);

    button(fixture, 'Voir l').click();
    await settle(fixture);

    expect(host(fixture).querySelector('fold-data-table')).not.toBeNull();
    expect(host(fixture).textContent).not.toContain('Pré-remplir 1');
  });
});

describe('ProPricePrefill — l’écriture', () => {
  it('écrit, puis adopte l’aperçu relu', async () => {
    const api = new FakeApi(
      view(),
      view({ rows: [row({ status: 'already_entered' })], toPrefill: 0 }),
    );
    const fixture = await render(api);
    button(fixture, 'Voir l').click();
    await settle(fixture);

    button(fixture, 'Pré-remplir 1 prix pro').click();
    await settle(fixture);

    expect(api.applied).toBe(1);
    expect(host(fixture).textContent).toContain('déjà saisi');
    expect(button(fixture, 'Pré-remplir 0 prix pro').disabled).toBe(true);
  });
});

/** Lot S : deux vérités, la phrase du vrai basculement, les alignées sous leur défaut. */
describe('ProPricePrefill — lot S', () => {
  const flat = (text: string | null | undefined): string =>
    (text ?? '').replace(/\u202f|\u00a0/g, ' ');

  it('dit que le prix public ne bouge plus le prix pro après l’écriture', async () => {
    const fixture = await render(new FakeApi(view()));
    button(fixture, 'Voir l').click();
    await settle(fixture);

    expect(flat(host(fixture).textContent)).toContain('le prix public ne bouge plus le prix pro');
    expect(flat(host(fixture).textContent)).toContain('Rien de servi ne change');
  });

  it('sous prix saisi, dit que les déclinaisons deviendront vendables, et fait confirmer', async () => {
    const api = new FakeApi(
      view({ method: 'entered', rows: [row({ servedHtMillicents: null })] }),
      view({ method: 'entered', rows: [row({ status: 'already_entered' })], toPrefill: 0 }),
    );
    const fixture = await render(api);
    button(fixture, 'Voir l').click();
    await settle(fixture);

    expect(flat(host(fixture).textContent)).toContain('deviendront vendables aux pros');
    button(fixture, 'Pré-remplir 1 prix pro').click();
    await settle(fixture);
    expect(api.applied).toBe(0);

    button(fixture, 'Confirmer le pré-remplissage').click();
    await settle(fixture);
    expect(api.applied).toBe(1);
  });

  it('annuler la confirmation n’écrit rien', async () => {
    const api = new FakeApi(view({ method: 'entered' }));
    const fixture = await render(api);
    button(fixture, 'Voir l').click();
    await settle(fixture);
    button(fixture, 'Pré-remplir 1 prix pro').click();
    await settle(fixture);

    button(fixture, 'Annuler').click();
    await settle(fixture);

    expect(api.applied).toBe(0);
    expect(button(fixture, 'Pré-remplir 1 prix pro').disabled).toBe(false);
  });

  it('range une alignée sous son défaut, avec la vraie cause', async () => {
    const aligned = row({
      variantId: 'var_2',
      sku: 'CHO-001-2',
      status: 'aligned',
      followsSku: 'CHO-001-1',
      alignedCause: 'no_vat_b2b',
    });
    const other = row({ productId: 'prd_2', variantId: 'var_3', sku: 'TAR-001-1' });
    const fixture = await render(new FakeApi(view({ rows: [aligned, other, row()] })));
    button(fixture, 'Voir l').click();
    await settle(fixture);

    expect(flat(host(fixture).textContent)).toContain('suit CHO-001-1 — sans taux B2B');
    expect(groupedUnderDefaults([aligned, other, row()]).map((r) => r.sku)).toEqual([
      'TAR-001-1',
      'CHO-001-1',
      'CHO-001-2',
    ]);
  });
});
