import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { RequestKind, RequestReasonView, StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { RequestReasonsService } from '../request-reasons.service';
import { RequestReasonDialog } from '../request-reason-dialog/request-reason-dialog';
import { RequestReasonsList } from './request-reasons-list';

/** La page des objets : l'ordre du formulaire, le dialogue, et la relecture après un succès. */

function subject(id: string, position: number, active = true): RequestReasonView {
  return {
    kind: 'order_problem',
    id,
    label: { fr: `Objet ${id}`, en: '', it: '' },
    recipientEmail: `${id}@example.fr`,
    position,
    active,
    audience: 'b2c',
    priority: 'medium',
  };
}

interface Wire {
  subjects: RequestReasonView[] | null;
  kinds: RequestKind[];
  reads: number;
  opened: { component: unknown; data: unknown }[];
  answer: (result: string | undefined) => void;
  said: string[];
}

let wire: Wire;

async function boot(
  subjects: RequestReasonView[] | null,
  grants: readonly StaffPermission[] = ['b2b_contact:read', 'b2b_contact:write'],
): Promise<ComponentFixture<RequestReasonsList>> {
  wire = { kinds: [], subjects, reads: 0, opened: [], answer: () => undefined, said: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RequestReasonsList],
    providers: [
      {
        provide: RequestReasonsService,
        useValue: {
          list: (kind: RequestKind) => {
            wire.kinds.push(kind);
            wire.reads += 1;
            return wire.subjects === null
              ? Promise.reject(new Error('indisponible'))
              : Promise.resolve(wire.subjects);
          },
        } satisfies Pick<RequestReasonsService, 'list'>,
      },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => grants.includes(p) } },
      { provide: NotifyService, useValue: { success: (m: string) => wire.said.push(m) } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown, config: { data: unknown }) => {
            wire.opened.push({ component, data: config.data });
            return {
              closed: new Promise<string | undefined>((resolve) => {
                wire.answer = resolve;
              }),
            };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(RequestReasonsList);
  fixture.componentRef.setInput('kind', 'order_problem');
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<RequestReasonsList>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<RequestReasonsList>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('RequestReasonsList', () => {
  it('liste les objets dans l’ordre du formulaire, et signale ceux qui ne sont pas proposés', async () => {
    const fixture = await boot([subject('b', 5, false), subject('a', 1)]);
    const titles = [...host(fixture).querySelectorAll('[data-reason]')].map((card) =>
      card.textContent?.includes('Objet a') ? 'a' : 'b',
    );

    expect(titles).toEqual(['a', 'b']);
    expect(host(fixture).querySelectorAll('[data-inactive]')).toHaveLength(1);
    expect(host(fixture).querySelector('[data-priority]')?.textContent).toContain('Moyenne');
  });

  it('« Ajouter » ouvre le dialogue après le dernier rang, puis relit sur un succès', async () => {
    const fixture = await boot([subject('a', 4)]);
    host(fixture).querySelector<HTMLButtonElement>('button[data-add]')?.click();

    expect(wire.opened).toEqual([
      {
        component: RequestReasonDialog,
        data: { kind: 'order_problem', nextPosition: 5, canWrite: true },
      },
    ]);
    wire.answer('saved');
    await settle(fixture);
    expect(wire.reads).toBe(2);
    // Le motif ajouté prend le type de l'onglet, et la liste relit ce type-là.
    expect(wire.kinds).toEqual(['order_problem', 'order_problem']);
    expect(wire.said).toEqual(['Motif ajouté.']);
  });

  it('un dialogue fermé sans succès ne relit rien', async () => {
    const fixture = await boot([subject('a', 0)]);
    host(fixture).querySelector<HTMLButtonElement>('button[data-open]')?.click();
    wire.answer(undefined);
    await settle(fixture);

    expect(wire.reads).toBe(1);
  });

  it('en lecture seule : pas d’ajout, et le dialogue s’ouvre sans écriture', async () => {
    const fixture = await boot([subject('a', 0)], ['b2b_contact:read']);
    expect(host(fixture).querySelector('button[data-add]')).toBeNull();

    host(fixture).querySelector<HTMLButtonElement>('button[data-open]')?.click();
    expect(wire.opened[0]?.data).toMatchObject({ canWrite: false });
  });

  it('un échec de lecture se dit en état d’erreur, pas en liste vide', async () => {
    const fixture = await boot(null);
    expect(host(fixture).textContent).toContain('Impossible de charger les motifs');
    expect(host(fixture).querySelector('[data-empty]')).toBeNull();
  });
});
