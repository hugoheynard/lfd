import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { EventDetailView, ReviseEventPayload, StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { EventsService } from '../events.service';
import { EventPage } from './event-page';

const EVENT: EventDetailView = {
  id: 'evt_1',
  name: 'Mariage Durand',
  date: '2026-12-12',
  applications: ['lafoliecoffee'],
  archivedAt: null,
  functionSheets: [],
};

async function render(
  event: EventDetailView,
  granted: readonly StaffPermission[] = ['events:read', 'events:write'],
) {
  const revised: ReviseEventPayload[] = [];
  const archived: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
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
          detail: async () => event,
          archive: async (id: string) => {
            archived.push(id);
          },
          revise: async (_id: string, payload: ReviseEventPayload) => {
            revised.push(payload);
          },
        } satisfies Pick<EventsService, 'detail' | 'revise' | 'archive'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(EventPage);
  fixture.componentRef.setInput('id', event.id);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    fixture,
    root: fixture.nativeElement as HTMLElement,
    page: fixture.componentInstance,
    revised,
    archived,
  };
}

describe('EventPage', () => {
  it('montre le nom, la date et les fiches, et n’enregistre rien tant que rien ne change', async () => {
    const { root } = await render(EVENT);
    expect(root.textContent).toContain('Mariage Durand');
    expect(root.textContent).toContain('Fiches de fonction');
    const save = root.querySelector<HTMLButtonElement>('[data-event-save]');
    expect(save?.disabled).toBe(true);
  });

  it('n’envoie que ce qui a changé', async () => {
    const { fixture, root, page, revised } = await render(EVENT);
    page.draftDate.set('2026-12-13');
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[data-event-save]')?.click();
    await fixture.whenStable();
    expect(revised).toEqual([{ date: '2026-12-13' }]);
  });

  it('un événement archivé ne se modifie plus', async () => {
    const { root } = await render({ ...EVENT, archivedAt: '2026-11-20T10:00:00.000Z' });
    expect(root.querySelector('[data-archived]')).not.toBeNull();
    expect(root.querySelector('[data-event-save]')).toBeNull();
  });

  it('sans le droit d’écrire, rien ne s’enregistre', async () => {
    const { root } = await render(EVENT, ['events:read']);
    expect(root.querySelector('[data-event-save]')).toBeNull();
  });

  it('archive puis revient à la table', async () => {
    const { page, archived } = await render(EVENT);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await page.archive();
    expect(archived).toEqual(['evt_1']);
    expect(navigate).toHaveBeenCalledWith(['/evenements']);
  });
});
