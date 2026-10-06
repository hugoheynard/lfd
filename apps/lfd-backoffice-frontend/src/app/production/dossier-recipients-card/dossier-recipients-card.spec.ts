import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  DossierRecipientPayload,
  DossierRecipientView,
  DossierStaffCandidateView,
} from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ProductionSettingsService } from '../production-settings.service';
import { DossierRecipientsCard } from './dossier-recipients-card';

interface Wire {
  recipients: DossierRecipientView[];
  candidates: DossierStaffCandidateView[];
  added: DossierRecipientPayload[];
  removed: string[];
  refuse: string | null;
}

let wire: Wire;

const ALICE: DossierRecipientView = {
  id: 'r1',
  kind: 'staff',
  email: 'alice@lfd.fr',
  firstName: 'Alice',
  lastName: 'Martin',
  jobTitle: 'Cheffe de fournil',
  staffUserId: 's1',
};
const SUSPENDED: DossierRecipientView = {
  id: 'r2',
  kind: 'staff',
  email: '',
  firstName: '',
  lastName: '',
  jobTitle: null,
  staffUserId: 's9',
  inactive: true,
};
const CANDIDATES: DossierStaffCandidateView[] = [
  {
    staffUserId: 's1',
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice@lfd.fr',
    jobTitle: null,
  },
  {
    staffUserId: 's2',
    firstName: 'Bruno',
    lastName: 'Petit',
    email: 'bruno@lfd.fr',
    jobTitle: null,
  },
];

async function boot(
  canWrite = true,
  recipients: DossierRecipientView[] = [ALICE, SUSPENDED],
): Promise<ComponentFixture<DossierRecipientsCard>> {
  wire = { recipients, candidates: CANDIDATES, added: [], removed: [], refuse: null };
  const gate = (): Promise<void> =>
    wire.refuse === null
      ? Promise.resolve()
      : Promise.reject(
          new HttpErrorResponse({ status: 409, error: { code: 'x', message: wire.refuse } }),
        );
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DossierRecipientsCard],
    providers: [
      {
        provide: ProductionSettingsService,
        useValue: {
          dossierRecipients: () => Promise.resolve(wire.recipients),
          dossierStaffCandidates: () => Promise.resolve(wire.candidates),
          addDossierRecipient: (payload: DossierRecipientPayload) => {
            wire.added.push(payload);
            return gate();
          },
          removeDossierRecipient: (id: string) => {
            wire.removed.push(id);
            return gate();
          },
        } satisfies Partial<Record<keyof ProductionSettingsService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(DossierRecipientsCard);
  fixture.componentRef.setInput('canWrite', canWrite);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<DossierRecipientsCard>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function emit(
  fixture: ComponentFixture<DossierRecipientsCard>,
  selector: string,
  event: string,
  value: unknown = undefined,
): void {
  fixture.debugElement.query(By.css(selector)).triggerEventHandler(event, value);
  fixture.detectChanges();
}

function click(fixture: ComponentFixture<DossierRecipientsCard>, selector: string): void {
  (fixture.nativeElement.querySelector(selector) as HTMLButtonElement).click();
}

const has = (fixture: ComponentFixture<DossierRecipientsCard>, selector: string): boolean =>
  fixture.nativeElement.querySelector(selector) !== null;

describe('Production › Réglages — les destinataires du dossier', () => {
  it('liste les destinataires, leur nature et une fiche suspendue', async () => {
    const fixture = await boot();
    const rows = fixture.nativeElement.querySelectorAll(
      '[data-recipient]',
    ) as NodeListOf<HTMLElement>;
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain('Alice Martin');
    expect(rows[0]?.textContent).toContain('alice@lfd.fr');
    expect(rows[0]?.textContent).toContain('Cheffe de fournil');
    expect(rows[0]?.textContent).toContain('Personnel');
    expect(rows[1]?.querySelector('[data-inactive]')).not.toBeNull();
  });

  it('dit que personne ne reçoit le dossier', async () => {
    const fixture = await boot(true, []);
    expect(fixture.nativeElement.textContent).toContain(
      'Personne ne reçoit le dossier par e-mail.',
    );
  });

  it('écarte du choix le personnel déjà inscrit', async () => {
    const fixture = await boot();
    const listbox = fixture.debugElement.query(By.css('[data-staff-pick]'));
    const options = listbox.componentInstance.options() as readonly FoldSelectOption<string>[];
    expect(options.map((option) => option.value)).toEqual(['s2']);
  });

  it('ajoute une personne du personnel', async () => {
    const fixture = await boot();
    emit(fixture, '[data-staff-pick]', 'selectionChange', 's2');
    click(fixture, '[data-add-staff]');
    await settle(fixture);
    expect(wire.added).toEqual([{ kind: 'staff', staffUserId: 's2' }]);
  });

  it('ajoute une autre personne, poste facultatif', async () => {
    const fixture = await boot();
    const add = fixture.nativeElement.querySelector('[data-add-external]') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    emit(fixture, '[data-external-email]', 'valueChange', ' paul@ext.fr ');
    emit(fixture, '[data-external-first-name]', 'valueChange', 'Paul');
    emit(fixture, '[data-external-last-name]', 'valueChange', 'Durand');
    click(fixture, '[data-add-external]');
    await settle(fixture);
    expect(wire.added).toEqual([
      {
        kind: 'external',
        email: 'paul@ext.fr',
        firstName: 'Paul',
        lastName: 'Durand',
        jobTitle: null,
      },
    ]);
  });

  it('ajoute une autre personne avec son seul e-mail — nom et prénom facultatifs', async () => {
    const fixture = await boot();
    emit(fixture, '[data-external-email]', 'valueChange', 'fournil@ext.fr');
    fixture.detectChanges();
    const add = fixture.nativeElement.querySelector('[data-add-external]') as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    click(fixture, '[data-add-external]');
    await settle(fixture);
    expect(wire.added).toEqual([
      {
        kind: 'external',
        email: 'fournil@ext.fr',
        firstName: null,
        lastName: null,
        jobTitle: null,
      },
    ]);
  });

  it('affiche le refus du serveur tel quel', async () => {
    const fixture = await boot();
    wire.refuse = 'Cette adresse reçoit déjà le dossier.';
    emit(fixture, '[data-staff-pick]', 'selectionChange', 's2');
    click(fixture, '[data-add-staff]');
    await settle(fixture);
    const callout = fixture.nativeElement.querySelector('[data-recipient-refusal]') as HTMLElement;
    expect(callout.textContent).toContain('Cette adresse reçoit déjà le dossier.');
  });

  it('retire un destinataire par sa croix', async () => {
    const fixture = await boot();
    emit(fixture, '[data-remove-recipient]', 'clicked');
    await settle(fixture);
    expect(wire.removed).toEqual(['r1']);
  });

  it('sans droit d’écriture, montre la liste sans aucun geste', async () => {
    const fixture = await boot(false);
    expect(fixture.nativeElement.querySelectorAll('[data-recipient]').length).toBe(2);
    expect(has(fixture, '[data-remove-recipient]')).toBe(false);
    expect(has(fixture, '[data-staff-pick]')).toBe(false);
    expect(has(fixture, '[data-add-external]')).toBe(false);
  });
});
