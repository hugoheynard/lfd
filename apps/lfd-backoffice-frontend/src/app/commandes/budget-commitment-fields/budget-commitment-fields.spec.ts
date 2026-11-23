import { TestBed } from '@angular/core/testing';
import type { BudgetCommitmentRequirementsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { CommitmentStanding } from '../budget-commitment';
import { BudgetCommitmentFields } from './budget-commitment-fields';

const REQUIRED: BudgetCommitmentRequirementsView = {
  payerCompanyId: 'cmp_army',
  publicPayer: true,
  commitmentRequired: true,
  serviceCodeRequired: false,
  defaultServiceCode: 'SRV-01',
  currentCommitment: null,
};

async function render(
  requirements: BudgetCommitmentRequirementsView | null,
  failed = false,
  standing: CommitmentStanding | null = null,
): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(BudgetCommitmentFields);
  fixture.componentRef.setInput('requirements', requirements);
  fixture.componentRef.setInput('requirementsFailed', failed);
  fixture.componentRef.setInput('standing', standing);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const textOf = (host: HTMLElement, selector: string): string =>
  host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ') ?? '';

describe('BudgetCommitmentFields', () => {
  it('un numéro exigé le dit, et dit où il se trouve ; le code nomme son défaut', async () => {
    const host = await render(REQUIRED);

    expect(textOf(host, '[data-budget-commitment-number]')).toContain('Exigé par ce payeur');
    expect(textOf(host, '[data-budget-commitment-number]')).toContain('bon de commande');
    expect(textOf(host, '[data-budget-commitment-service]')).toContain('SRV-01');
  });

  it('un numéro non exigé est dit facultatif', async () => {
    const host = await render({ ...REQUIRED, commitmentRequired: false });

    expect(textOf(host, '[data-budget-commitment-number]')).not.toContain('Exigé');
    expect(textOf(host, '[data-budget-commitment-number]')).toContain('facultatif');
  });

  it('des exigences illisibles : l’échec est dit, les champs restent', async () => {
    const host = await render(null, true);

    expect(host.querySelector('[data-budget-commitment-unread]')).not.toBeNull();
    expect(host.querySelector('[data-budget-commitment-number] input')).not.toBeNull();
  });

  it('sans engagement en cours, ne dit rien de plus', async () => {
    const host = await render(REQUIRED);
    expect(host.querySelector('[data-budget-commitment-standing]')).toBeNull();
  });

  it('un engagement expiré dit qu’il a pris fin', async () => {
    const host = await render(REQUIRED, false, {
      state: 'ended',
      number: 'ENG-2026',
      endsOn: '2026-12-31',
    });
    expect(textOf(host, '[data-budget-commitment-standing]')).toBe(
      'L’engagement n° ENG-2026 a pris fin le 31/12/2026.',
    );
  });
});
