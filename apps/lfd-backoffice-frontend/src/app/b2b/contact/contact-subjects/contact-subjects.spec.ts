import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ContactSubjectView, StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { ContactService } from '../contact.service';
import { ContactSubjectDialog } from '../contact-subject-dialog/contact-subject-dialog';
import { ContactSubjects } from './contact-subjects';

/** La page des objets : l'ordre du formulaire, le dialogue, et la relecture après un succès. */

function subject(id: string, position: number, active = true): ContactSubjectView {
  return {
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
  subjects: ContactSubjectView[] | null;
  reads: number;
  opened: { component: unknown; data: unknown }[];
  answer: (result: string | undefined) => void;
  said: string[];
}

let wire: Wire;

async function boot(
  subjects: ContactSubjectView[] | null,
  grants: readonly StaffPermission[] = ['b2b_contact:read', 'b2b_contact:write'],
): Promise<ComponentFixture<ContactSubjects>> {
  wire = { subjects, reads: 0, opened: [], answer: () => undefined, said: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ContactSubjects],
    providers: [
      {
        provide: ContactService,
        useValue: {
          subjects: () => {
            wire.reads += 1;
            return wire.subjects === null
              ? Promise.reject(new Error('indisponible'))
              : Promise.resolve(wire.subjects);
          },
        } satisfies Pick<ContactService, 'subjects'>,
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
  const fixture = TestBed.createComponent(ContactSubjects);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<ContactSubjects>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<ContactSubjects>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('ContactSubjects', () => {
  it('liste les objets dans l’ordre du formulaire, et signale ceux qui ne sont pas proposés', async () => {
    const fixture = await boot([subject('b', 5, false), subject('a', 1)]);
    const titles = [...host(fixture).querySelectorAll('[data-subject]')].map((card) =>
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
      { component: ContactSubjectDialog, data: { nextPosition: 5, canWrite: true } },
    ]);
    wire.answer('saved');
    await settle(fixture);
    expect(wire.reads).toBe(2);
    expect(wire.said).toEqual(['Objet ajouté.']);
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
    expect(host(fixture).textContent).toContain('Impossible de charger les objets de contact');
    expect(host(fixture).querySelector('[data-empty]')).toBeNull();
  });
});
