import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DeliveryProcedureGateway, type DeliveryStepPhotoChange } from '@lfd/b2b-ui/company';
import type {
  DeliveryAddressView,
  DeliveryProcedureStepView,
  DeliveryProcedureView,
  DeliveryStepFields,
} from '@lfd/contracts';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, beforeEach, vi } from 'vitest';

import { ClientAddresses } from '../../../client-addresses.service';
import { DELIVERY_PROCEDURE_EN } from '../../../copy/screens/delivery-procedure.en';
import { DELIVERY_PROCEDURE_FR } from '../../../copy/screens/delivery-procedure.fr';
import { ClientLocale } from '../../../client-locale.service';
import { asRole, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import {
  DeliveryProcedureDialog,
  type DeliveryProcedureDialogData,
} from './delivery-procedure-dialog';

const CHALET: DeliveryAddressView = {
  id: 'adr_1',
  label: 'Chalet',
  ligne1: '1 route du Col',
  ligne2: '',
  codePostal: '73150',
  ville: "Val d'Isère",
  pays: 'France',
  isDefault: true,
  procedureStepCount: 1,
  specs: {
    note: '',
    slots: { mode: 'everyday', slot: null },
    deliveryContact: null,
    gps: null,
    signatureRequired: null,
  },
};

const PORTAIL: DeliveryProcedureStepView = {
  id: 'stp_1',
  number: 1,
  title: 'Portail',
  body: 'Code 4512',
  photoRevision: null,
};

/** La passerelle doublée : l'éditeur partagé est éprouvé côté admin, ici on tient le cadre. */
class FakeGateway extends DeliveryProcedureGateway {
  steps: DeliveryProcedureStepView[] = [];
  removed: string[] = [];

  load(): Promise<DeliveryProcedureView> {
    return Promise.resolve({ addressId: 'adr_1', steps: this.steps });
  }

  addStep(_addressId: string, fields: DeliveryStepFields): Promise<string> {
    this.steps = [...this.steps, { ...PORTAIL, id: 'stp_new', number: 2, ...fields }];
    return Promise.resolve('stp_new');
  }

  reviseStep(_a: string, _s: string, _f: DeliveryStepFields, _c: DeliveryStepPhotoChange) {
    return Promise.resolve();
  }

  removeStep(_addressId: string, stepId: string): Promise<void> {
    this.removed.push(stepId);
    this.steps = this.steps.filter((s) => s.id !== stepId);
    return Promise.resolve();
  }

  reorder(): Promise<void> {
    return Promise.resolve();
  }

  photo(): Promise<Blob> {
    return Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' }));
  }
}

let gateway: FakeGateway;
let refreshed: string[];

function providers(locale: 'fr' | 'en' = 'fr') {
  return [
    { provide: ClientAddresses, useValue: { refresh: (id: string) => refreshed.push(id) } },
    { provide: ClientLocale, useValue: { current: () => locale } },
  ];
}

async function boot(
  data: DeliveryProcedureDialogData,
  locale: 'fr' | 'en' = 'fr',
): Promise<ComponentFixture<DeliveryProcedureDialog>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DeliveryProcedureDialog],
    providers: [
      ...providers(locale),
      { provide: DeliveryProcedureGateway, useValue: gateway },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryProcedureDialog);
  fixture.componentRef.setInput('data', data);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<DeliveryProcedureDialog>): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

function buttonsLabelled(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ).filter((b) => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label);
}

const text = (fixture: ComponentFixture<unknown>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

beforeEach(() => {
  gateway = new FakeGateway();
  refreshed = [];
  URL.createObjectURL = vi.fn(() => 'blob:vignette');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  TestBed.resetTestingModule();
});

describe('DeliveryProcedureDialog', () => {
  it('ouvre centré au bureau, la passerelle liée à la société, l’écriture selon le rôle', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: providers() });
    const panels = TestBed.inject(FoldPanelHostService);

    DeliveryProcedureDialog.open(panels, TOMMEUSES, CHALET);
    expect(openedPanel()).toEqual({
      component: DeliveryProcedureDialog,
      side: 'center',
      data: { companyId: 'cmp_1', address: CHALET, canEdit: true },
    });
    const [panel] = panels.panels();
    if (panel?.kind !== 'component') {
      throw new Error('Le dialogue ne s’est pas ouvert.');
    }
    // La passerelle vient des `providers` de l'ouverture, pas de la racine.
    expect(panel.injector.get(DeliveryProcedureGateway)).toBeInstanceOf(DeliveryProcedureGateway);

    panels.dismissAll();
    DeliveryProcedureDialog.open(panels, asRole('orders'), CHALET, true);
    expect(openedPanel()?.data).toMatchObject({ canEdit: false });
    panels.dismissAll();
  });

  it('en feuille du bas sous le pli', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: providers() });
    const panels = TestBed.inject(FoldPanelHostService);

    DeliveryProcedureDialog.open(panels, TOMMEUSES, CHALET);
    expect(openedPanel()?.side).toBe('bottom');
    panels.dismissAll();
  });

  /** Un membre qui ne gère pas doit pouvoir LIRE la procédure, sans aucun geste d'écriture. */
  it('en lecture seule, montre les étapes et aucun geste', async () => {
    gateway.steps = [PORTAIL];
    const fixture = await boot({ companyId: 'cmp_1', address: CHALET, canEdit: false });

    expect(text(fixture)).toContain('Portail');
    expect(text(fixture)).toContain('Code 4512');
    expect(buttonsLabelled(fixture, DELIVERY_PROCEDURE_FR.editor.addStep)).toHaveLength(0);
    expect(buttonsLabelled(fixture, DELIVERY_PROCEDURE_FR.editor.revise)).toHaveLength(0);
  });

  it('parle la langue de l’écran', async () => {
    const fixture = await boot({ companyId: 'cmp_1', address: CHALET, canEdit: true }, 'en');

    expect(text(fixture)).toContain(DELIVERY_PROCEDURE_EN.entry);
    expect(text(fixture)).toContain(DELIVERY_PROCEDURE_EN.editor.emptyTitle);
    expect(buttonsLabelled(fixture, DELIVERY_PROCEDURE_EN.editor.addStep)).toHaveLength(1);
  });

  it('relit le carnet de la société quand le nombre d’étapes change', async () => {
    const fixture = await boot({ companyId: 'cmp_1', address: CHALET, canEdit: true });
    expect(refreshed).toEqual([]);

    buttonsLabelled(fixture, DELIVERY_PROCEDURE_FR.editor.addStep)[0]?.click();
    await settle(fixture);
    const title = (fixture.nativeElement as HTMLElement).querySelector(
      'fold-input input',
    ) as HTMLInputElement;
    title.value = 'Sonner à l’interphone';
    title.dispatchEvent(new Event('input'));
    await settle(fixture);
    buttonsLabelled(fixture, DELIVERY_PROCEDURE_FR.editor.add)[0]?.click();
    await settle(fixture);

    expect(refreshed).toEqual(['cmp_1']);
  });

  /** fold parle anglais par défaut : la confirmation de suppression doit dire nos mots. */
  it('la confirmation de suppression parle français', async () => {
    gateway.steps = [PORTAIL];
    const fixture = await boot({ companyId: 'cmp_1', address: CHALET, canEdit: true });

    buttonsLabelled(fixture, DELIVERY_PROCEDURE_FR.editor.revise)[0]?.click();
    await settle(fixture);
    buttonsLabelled(fixture, DELIVERY_PROCEDURE_FR.editor.removeAction)[0]?.click();
    await settle(fixture);

    expect(buttonsLabelled(fixture, 'Confirm')).toHaveLength(0);
    buttonsLabelled(fixture, DELIVERY_PROCEDURE_FR.editor.removeAction)[0]?.click();
    await settle(fixture);
    expect(gateway.removed).toEqual(['stp_1']);
    expect(refreshed).toEqual(['cmp_1']);
  });
});
