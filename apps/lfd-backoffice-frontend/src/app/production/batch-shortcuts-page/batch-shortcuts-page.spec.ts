import { TestBed } from '@angular/core/testing';
import type { BatchShortcutsSettingsView, ProductionContainerView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import type { BatchShortcutDialogData } from '../batch-shortcut-dialog/batch-shortcut-dialog';
import { BatchShortcutsService } from '../batch-shortcuts.service';
import type { ProductionContainerDialogData } from '../production-container-dialog/production-container-dialog';
import { ProductionContainersService } from '../production-containers.service';
import { BatchShortcutsPage } from './batch-shortcuts-page';

/** Réglages › Production › Raccourcis du fournil (plan des raccourcis, S1). */

const VIEW: BatchShortcutsSettingsView = {
  articles: [
    { sku: 'VIE-001', name: 'Croissant', familyId: 'fam-vien', familyName: 'Viennoiseries' },
    { sku: 'VIE-002', name: 'Pain au chocolat', familyId: 'fam-vien', familyName: 'Viennoiseries' },
    { sku: 'PAI-001', name: 'Baguette', familyId: 'fam-pain', familyName: 'Pains' },
  ],
  shortcuts: [
    { id: 'bs-1', sku: 'VIE-001', label: '1 plaque', pieces: 24, position: 0 },
    { id: 'bs-2', sku: 'VIE-001', label: '1 chariot', pieces: 96, position: 1 },
  ],
};

class FakeShortcuts {
  reads = 0;
  settings(): Promise<BatchShortcutsSettingsView> {
    this.reads += 1;
    return Promise.resolve(VIEW);
  }
}

class FakeContainers {
  reads = 0;
  list(): Promise<readonly ProductionContainerView[]> {
    this.reads += 1;
    return Promise.resolve([
      { sku: 'VIE-001', unitsPerContainer: 24, singular: 'plaque', plural: 'plaques' },
    ]);
  }
}

/** Le dialogue doublé : il rend ce qu'on lui a fait répondre, et garde ce qu'on lui a ouvert. */
class FakePanels {
  answer: boolean | undefined = true;
  readonly asked: {
    data: BatchShortcutDialogData | ProductionContainerDialogData;
    side: string;
  }[] = [];
  open(
    _component: unknown,
    config: { data: BatchShortcutDialogData | ProductionContainerDialogData; side: string },
  ): { closed: Promise<boolean | undefined> } {
    this.asked.push(config);
    return { closed: Promise.resolve(this.answer) };
  }
}

async function mount(canWrite = true, phone = false) {
  // jsdom n'a pas `matchMedia` : chaque test dit s'il est au bureau ou au pouce.
  vi.stubGlobal('matchMedia', () => ({
    matches: phone,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const api = new FakeShortcuts();
  const containers = new FakeContainers();
  const panels = new FakePanels();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BatchShortcutsPage],
    providers: [
      { provide: BatchShortcutsService, useValue: api },
      { provide: ProductionContainersService, useValue: containers },
      { provide: FoldPanelHostService, useValue: panels },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: string) => canWrite || !permission.endsWith(':write'),
        } satisfies Pick<PermissionsStore, 'can'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(BatchShortcutsPage);
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const root = fixture.nativeElement as HTMLElement;
  return { api, containers, panels, root, settle };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BatchShortcutsPage', () => {
  it('montre chaque produit, ses pastilles « nom · pièces » et le bouton d’ajout', async () => {
    const { root } = await mount();

    const row = root.querySelector('[data-shortcut-row="VIE-001"]');
    expect(
      [...(row?.querySelectorAll('[data-shortcut-chip]') ?? [])].map((chip) =>
        chip.textContent?.trim(),
      ),
    ).toEqual(['1 plaque · 24', '1 chariot · 96']);
    expect(root.querySelectorAll('[data-shortcut-add]')).toHaveLength(3);
    expect(root.textContent).toContain('Baguette');
  });

  it('« Ajouter un raccourci » ouvre le dialogue centré au bureau, puis relit', async () => {
    const { root, panels, api, settle } = await mount();

    root
      .querySelector<HTMLButtonElement>('[data-shortcut-row="PAI-001"] [data-shortcut-add]')
      ?.click();
    await settle();

    expect(panels.asked[0]).toMatchObject({
      side: 'center',
      data: { sku: 'PAI-001', productName: 'Baguette', shortcut: null, canWrite: true },
    });
    expect(api.reads).toBe(2);
  });

  it('une pastille ouvre son raccourci, en feuille du bas sur téléphone', async () => {
    const { root, panels } = await mount(true, true);

    root.querySelector<HTMLButtonElement>('[data-shortcut-chip="bs-2"]')?.click();
    await Promise.resolve();

    expect(panels.asked[0]).toMatchObject({
      side: 'bottom',
      data: { sku: 'VIE-001', shortcut: { id: 'bs-2', label: '1 chariot' } },
    });
  });

  it('un dialogue fermé sans changement ne relit pas', async () => {
    const { root, panels, api, settle } = await mount();
    panels.answer = undefined;

    root.querySelector<HTMLButtonElement>('[data-shortcut-chip="bs-1"]')?.click();
    await settle();

    expect(api.reads).toBe(1);
  });

  it('sans le droit d’écrire : des pastilles muettes, aucun bouton', async () => {
    const { root } = await mount(false);

    expect(root.querySelectorAll('[data-shortcut-add]')).toHaveLength(0);
    expect(root.querySelectorAll('button[data-shortcut-chip]')).toHaveLength(0);
    expect(root.querySelectorAll('[data-shortcut-chip]')).toHaveLength(2);
  });

  it('montre le contenant principal réglé, et propose de le régler ailleurs', async () => {
    const { root } = await mount();

    expect(
      root
        .querySelector('[data-container-row="VIE-001"] [data-container-chip]')
        ?.textContent?.trim(),
    ).toBe('1 plaque · 24');
    expect(root.querySelectorAll('[data-container-set]')).toHaveLength(2);
  });

  it('le contenant ouvre son dialogue, puis relit raccourcis et contenants', async () => {
    const { root, panels, api, containers, settle } = await mount();

    root.querySelector<HTMLButtonElement>('[data-container-row="VIE-001"] button')?.click();
    await settle();

    expect(panels.asked[0]).toMatchObject({
      side: 'center',
      data: {
        sku: 'VIE-001',
        productName: 'Croissant',
        container: { unitsPerContainer: 24, singular: 'plaque' },
        canWrite: true,
      },
    });
    expect(api.reads).toBe(2);
    expect(containers.reads).toBe(2);
  });

  it('sans le droit d’écrire : le contenant se lit, sans bouton', async () => {
    const { root } = await mount(false);

    expect(root.querySelectorAll('[data-container-set]')).toHaveLength(0);
    expect(root.querySelectorAll('button[data-container-chip]')).toHaveLength(0);
    expect(root.querySelectorAll('[data-container-chip]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-container-none]')).toHaveLength(2);
  });
});
