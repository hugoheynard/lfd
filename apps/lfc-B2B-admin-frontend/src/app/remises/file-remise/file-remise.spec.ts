import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { HandoverQueueEntryView } from '@lfd/contracts';

import { FileRemise } from './file-remise';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - **chaque colonne rend quelque chose.** `fold-data-table` n'a aucun rendu par
 *   défaut : une colonne sans `foldCell` rend une cellule VIDE sans que rien ne
 *   rougisse. Les cas lisent donc le texte réellement produit ;
 * - 🔴 **une commande sans créneau reste à l'écran** et ne se voit pas prêter
 *   d'heure — c'est le cas de masse depuis le backfill du 2026-08-15 ;
 * - 🔴 **une commande annulée reste dans la file** : la masquer laisserait
 *   quelqu'un chercher une commande disparue ;
 * - 🔴 **le retard est une NOTE** : présente sans qu'on clique, absente
 *   ailleurs, et aucune ligne ne porte de chevron ;
 * - **l'ordre de la file est posé ICI**, pas par l'appelant.
 *
 * 🔴 **L'instant est une ENTRÉE**, ce qui est tout l'intérêt d'avoir sorti la
 * table de l'écran : le retard s'éprouve enfin au DOM, sur un jour et une heure
 * qu'un cas choisit. Tant que l'horloge battait dans le composant de page, un
 * cas qui fabriquait un retard devait dériver son heure de `Date.now()` — et se
 * cassait au passage de minuit.
 */

const DAY = '2026-09-10';

function entry(over: Partial<HandoverQueueEntryView> = {}): HandoverQueueEntryView {
  return {
    orderId: 'ord_1',
    reference: 'CMD-1042',
    customerLabel: 'Boulangerie Marin',
    pickupLabel: 'Laboratoire',
    fulfillmentMethod: 'pickup',
    window: { start: '06:00', end: '08:00', source: 'default' },
    totalUnits: 12,
    placedAt: `${DAY}T05:00:00.000Z`,
    state: 'expected',
    handedOverAt: null,
    handedOverVia: null,
    readyAt: null,
    ...over,
  };
}

interface Options {
  readonly now?: Date;
  readonly reminded?: ReadonlySet<string>;
  readonly busyId?: string | null;
}

function render(
  entries: readonly HandoverQueueEntryView[],
  options: Options = {},
): ComponentFixture<FileRemise> {
  TestBed.configureTestingModule({ imports: [FileRemise] });
  const fixture: ComponentFixture<FileRemise> = TestBed.createComponent(FileRemise);
  fixture.componentRef.setInput('entries', entries);
  fixture.componentRef.setInput('day', DAY);
  fixture.componentRef.setInput('now', options.now ?? new Date(`${DAY}T07:00:00`));
  fixture.componentRef.setInput('reminded', options.reminded ?? new Set());
  fixture.componentRef.setInput('busyId', options.busyId ?? null);
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<FileRemise>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

const rowTexts = (fixture: ComponentFixture<FileRemise>): readonly string[] =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr.folddt-row')].map(
    (row) => row.textContent ?? '',
  );

const note = (fixture: ComponentFixture<FileRemise>): string =>
  (fixture.nativeElement as HTMLElement).querySelector('tbody tr.folddt-note-row')?.textContent ??
  '';

/** Une tranche demandée et dépassée, jugée à une heure que le cas choisit. */
const LATE = { start: '06:00', end: '06:30', source: 'override' } as const;

describe('FileRemise', () => {
  it('rend chaque colonne de la ligne', () => {
    const body = text(render([entry()]));

    expect(body).toContain('Boulangerie Marin');
    expect(body).toContain('CMD-1042');
    expect(body).toContain('12');
    expect(body).toContain('Attendue');
    expect(body).toContain('6 h 00 – 8 h 00');
  });

  it('🔴 une commande sans créneau reste à l’écran et le DIT', () => {
    const body = text(render([entry({ window: null })]));

    expect(body).toContain('Sans créneau');
    expect(body).toContain('Boulangerie Marin');
  });

  it('🔴 une commande annulée reste dans la file', () => {
    const fixture = render([entry({ state: 'cancelled' })]);

    expect(rowTexts(fixture)).toHaveLength(1);
    expect(text(fixture)).toContain('Annulée');
  });

  it('🔴 une remise porte son heure sous le nom, à la place du numéro', () => {
    const row =
      rowTexts(
        render([entry({ state: 'handed_over', handedOverAt: `${DAY}T04:41:00.000Z` })]),
      )[0] ?? '';

    expect(row).toContain('remise');
    expect(row).not.toContain('CMD-1042');
    expect(row).toContain('Remise');
  });

  it('ordonne la file par créneau, la ligne sans créneau en dernier', () => {
    const rows = rowTexts(
      render([
        entry({ orderId: 'c', reference: 'CMD-C', window: null }),
        entry({
          orderId: 'b',
          reference: 'CMD-B',
          window: { start: '09:00', end: '10:00', source: 'override' },
        }),
        entry({
          orderId: 'a',
          reference: 'CMD-A',
          window: { start: '06:00', end: '07:00', source: 'override' },
        }),
      ]),
    );

    expect(rows[0]).toContain('CMD-A');
    expect(rows[1]).toContain('CMD-B');
    expect(rows[2]).toContain('CMD-C');
  });

  it('🔴 le retard s’écrit sous la ligne, avec ses minutes', () => {
    const fixture = render([entry({ window: LATE, readyAt: `${DAY}T05:00:00.000Z` })], {
      now: new Date(`${DAY}T07:26:00`),
    });

    expect(note(fixture)).toContain('56 min de retard');
    // Et pas dans la colonne d'état, où il ferait doublon : la même minute
    // écrite deux fois, dans deux tons, fait chercher une différence.
    expect(rowTexts(fixture)[0] ?? '').not.toContain('de retard');
  });

  it('🔴 ne parle pas de retard sur un créneau `default`, même largement dépassé', () => {
    // Une heure d'ouverture recopiée à la commande : l'écran ne doit pas
    // allumer une alarme que personne n'a promise. Le backfill du 2026-08-15 en
    // a posé une sur l'intégralité des commandes antérieures.
    const fixture = render(
      [entry({ window: { start: '06:00', end: '06:30', source: 'default' } })],
      {
        now: new Date(`${DAY}T23:00:00`),
      },
    );

    expect(note(fixture)).toBe('');
    expect(text(fixture)).toContain('Attendue');
  });

  it('🔴 une ligne sans retard n’émet AUCUNE rangée de note', () => {
    // Une rangée vide n'est pas invisible : un lecteur d'écran y entre et
    // annonce une ligne blanche par commande.
    const fixture = render([entry()]);

    expect((fixture.nativeElement as HTMLElement).querySelector('.folddt-note-row')).toBeNull();
  });

  it('🔴 AUCUN chevron : rien n’est caché, rien n’est à déplier', () => {
    const el = render([entry({ window: LATE })], { now: new Date(`${DAY}T09:00:00`) })
      .nativeElement as HTMLElement;

    expect(el.querySelector('button.folddt-expand')).toBeNull();
    expect(el.querySelector('tbody [aria-expanded]')).toBeNull();
  });

  it('🔴 le rappel est DÉSARMÉ tant que le fournil n’a rien déclaré prêt', () => {
    // Un rappel qui ferait venir quelqu'un devant un comptoir vide est pire que
    // pas de rappel. Le serveur refuse aussi ; ici on évite d'armer un bouton
    // dont on connaît la réponse, et on dit pourquoi.
    const fixture = render([entry({ window: LATE, readyAt: null })], {
      now: new Date(`${DAY}T09:00:00`),
    });
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'tr.folddt-note-row button',
    );

    expect(button?.hasAttribute('disabled')).toBe(true);
    expect(note(fixture)).toContain('pas encore déclarée prête');
  });

  it('un rappel déjà parti ne se réarme pas à l’identique', () => {
    const fixture = render([entry({ window: LATE, readyAt: `${DAY}T05:00:00.000Z` })], {
      now: new Date(`${DAY}T09:00:00`),
      reminded: new Set(['ord_1']),
    });

    expect(note(fixture)).toContain('Rappel envoyé');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('tr.folddt-note-row button'),
    ).toBeNull();
  });

  it('un sac encore à tendre propose le SCAN', () => {
    expect(rowTexts(render([entry()]))[0] ?? '').toContain('Scanner');
  });

  it('🔴 une commande déjà remise n’offre plus aucun geste', () => {
    const rows = rowTexts(
      render([entry({ state: 'handed_over', handedOverAt: `${DAY}T04:41:00.000Z` })]),
    );

    expect(rows[0] ?? '').not.toContain('Scanner');
  });

  it('émet les intentions plutôt que d’agir : ouvrir, scanner, rappeler', () => {
    const fixture = render([entry({ window: LATE, readyAt: `${DAY}T05:00:00.000Z` })], {
      now: new Date(`${DAY}T09:00:00`),
    });
    const seen: string[] = [];
    fixture.componentInstance.opened.subscribe(() => seen.push('opened'));
    fixture.componentInstance.scanned.subscribe(() => seen.push('scanned'));
    fixture.componentInstance.reminder.subscribe(() => seen.push('reminder'));

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('tr.folddt-note-row button')?.click();
    el.querySelector<HTMLElement>('tr.folddt-row button')?.click();
    el.querySelector<HTMLElement>('tr.folddt-row')?.click();

    expect(seen).toEqual(['reminder', 'scanned', 'opened']);
  });
});
