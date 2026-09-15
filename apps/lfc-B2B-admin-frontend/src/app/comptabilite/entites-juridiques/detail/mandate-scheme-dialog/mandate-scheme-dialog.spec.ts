import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { MandateSchemeUsageView, SepaScheme } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import { MandateSchemeDialog } from './mandate-scheme-dialog';

interface Wire {
  reads: string[];
  closes: unknown[];
  /** Ce que rend la lecture ; `null` = le serveur refuse. */
  usage: MandateSchemeUsageView | null;
}

let wire: Wire;

function usage(over: Partial<MandateSchemeUsageView> = {}): MandateSchemeUsageView {
  return { scheme: 'B2B', activeByScheme: { CORE: 0, B2B: 0 }, drafts: 0, ...over };
}

async function boot(
  from: SepaScheme,
  to: SepaScheme,
  answer: MandateSchemeUsageView | null = usage({ scheme: from }),
): Promise<ComponentFixture<MandateSchemeDialog>> {
  wire = { reads: [], closes: [], usage: answer };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MandateSchemeDialog],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          mandateSchemeUsage: (id: string): Promise<MandateSchemeUsageView> => {
            wire.reads.push(id);
            return wire.usage === null
              ? Promise.reject(new Error('indisponible'))
              : Promise.resolve(wire.usage);
          },
        },
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(MandateSchemeDialog);
  fixture.componentRef.setInput('data', { entityId: 'le1', from, to });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<MandateSchemeDialog>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const confirmButton = (fixture: ComponentFixture<MandateSchemeDialog>): HTMLButtonElement | null =>
  host(fixture).querySelector<HTMLButtonElement>('button.msd-confirm');

describe('MandateSchemeDialog', () => {
  it('lit l’usage des mandats de l’entité à l’ouverture', async () => {
    await boot('B2B', 'CORE');

    expect(wire.reads).toEqual(['le1']);
  });

  it('vers CORE : nomme les 8 semaines de remboursement, et rien sur la banque', async () => {
    const fixture = await boot('B2B', 'CORE');
    const consequence = host(fixture).querySelector('.msd-consequence')?.textContent ?? '';

    expect(consequence).toContain('8 semaines');
    expect(consequence).not.toContain('banque');
    expect(consequence).not.toContain('interentreprises');
  });

  it('vers interentreprises : aucun remboursement, et la déclaration à la banque', async () => {
    const fixture = await boot('CORE', 'B2B');
    const consequence = host(fixture).querySelector('.msd-consequence')?.textContent ?? '';

    expect(consequence).toContain('aucun remboursement');
    expect(consequence).toContain('déclarer son mandat à sa banque');
    expect(consequence).not.toContain('8 semaines');
  });

  it('chiffre les brouillons caducs et les actifs qui gardent l’ancien schéma', async () => {
    const fixture = await boot(
      'B2B',
      'CORE',
      // Les actifs déjà en CORE ne restent pas « en arrière » : seuls les B2B comptent.
      usage({ activeByScheme: { CORE: 5, B2B: 2 }, drafts: 3 }),
    );

    expect(host(fixture).querySelector('.msd-drafts')?.textContent).toContain(
      '3 brouillons de mandat deviendront caducs',
    );
    expect(host(fixture).querySelector('.msd-actives')?.textContent).toContain(
      '2 mandats actifs gardent leur schéma (SEPA interentreprises (B2B))',
    );
  });

  it('accorde au singulier, et dit l’absence plutôt qu’un zéro', async () => {
    const one = await boot(
      'CORE',
      'B2B',
      usage({ activeByScheme: { CORE: 1, B2B: 0 }, drafts: 1 }),
    );
    expect(host(one).querySelector('.msd-drafts')?.textContent).toContain(
      '1 brouillon de mandat deviendra caduc',
    );
    expect(host(one).querySelector('.msd-actives')?.textContent).toContain('1 mandat actif garde');

    const none = await boot('CORE', 'B2B');
    expect(host(none).querySelector('.msd-drafts')?.textContent).toContain('Aucun brouillon');
    expect(host(none).querySelector('.msd-actives')?.textContent).toContain(
      'Aucun mandat actif sous SEPA CORE',
    );
  });

  it('confirmer rend `true`, annuler rend `false`', async () => {
    const fixture = await boot('B2B', 'CORE');

    confirmButton(fixture)?.click();
    expect(wire.closes).toEqual([true]);

    const other = await boot('B2B', 'CORE');
    const cancel = Array.from(host(other).querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Annuler'),
    );
    cancel?.click();
    expect(wire.closes).toEqual([false]);
  });

  it('🔴 une lecture refusée ne laisse pas confirmer à l’aveugle', async () => {
    const fixture = await boot('B2B', 'CORE', null);

    expect(host(fixture).querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    expect(confirmButton(fixture)?.disabled).toBe(true);
    confirmButton(fixture)?.click();
    expect(wire.closes).toEqual([]);
  });
});
