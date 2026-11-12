import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { STALE_SHEET_CODE } from '../../comptes-clients/sheet-revision';
import { NotifyService } from '../../notify.service';
import { AdminContactPanel } from '../panels/contact-panel/contact-panel';
import {
  AdminIdentitePanel,
  type AdminIdentitePanelData,
} from '../panels/identite-panel/identite-panel';

/**
 * Les panneaux de la fiche renvoient la révision lue, et un refus « fiche
 * périmée » ne se dit pas en toast : le panneau le montre et propose de relire
 * (`comptes-client/plan-fiche-perimee.md`).
 */

const IDENTITY: AdminIdentitePanelData = {
  companyId: 'cmp_1',
  revision: 4,
  enseigne: 'Le Comptoir',
  vatNumber: '',
  raisonSociale: 'Le Comptoir SAS',
  formeJuridique: 'SAS',
  siret: '',
  siren: '',
};

const STALE = new HttpErrorResponse({
  status: 409,
  error: {
    code: STALE_SHEET_CODE,
    message:
      "Cette fiche a changé depuis que vous l'avez ouverte : relisez-la avant d'enregistrer.",
  },
});
const OTHER = new HttpErrorResponse({ status: 500, error: { code: 'x', message: 'panne' } });

/** Le service doublé : retient la révision envoyée, et refuse si on le lui dit. */
class RecordingCompanies {
  revisions: (number | null)[] = [];
  constructor(private readonly refusal: unknown = null) {}
  private answer(revision: number | null): Promise<void> {
    this.revisions.push(revision);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }
  updateIdentity(_id: string, _payload: unknown, revision: number | null): Promise<void> {
    return this.answer(revision);
  }
  updatePrimaryContact(_id: string, _payload: unknown, revision: number | null): Promise<void> {
    return this.answer(revision);
  }
}

class RecordingNotify {
  errors = 0;
  successes = 0;
  success(): void {
    this.successes += 1;
  }
  error(): void {
    this.errors += 1;
  }
}

class RecordingRef {
  closed = 0;
  close(): void {
    this.closed += 1;
  }
}

function setup(refusal: unknown = null) {
  const companies = new RecordingCompanies(refusal);
  const notify = new RecordingNotify();
  const ref = new RecordingRef();
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminCompaniesService, useValue: companies },
      { provide: NotifyService, useValue: notify },
      { provide: FoldPanelRef, useValue: ref },
    ],
  });
  return { companies, notify, ref };
}

function text(element: unknown): string {
  return (element as HTMLElement).textContent ?? '';
}

describe('la fiche périmée — panneau Identité', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('renvoie la révision lue avec la fiche', async () => {
    const { companies, ref } = setup();
    const fixture = TestBed.createComponent(AdminIdentitePanel);
    fixture.componentRef.setInput('data', IDENTITY);
    fixture.detectChanges();

    await fixture.componentInstance['submit']();

    expect(companies.revisions).toEqual([4]);
    expect(ref.closed).toBe(1);
  });

  it('sur une fiche périmée : avertit dans le panneau, sans toast, et propose de relire', async () => {
    const { notify, ref } = setup(STALE);
    const fixture = TestBed.createComponent(AdminIdentitePanel);
    fixture.componentRef.setInput('data', IDENTITY);
    fixture.detectChanges();

    await fixture.componentInstance['submit']();
    fixture.detectChanges();

    expect(notify.errors).toBe(0);
    expect(ref.closed).toBe(0);
    expect(text(fixture.nativeElement)).toContain('Cette fiche a changé depuis que vous');
    const reread = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Relire la fiche',
    );
    expect(reread).toBeDefined();
    expect(text(fixture.nativeElement)).not.toContain('Enregistrer');

    reread?.click();
    expect(ref.closed).toBe(1);
  });

  it("un autre refus reste un toast, et le panneau garde l'enregistrement", async () => {
    const { notify } = setup(OTHER);
    const fixture = TestBed.createComponent(AdminIdentitePanel);
    fixture.componentRef.setInput('data', IDENTITY);
    fixture.detectChanges();

    await fixture.componentInstance['submit']();
    fixture.detectChanges();

    expect(notify.errors).toBe(1);
    expect(text(fixture.nativeElement)).not.toContain('Relire la fiche');
  });
});

describe('la fiche périmée — panneau du détenteur', () => {
  beforeEach(() => TestBed.resetTestingModule());

  const HOLDER = {
    companyId: 'cmp_1',
    revision: 7,
    target: { kind: 'primary' as const },
    initial: {
      firstName: 'Karim',
      lastName: 'Rousseau',
      fonction: '',
      email: 'karim@comptoir.fr',
      phone: '',
      role: '' as const,
    },
  };

  it('renvoie la révision lue, et propose de relire sur une fiche périmée', async () => {
    const { companies, notify } = setup(STALE);
    const fixture = TestBed.createComponent(AdminContactPanel);
    fixture.componentRef.setInput('data', HOLDER);
    fixture.detectChanges();

    await fixture.componentInstance['submit']();
    fixture.detectChanges();

    expect(companies.revisions).toEqual([7]);
    expect(notify.errors).toBe(0);
    expect(text(fixture.nativeElement)).toContain('Relire la fiche');
  });
});
