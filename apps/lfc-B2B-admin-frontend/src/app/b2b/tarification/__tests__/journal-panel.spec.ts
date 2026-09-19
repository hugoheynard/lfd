import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { PricingJournalEntryView, PricingJournalPageView } from '@lfd/contracts';
import { FoldPaginatorComponent, FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { JournalPanel, type JournalPanelData } from '../journal-panel/journal-panel';
import { TarificationService } from '../tarification.service';

/**
 * **Le journal, tel qu'il se lit.**
 *
 * Ce que ces cas protègent : la phrase affichée est celle **figée à l'écriture**
 * (jamais un rendu de l'état courant), le motif est cité quand il existe, et un
 * journal vide se dit au lieu de laisser un blanc.
 */

const DATA: JournalPanelData = {
  subjectType: 'rule',
  subjectId: 'rule_1',
  target: 'Promo de rentrée',
};

function entry(overrides: Partial<PricingJournalEntryView> = {}): PricingJournalEntryView {
  return {
    id: 'evt_1',
    subjectType: 'rule',
    subjectId: 'rule_1',
    act: 'paused',
    actor: 'auth0|marc',
    actorName: null,
    occurredAt: '2026-08-12T14:05:00.000Z',
    reason: null,
    summary: 'Promotion « Promo de rentrée » · −10 % · tout le catalogue, tous clients',
    ...overrides,
  };
}

/** Ce que le panneau a demandé au service, dans l'ordre. */
type JournalRequest = Parameters<TarificationService['journalPage']>[2];

function pageOf(
  entries: readonly PricingJournalEntryView[],
  overrides: Partial<PricingJournalPageView> = {},
): PricingJournalPageView {
  return {
    entries,
    total: entries.length,
    page: 1,
    pageSize: 20,
    asOf: entries.length === 0 ? null : 'evt_anchor',
    ...overrides,
  };
}

interface Mounted {
  readonly fixture: ComponentFixture<JournalPanel>;
  readonly requests: JournalRequest[];
}

function mountPaged(respond: (request: JournalRequest) => PricingJournalPageView): Mounted {
  const requests: JournalRequest[] = [];
  const service: Pick<TarificationService, 'journalPage'> = {
    journalPage: (_type, _id, request) => {
      requests.push(request);
      return Promise.resolve(respond(request));
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: TarificationService, useValue: service },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(JournalPanel);
  fixture.componentRef.setInput('data', DATA);
  fixture.detectChanges();
  return { fixture, requests };
}

function mount(entries: PricingJournalEntryView[]): ComponentFixture<JournalPanel> {
  return mountPaged(() => pageOf(entries)).fixture;
}

/** Le paginateur rendu, pour lui faire émettre un changement de page. */
function paginator(fixture: ComponentFixture<JournalPanel>): FoldPaginatorComponent | null {
  const debug = fixture.debugElement.query(By.directive(FoldPaginatorComponent));
  return debug === null ? null : debug.injector.get(FoldPaginatorComponent);
}

async function settled(fixture: ComponentFixture<JournalPanel>): Promise<string> {
  await fixture.whenStable();
  fixture.detectChanges();
  return String(fixture.nativeElement.textContent ?? '');
}

describe('lire le journal', () => {
  it('rend le verbe dans les mots de la maison', async () => {
    expect(await settled(mount([entry()]))).toContain('Suspendue');
  });

  /**
   * La phrase vient du journal, pas de l'état courant : c'est ce qui permet de
   * lire un acte dont la règle a été archivée depuis.
   */
  it("affiche la phrase figée au moment de l'acte", async () => {
    const text = await settled(mount([entry({ summary: 'Promotion « Vieux nom » · −25 %' })]));

    expect(text).toContain('Vieux nom');
  });

  it("cite le motif quand quelqu'un en a écrit un", async () => {
    const text = await settled(mount([entry({ reason: 'Four en panne' })]));

    expect(text).toContain('Four en panne');
  });

  it("nomme l'auteur de l'acte", async () => {
    const text = await settled(mount([entry({ actorName: 'Marc Dupont' })]));

    expect(text).toContain('par Marc Dupont');
    expect(text).not.toContain('auth0|marc');
  });

  it('garde la valeur brute quand elle ne désigne personne', async () => {
    expect(await settled(mount([entry({ actor: 'system' })]))).toContain('par system');
  });

  /**
   * L'heure compte, à la différence d'une date de validité : « suspendue à
   * 16 h 05 » répond à « pourquoi la commande de 16 h 10 n'a pas eu la remise ».
   */
  it("donne le jour ET l'heure", async () => {
    expect(await settled(mount([entry()]))).toMatch(/\d{2}:\d{2}/);
  });

  /**
   * Un journal vide n'est pas une erreur : c'est une décision antérieure au
   * journal. Le dire vaut mieux qu'un blanc que le lecteur prendrait pour un bug.
   */
  it('explique un journal vide au lieu de laisser un blanc', async () => {
    expect(await settled(mount([]))).toContain('Aucun acte enregistré');
  });
});

describe('le journal par pages', () => {
  const FORTY_FIVE = 45;

  it('ouvre la page 1, vingt actes, sans ancre', async () => {
    const { fixture, requests } = mountPaged(() => pageOf([entry()]));
    await settled(fixture);

    expect(requests).toEqual([{ page: 1, pageSize: 20 }]);
  });

  it('annonce le total de l’instantané, pas celui de la page', async () => {
    const { fixture } = mountPaged(() => pageOf([entry()], { total: FORTY_FIVE }));

    expect(await settled(fixture)).toContain('1–20 sur 45');
  });

  it('ne pose pas de paginateur quand tout tient sur une page', async () => {
    const { fixture } = mountPaged(() => pageOf([entry()]));
    await settled(fixture);

    expect(paginator(fixture)).toBeNull();
  });

  /**
   * Sans l'ancre, un acte écrit entre deux clics pousserait tout d'un rang :
   * la page 2 répéterait la dernière ligne de la page 1.
   */
  it("renvoie l'ancre de la page 1 pour lire la page 2", async () => {
    const { fixture, requests } = mountPaged((request) =>
      pageOf([entry({ id: `evt_p${request.page}` })], {
        total: FORTY_FIVE,
        page: request.page,
      }),
    );
    await settled(fixture);

    paginator(fixture)?.pageChange.emit(2);
    const text = await settled(fixture);

    expect(requests[1]).toEqual({ page: 2, pageSize: 20, asOf: 'evt_anchor' });
    expect(text).toContain('21–40 sur 45');
  });

  /** Revenir à la page 1 est le geste qui montre ce qui est arrivé depuis. */
  it('rouvre un instantané neuf en revenant à la page 1', async () => {
    const { fixture, requests } = mountPaged((request) =>
      pageOf([entry()], { total: FORTY_FIVE, page: request.page }),
    );
    await settled(fixture);
    paginator(fixture)?.pageChange.emit(3);
    await settled(fixture);

    paginator(fixture)?.pageChange.emit(1);
    await settled(fixture);

    expect(requests.at(-1)).toEqual({ page: 1, pageSize: 20 });
  });
});
