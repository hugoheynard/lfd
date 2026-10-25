import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { AdminCompany } from '../admin-company';
import { SelfSignupPipeline } from './self-signup-pipeline';

const NOW = new Date(Date.UTC(2030, 0, 31, 12));

function company(id: string, declaredVia: AdminCompany['declaredVia']): AdminCompany {
  return {
    id,
    reference: `C-${id}`,
    raisonSociale: '',
    enseigne: id,
    formeJuridique: '',
    siret: '',
    siren: '',
    vatNumber: '',
    status: 'pending',
    grantedTerms: [],
    requestedTerm: null,
    directDebitBlocked: false,
    primaryContact: {
      role: null,
      id: null,
      firstName: '',
      lastName: '',
      fonction: '',
      email: '',
      phone: '',
    },
    kbis: null,
    owner: null,
    hasOpenSupportRequest: false,
    parent: null,
    createdAt: NOW.toISOString(),
    declaredVia,
    piecesReached: [],
    activatedAt: null,
    warnings: [],
  };
}

/**
 * Sans `detectChanges` : l'entonnoir est un graphique ECharts, et ce test
 * éprouve le périmètre et la navigation, pas le dessin.
 */
function setup(): ComponentFixture<SelfSignupPipeline> {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'comptes-clients/:id', children: [] }])],
  });
  const fixture = TestBed.createComponent(SelfSignupPipeline);
  fixture.componentRef.setInput('companies', [company('moi', 'self'), company('vendu', 'staff')]);
  fixture.componentRef.setInput('now', NOW);
  return fixture;
}

describe('SelfSignupPipeline', () => {
  it('montre les inscrits seuls par défaut, et tout le monde sur « Tous »', () => {
    const pipeline = setup().componentInstance;
    expect(pipeline['rows']().map((row) => row.company.id)).toEqual(['moi']);

    pipeline['onScopeChange']('all');
    expect(pipeline['rows']()).toHaveLength(2);

    pipeline['onScopeChange']('n’importe quoi');
    expect(pipeline['scope']()).toBe('all');
  });

  it('ouvre la fiche de la société au clic sur la ligne', async () => {
    const fixture = setup();
    const pipeline = fixture.componentInstance;
    const [row] = pipeline['rows']();
    if (row === undefined) {
      throw new Error('une ligne attendue');
    }
    pipeline['open'](row);
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/comptes-clients/moi');
  });
});
