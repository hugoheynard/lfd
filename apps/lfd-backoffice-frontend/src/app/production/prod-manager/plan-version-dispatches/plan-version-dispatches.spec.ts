import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { DossierDispatchView, PlanVersionDossierResendPayload } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { PlanVersionsService } from '../../plan-versions/plan-versions.service';
import { PlanVersionDispatches } from './plan-version-dispatches';

/**
 * **Le renvoi de la version courante** : la question avant l'envoi, le corps
 * et la clé d'intention, l'annonce au parent après le 204, le refus du serveur
 * dit tel quel, le bouton « tous » caché quand tout le monde est à jour, et le
 * geste caché sans le droit. Instants comparés à aucune horloge : absolus.
 */

const AT = '2026-11-27T16:01:00.000Z';

function recipient(
  id: string,
  name: string,
  planVersion: number | null,
  outcome: 'sent' | 'requested' = 'sent',
): DossierDispatchView {
  return {
    recipientId: id,
    name,
    lastReceived: { at: AT, planVersion },
    lastAttempt: { at: AT, planVersion, outcome },
  };
}

interface Sent {
  readonly date: string;
  readonly payload: PlanVersionDossierResendPayload;
  readonly key: string;
}

async function render(
  dispatches: readonly DossierDispatchView[],
  options: { readonly allowed?: boolean; readonly fail?: unknown } = {},
): Promise<{ fixture: ComponentFixture<PlanVersionDispatches>; sent: Sent[]; resent: number[] }> {
  const sent: Sent[] = [];
  const resent: number[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: PlanVersionsService,
        useValue: {
          resend: async (date: string, payload: PlanVersionDossierResendPayload, key: string) => {
            sent.push({ date, payload, key });
            if (options.fail !== undefined) throw options.fail;
          },
        },
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: string) =>
            (options.allowed ?? true) && permission === 'production_count_stop:write',
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PlanVersionDispatches);
  fixture.componentRef.setInput('date', '2026-11-27');
  fixture.componentRef.setInput('dispatches', dispatches);
  fixture.componentRef.setInput('latest', 4);
  fixture.componentInstance.resent.subscribe(() => resent.push(1));
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, sent, resent };
}

function click(root: HTMLElement, selector: string): void {
  root.querySelector<HTMLButtonElement>(selector)?.click();
}

/** Ouvre la confirmation sous `scope` (son premier bouton est le déclencheur). */
function openConfirm(fixture: ComponentFixture<PlanVersionDispatches>, scope: Element): void {
  click(scope as HTMLElement, 'button');
  fixture.detectChanges();
}

/** Confirme la question ouverte sous `scope`. */
async function sayYes(
  fixture: ComponentFixture<PlanVersionDispatches>,
  scope: Element,
): Promise<void> {
  const buttons = [...scope.querySelectorAll<HTMLButtonElement>('button')];
  buttons.find((button) => button.textContent?.trim() === 'Renvoyer')?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function confirm(
  fixture: ComponentFixture<PlanVersionDispatches>,
  scope: Element,
): Promise<void> {
  openConfirm(fixture, scope);
  await sayYes(fixture, scope);
}

describe('PlanVersionDispatches', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('demande « à qui et quelle version », puis renvoie à la personne avec sa clé', async () => {
    const { fixture, sent, resent } = await render([recipient('r1', 'Jeanne Roux', 2)]);
    const row = (fixture.nativeElement as HTMLElement).querySelector('[data-dispatch-row]');
    expect(row).not.toBeNull();
    openConfirm(fixture, row as Element);
    expect(row?.textContent).toContain('Renvoyer le dossier version 4 à Jeanne Roux ?');
    expect(sent).toEqual([]);
    await sayYes(fixture, row as Element);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.date).toBe('2026-11-27');
    expect(sent[0]?.payload).toEqual({ target: 'recipient', recipientId: 'r1' });
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(resent).toHaveLength(1);
  });

  it('renvoie à tous ceux qui ne sont pas à jour, en disant combien', async () => {
    const { fixture, sent } = await render([
      recipient('r1', 'Jeanne Roux', 2),
      recipient('r2', 'Labo', null),
      recipient('r3', 'Fournil', 4),
    ]);
    const action = (fixture.nativeElement as HTMLElement).querySelector('[data-resend-outdated]');
    expect(action).not.toBeNull();
    openConfirm(fixture, action as Element);
    expect(action?.textContent).toContain(
      'Renvoyer le dossier version 4 à 2 destinataires pas à jour ?',
    );
    await sayYes(fixture, action as Element);
    expect(sent.map((entry) => entry.payload)).toContainEqual({ target: 'outdated' });
  });

  it('cache « tous » et le geste de ligne quand tout le monde est à jour', async () => {
    const { fixture } = await render([recipient('r1', 'Fournil', 4)]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-resend-outdated]')).toBeNull();
    expect(el.querySelector('[data-resend-one]')).toBeNull();
  });

  it('dit « Demandé » sur la ligne d’un renvoi demandé, jamais « a reçu »', async () => {
    const { fixture } = await render([recipient('r1', 'Fournil', 4, 'requested')]);
    const row = (fixture.nativeElement as HTMLElement).querySelector('[data-dispatch-row]');
    expect(row?.textContent).toContain('Demandé');
    expect(row?.textContent).not.toContain('A reçu');
  });

  it('montre le refus du serveur sur la ligne, et garde la clé pour le réessai', async () => {
    const refusal = new HttpErrorResponse({
      status: 409,
      error: {
        code: 'production.dossier_resend.up_to_date',
        message: 'Jeanne Roux a déjà la version 4.',
      },
    });
    const { fixture, sent, resent } = await render([recipient('r1', 'Jeanne Roux', 2)], {
      fail: refusal,
    });
    const row = (fixture.nativeElement as HTMLElement).querySelector('[data-dispatch-row]');
    await confirm(fixture, row as Element);
    expect(row?.querySelector('[data-resend-error]')?.textContent).toContain(
      'Jeanne Roux a déjà la version 4.',
    );
    expect(resent).toEqual([]);
    await confirm(fixture, row as Element);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.key).toBe(sent[0]?.key);
  });

  it('cache le geste à qui n’a pas le droit de l’arrêt', async () => {
    const { fixture } = await render([recipient('r1', 'Jeanne Roux', 2)], { allowed: false });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-resend-outdated]')).toBeNull();
    expect(el.querySelector('[data-resend-one]')).toBeNull();
    expect(el.textContent).toContain('Pas à jour');
  });
});
