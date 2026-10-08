import { TestBed } from '@angular/core/testing';
import type { InvoiceDossierView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { dossier } from '../../__tests__/invoice-dossier-fixture';
import { DossierAlerts } from './dossier-alerts';

function render(view: InvoiceDossierView): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [DossierAlerts] });
  const fixture = TestBed.createComponent(DossierAlerts);
  fixture.componentRef.setInput('dossier', view);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('DossierAlerts — ce qui empêcherait d’émettre', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('liste les manques tels que le serveur les a rédigés, et ne dit plus « rien à signaler »', () => {
    const root = render(
      dossier({
        issuanceBlockers: [
          { code: 'payment_terms_missing', message: 'Les mentions ne sont pas renseignées.' },
          { code: 'buyer_siren_missing', message: 'Le client « Café du Port » n’a pas de SIREN.' },
        ],
      }),
    );

    const callout = root.querySelector('[data-dossier-issuance-blockers]');
    expect(callout?.textContent).toContain('Cette facture ne pourrait pas être émise');
    expect(callout?.querySelectorAll('li')).toHaveLength(2);
    expect(callout?.textContent).toContain('n’a pas de SIREN');
    expect(root.querySelector('[data-dossier-all-clear]')).toBeNull();
  });

  it('aucun manque : pas d’encadré, et « rien à signaler »', () => {
    const root = render(dossier());

    expect(root.querySelector('[data-dossier-issuance-blockers]')).toBeNull();
    expect(root.querySelector('[data-dossier-all-clear]')).not.toBeNull();
  });
});
