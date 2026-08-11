import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { AccountAlertView } from '@lfd/contracts';

import { AlertJournal } from '../alert-journal/alert-journal';

function alert(overrides: Partial<AccountAlertView> = {}): AccountAlertView {
  return {
    id: 'alert_1',
    kind: 'product.first_order',
    companyId: 'company_1',
    orderId: 'order_1',
    orderNumber: 'LFC-1042',
    occurredAt: '2026-08-11T09:00:00.000Z',
    findings: [
      {
        sku: 'VIE-001',
        productName: 'Viennoiserie',
        quantity: 3,
        baseline: null,
        deviationPercent: null,
        message: 'Viennoiserie — jamais commandé jusqu’ici (3)',
      },
    ],
    acknowledgedAt: null,
    acknowledgedBy: null,
    ...overrides,
  };
}

function render(alerts: readonly AccountAlertView[]): HTMLElement {
  const fixture = TestBed.createComponent(AlertJournal);
  fixture.componentRef.setInput('alerts', alerts);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('AlertJournal', () => {
  it('dit clairement quand il ne s’est rien passé', () => {
    const host = render([]);

    expect(host.textContent).toContain('Aucune alerte sur ce compte');
  });

  it('montre le constat de chaque ligne concernée', () => {
    // Le cap de bruit se voit ici : une alerte, plusieurs constats.
    const host = render([
      alert({
        findings: [
          {
            sku: 'A',
            productName: 'A',
            quantity: 1,
            baseline: null,
            deviationPercent: null,
            message: 'constat A',
          },
          {
            sku: 'B',
            productName: 'B',
            quantity: 2,
            baseline: null,
            deviationPercent: null,
            message: 'constat B',
          },
        ],
      }),
    ]);

    expect(host.querySelectorAll('.aj-findings li')).toHaveLength(2);
    expect(host.textContent).toContain('constat A');
    expect(host.textContent).toContain('constat B');
  });

  it('sépare ce qui attend une action de ce qui est déjà vu', () => {
    const host = render([
      alert({ id: 'a', acknowledgedAt: null }),
      alert({ id: 'b', acknowledgedAt: '2026-08-11T10:00:00.000Z' }),
    ]);

    // Une liste purement chronologique ferait perdre de vue ce qui reste à faire.
    expect(host.querySelectorAll('.aj-card--pending')).toHaveLength(1);
    expect(host.textContent).toContain('Déjà vues');
  });

  it('ne propose « J’ai vu » que sur ce qui ne l’a pas été', () => {
    const host = render([alert({ acknowledgedAt: '2026-08-11T10:00:00.000Z' })]);

    expect(host.querySelectorAll('button')).toHaveLength(0);
  });
});
