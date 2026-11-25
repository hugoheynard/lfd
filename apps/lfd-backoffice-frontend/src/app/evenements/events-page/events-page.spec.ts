import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { CreateEventPayload, EventSummaryView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi, type MockInstance } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { EventsService } from '../events.service';
import { EventsPage } from './events-page';

const WEDDING: EventSummaryView = {
  id: 'evt_1',
  name: 'Mariage Durand',
  date: '2026-12-12',
  applications: ['lafoliecoffee'],
  functionSheetCount: 2,
};

interface Rendered {
  readonly root: HTMLElement;
  readonly page: EventsPage;
  readonly created: { payload: CreateEventPayload; key: string }[];
  readonly navigate: MockInstance<Router['navigate']>;
}

async function render(
  list: () => Promise<readonly EventSummaryView[]>,
  granted: readonly StaffPermission[] = ['events:read', 'events:write'],
): Promise<Rendered> {
  const created: { payload: CreateEventPayload; key: string }[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [EventsPage],
    providers: [
      provideRouter([]),
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
      {
        provide: NotifyService,
        useValue: { success: () => {}, error: () => {}, refused: () => {} },
      },
      {
        provide: EventsService,
        useValue: {
          list,
          create: async (payload: CreateEventPayload, key: string) => {
            created.push({ payload, key });
            return { id: 'evt_new' };
          },
        } satisfies Pick<EventsService, 'list' | 'create'>,
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(EventsPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    root: fixture.nativeElement as HTMLElement,
    page: fixture.componentInstance,
    created,
    navigate,
  };
}

/** Le geste « Créer », sans passer par le DOM du popover (projeté hors du composant). */
function createWith(page: EventsPage, name: string, date: string): Promise<void> {
  page.draftName.set(name);
  page.draftDate.set(date);
  return page.create();
}

describe('EventsPage', () => {
  it('montre la table : nom, date, applications, nombre de fiches', async () => {
    const { root } = await render(async () => [WEDDING]);
    expect(root.textContent).toContain('Mariage Durand');
    expect(root.textContent).toContain('samedi 12 décembre 2026');
    expect(root.textContent).toContain('La Folie Coffee');
    expect(root.textContent).toContain('2');
  });

  it('dit le vide, et l’erreur avec « Réessayer »', async () => {
    expect((await render(async () => [])).root.textContent).toContain('Aucun événement');
    const failed = await render(() => Promise.reject(new Error('panne')));
    expect(failed.root.textContent).toContain('Impossible de charger les événements');
    expect(failed.root.textContent).not.toContain('Aucun événement');
  });

  it('ne propose de créer qu’avec le droit d’écrire', async () => {
    expect((await render(async () => [])).root.querySelector('[data-create-open]')).not.toBeNull();
    const reader = await render(async () => [], ['events:read']);
    expect(reader.root.querySelector('[data-create-open]')).toBeNull();
  });

  it('crée sous une clé, nom rogné, puis mène au détail', async () => {
    const { page, created, navigate } = await render(async () => []);
    await createWith(page, '  Gala  ', '2026-12-31');
    expect(created).toHaveLength(1);
    expect(created[0]?.payload).toEqual({ name: 'Gala', date: '2026-12-31' });
    expect(created[0]?.key).toMatch(/.+/u);
    expect(navigate).toHaveBeenCalledWith(['/evenements', 'evt_new']);
  });

  it('n’envoie rien sans nom', async () => {
    const { page, created } = await render(async () => []);
    await createWith(page, '   ', '2026-12-31');
    expect(created).toHaveLength(0);
  });
});
