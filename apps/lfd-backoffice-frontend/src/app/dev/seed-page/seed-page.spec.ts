import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type {
  DevScenarioNextReport,
  DevScenarioResetReport,
  DevScenarioStep,
  DevScenarioView,
  DevSeedDriverReport,
  DevSeedReport,
} from '@lfd/contracts';

import { NotifyService } from '../../notify.service';
import { DevScenarioService } from '../dev-scenario.service';
import { DevSeedService } from '../dev-seed.service';
import { DevSeedPage } from './seed-page';

const DAY = '2026-10-05';

/** Les six étapes du contrat, dans l'ordre. */
const STEPS: readonly DevScenarioStep[] = [0, 1, 2, 3, 4, 5];

function viewAt(reached: DevScenarioStep | null): DevScenarioView {
  return {
    day: DAY,
    reached,
    steps: STEPS.map((step) => ({
      step,
      reached: reached !== null && step <= reached,
      summary: `résumé ${step}`,
    })),
    databaseBytes: 412 * 1024 * 1024,
  };
}

/** Un serveur en mémoire : `next` avance d'une étape, ou refuse quand on le lui dit. */
class FakeScenario {
  readonly view = signal<DevScenarioView | null>(null);
  readonly loadError = signal<unknown>(null);
  reached: DevScenarioStep | null;
  nextCalls = 0;
  resetCalls = 0;
  refuseNext: string | null = null;
  /** Retient `next` tant qu'on ne le relâche pas — pour voir l'écran PENDANT. */
  hold: Promise<void> | null = null;

  constructor(reached: DevScenarioStep | null) {
    this.reached = reached;
  }

  refresh(): Promise<void> {
    this.view.set(viewAt(this.reached));
    return Promise.resolve();
  }

  async next(): Promise<DevScenarioNextReport> {
    this.nextCalls += 1;
    if (this.hold !== null) {
      await this.hold;
    }
    try {
      if (this.refuseNext !== null) {
        throw new HttpErrorResponse({ status: 409, error: { message: this.refuseNext } });
      }
      const played = STEPS[(this.reached ?? -1) + 1] ?? 5;
      this.reached = played;
      return { played };
    } finally {
      await this.refresh();
    }
  }

  async reset(): Promise<DevScenarioResetReport> {
    this.resetCalls += 1;
    this.reached = 0;
    await this.refresh();
    return {
      day: DAY,
      removed: [
        { category: 'orders', rows: 40 },
        { category: 'outbox', rows: 120 },
      ],
      storage: [{ bucket: 'lfd-dev', objects: 3 }],
      placed: 38,
    };
  }
}

class FakeSeeding {
  constructor(private readonly report: DevSeedReport | null = null) {}
  reload(): Promise<DevSeedReport> {
    return this.report === null
      ? Promise.reject(new Error('non prévu'))
      : Promise.resolve(this.report);
  }
}

class RecordingNotify {
  readonly successes: string[] = [];
  success(message: string): void {
    this.successes.push(message);
  }
  error(): void {}
}

interface Setup {
  readonly fixture: ComponentFixture<DevSeedPage>;
  readonly scenario: FakeScenario;
  readonly notify: RecordingNotify;
}

async function open(reached: DevScenarioStep | null, seeding = new FakeSeeding()): Promise<Setup> {
  const scenario = new FakeScenario(reached);
  const notify = new RecordingNotify();
  TestBed.configureTestingModule({
    imports: [DevSeedPage],
    providers: [
      provideRouter([]),
      { provide: DevSeedService, useValue: seeding },
      { provide: DevScenarioService, useValue: scenario },
      { provide: NotifyService, useValue: notify },
    ],
  });
  const fixture = TestBed.createComponent(DevSeedPage);
  await settle(fixture);
  return { fixture, scenario, notify };
}

/**
 * Laisse s'écouler la chaîne de promesses d'un geste : `whenStable` ne suit
 * pas une promesse que le composant ne rend à personne (le clic).
 */
async function settle(fixture: ComponentFixture<DevSeedPage>): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  fixture.detectChanges();
}

const root = (fixture: ComponentFixture<DevSeedPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const text = (fixture: ComponentFixture<DevSeedPage>): string => root(fixture).textContent ?? '';

const squash = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, ' ').trim();

function rows(fixture: ComponentFixture<DevSeedPage>): string[] {
  return [...root(fixture).querySelectorAll('li.step')].map((row) => squash(row.textContent));
}

function button(fixture: ComponentFixture<DevSeedPage>, label: string): HTMLButtonElement {
  const found = [...root(fixture).querySelectorAll('button')].find((candidate) =>
    squash(candidate.textContent).startsWith(label),
  );
  if (found === undefined) {
    throw new Error(`Aucun bouton « ${label} »`);
  }
  return found;
}

describe('DevSeedPage — la journée de démo, étape par étape', () => {
  it('dit le jour en toutes lettres, l’étape sur 5 et la taille de la base', async () => {
    const { fixture } = await open(1);

    const page = squash(text(fixture));
    expect(page).toContain('La journée de démo du lundi 5 octobre est à l’étape 1 sur 5');
    expect(page).toContain('le plan de production est clôturé');
    expect(page).toContain('Base locale : 412 Mo');
  });

  it('coche les étapes faites, nomme la prochaine, laisse les autres à venir', async () => {
    const { fixture } = await open(1);

    const [zero, one, two, three] = rows(fixture);
    expect(zero).toContain('Fait');
    expect(one).toContain('Fait');
    expect(one).toContain('résumé 1');
    expect(two).toContain('Prochaine');
    expect(two).not.toContain('Charger jusqu’ici');
    expect(three).toContain('À venir');
    expect(three).toContain('Charger jusqu’ici');
    expect(root(fixture).querySelector('a[href="/prod-manager"]')).not.toBeNull();
    expect(root(fixture).querySelector('a[href="/tour-manager"]')).toBeNull();
    expect(button(fixture, 'Étape suivante : Tournées composées')).toBeTruthy();
  });

  it('retire l’action principale à la dernière étape, et dit que la journée est prête', async () => {
    const { fixture } = await open(5);

    expect(squash(text(fixture))).toContain(
      'La journée est prête : les tournées peuvent partir depuis Ma tournée.',
    );
    expect(text(fixture)).not.toContain('Étape suivante');
    expect(root(fixture).querySelector('a[href="/coursier"]')).not.toBeNull();
  });

  it('pendant une étape : bannière, ligne « En cours… », et TOUS les boutons coupés', async () => {
    const { fixture, scenario } = await open(1);
    let release = (): void => undefined;
    scenario.hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    button(fixture, 'Étape suivante').click();
    fixture.detectChanges();

    expect(squash(text(fixture))).toContain(
      'Étape 2 sur 5 — Répartition des livraisons entre les camionnettes…',
    );
    expect(rows(fixture)[2]).toContain('En cours…');
    const buttons = [...root(fixture).querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((candidate) => candidate.disabled)).toBe(true);

    release();
    await settle(fixture);
    expect(rows(fixture)[2]).toContain('Fait');
  });

  it('« Charger jusqu’ici » joue les étapes une par une, et annonce chacune', async () => {
    const { fixture, scenario, notify } = await open(1);

    button(fixture, 'Charger jusqu’ici').click(); // la première « à venir » : l'étape 3
    await settle(fixture);

    expect(scenario.nextCalls).toBe(2);
    expect(notify.successes).toEqual(['Tournées composées', 'Production complète']);
    expect(rows(fixture)[3]).toContain('Fait');
    expect(rows(fixture)[4]).toContain('Prochaine');
  });

  it('un refus s’arrête sur l’étape, montre le message du serveur et propose de réessayer', async () => {
    const { fixture, scenario } = await open(1);
    scenario.refuseNext = 'Le plan du jour est vide.';

    const upcoming = [...root(fixture).querySelectorAll('button')].filter(
      (candidate) => squash(candidate.textContent) === 'Charger jusqu’ici',
    );
    upcoming[upcoming.length - 1]?.click(); // jusqu'à l'étape 5
    await settle(fixture);

    expect(scenario.nextCalls).toBe(1);
    const failed = rows(fixture)[2];
    expect(failed).toContain('Cette étape n’a pas abouti');
    expect(failed).toContain('Le plan du jour est vide.');
    expect(button(fixture, 'Réessayer : Tournées composées')).toBeTruthy();
  });
});

describe('DevSeedPage — repartir de zéro', () => {
  it('confirme en place en disant ce qui part, puis compte ce qui a été supprimé', async () => {
    const { fixture, scenario } = await open(3);

    button(fixture, 'Remettre à l’état de base').click();
    fixture.detectChanges();
    expect(squash(text(fixture))).toContain(
      'Remettre la journée de démo à l’état de base ? Les commandes, la production, le colisage et les tournées du scénario sont supprimés puis les commandes sont repassées. Les autres clients, le catalogue, les tarifs et l’équipe ne bougent pas.',
    );
    expect(scenario.resetCalls).toBe(0);

    const confirm = [...root(fixture).querySelectorAll('fold-inline-confirm button')].find(
      (candidate) =>
        squash(candidate.textContent) === 'Remettre à l’état de base' &&
        candidate.closest('[role="group"]') !== null,
    );
    expect(confirm).toBeDefined();
    (confirm as HTMLButtonElement).click();
    await settle(fixture);

    expect(scenario.resetCalls).toBe(1);
    const page = squash(text(fixture));
    expect(page).toContain('Commandes et leurs lignes');
    expect(page).toContain('40 éléments');
    expect(page).toContain('Messages échangés entre les services');
    expect(page).toContain('3 fichiers');
    expect(page).not.toContain('outbox');
    expect(rows(fixture)[0]).toContain('Fait');
    expect(rows(fixture)[1]).toContain('Prochaine');
  });
});

/**
 * Le compte rendu de « Tout recharger » dit à qui la tournée chargée est
 * affectée — et n'offre « Ma tournée » que lorsqu'elle l'est au requérant
 * (2026-10-01).
 */
function reportWith(driver: DevSeedDriverReport): DevSeedReport {
  return {
    reset: { companies: 0, people: 0, pickupPoints: 0, zones: 0, priceRules: 0, volumeLadders: 0 },
    orders: {
      removed: 0,
      placed: 40,
      yesterday: 'hier',
      today: 'aujourd’hui',
      counterToday: 3,
      peakDay: 'J+2',
    },
    delivery: {
      day: 'aujourd’hui',
      deliveries: 15,
      notReady: 3,
      vehicles: 3,
      rounds: 1,
      loadedBins: 9,
      unassigned: 10,
      driver,
    },
    storage: [],
  };
}

async function reloaded(driver: DevSeedDriverReport): Promise<ComponentFixture<DevSeedPage>> {
  const { fixture } = await open(null, new FakeSeeding(reportWith(driver)));
  button(fixture, 'Recharger le jeu de données').click();
  await settle(fixture);
  return fixture;
}

const myRoundLinks = (fixture: ComponentFixture<DevSeedPage>): number =>
  root(fixture).querySelectorAll('a[href="/coursier"]').length;

describe('DevSeedPage — le livreur de la tournée chargée', () => {
  it('nomme le requérant et ouvre « Ma tournée » quand la tournée lui est affectée', async () => {
    const fixture = await reloaded({ status: 'assigned', name: 'Hugo Heynard' });

    expect(text(fixture)).toContain('Vous (Hugo Heynard)');
    expect(myRoundLinks(fixture)).toBe(1);
  });

  it('dit le refus du serveur, sans lien, quand le droit de conduire manque', async () => {
    const fixture = await reloaded({
      status: 'refused',
      reason: 'Cette personne ne peut pas conduire « Camionnette 1 ».',
    });

    expect(text(fixture)).toContain('ne peut pas conduire « Camionnette 1 »');
    expect(myRoundLinks(fixture)).toBe(0);
  });
});
