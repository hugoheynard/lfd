import { TestBed } from '@angular/core/testing';
import type { ProductionWorksheetView } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dayLabelOf } from '../../worksheet-day';
import { WorksheetService } from '../../worksheet.service';
import { WorkshopDayReader } from './workshop-day.reader';

/** Deux journées servies, relatives à maintenant : seules leurs différences comptent. */
function isoDayOffset(offset: number): string {
  const at = new Date();
  at.setDate(at.getDate() + offset);
  const month = `${at.getMonth() + 1}`.padStart(2, '0');
  const day = `${at.getDate()}`.padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}
const TODAY = isoDayOffset(0);
const TOMORROW = isoDayOffset(1);

function sheet(over: Partial<ProductionWorksheetView> = {}): ProductionWorksheetView {
  return {
    date: TODAY,
    generatedAt: null,
    retakenAt: null,
    lines: [],
    drift: null,
    groups: [],
    shelvesKnown: true,
    relativeDay: 'today',
    ...over,
  };
}

/** Une lecture en vol : le test la tient, puis la résout ou la refuse quand il le décide. */
interface PendingRead {
  readonly resolve: (view: ProductionWorksheetView) => void;
  readonly reject: () => void;
}

/**
 * Le service d'API, réduit à `current()`. Chaque appel est RETENU jusqu'à ce que
 * le test le libère : c'est le seul moyen d'ordonner des réponses qui se
 * croisent, ce que le vrai réseau fait sans prévenir.
 */
class HeldWorksheetService {
  readonly pending: PendingRead[] = [];

  current(): Promise<ProductionWorksheetView> {
    return new Promise<ProductionWorksheetView>((resolve, reject) => {
      this.pending.push({ resolve, reject: () => reject(new Error('lecture refusée')) });
    });
  }

  /** La n-ième lecture lancée (0 = la première). */
  read(index: number): PendingRead {
    const found = this.pending[index];
    if (found === undefined) {
      throw new Error(`aucune lecture n°${index} en vol`);
    }
    return found;
  }
}

let api: HeldWorksheetService;
let reader: WorkshopDayReader;

/** Laisse les promesses résolues se propager avant d'asserter. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Charge la fiche sur `view` : la lecture initiale réussie. */
async function loaded(view: ProductionWorksheetView): Promise<void> {
  const loading = reader.load();
  api.read(api.pending.length - 1).resolve(view);
  await loading;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  api = new HeldWorksheetService();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [WorkshopDayReader, { provide: WorksheetService, useValue: api }],
  });
  reader = TestBed.inject(WorkshopDayReader);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WorkshopDayReader — le chargement', () => {
  it('avant toute lecture : en chargement, aucune journée, aucun libellé', () => {
    expect(reader.state()).toBe('loading');
    expect(reader.date()).toBeNull();
    expect(reader.dayLabel()).toBe('');
    expect(reader.dayOffset()).toBe('');
    expect(reader.groups()).toEqual([]);
    expect(reader.readLabel()).toBeNull();
    expect(reader.refreshFailed()).toBe(false);
  });

  it('un chargement en échec passe en erreur sans journée, puis un second réussi le rétablit', async () => {
    const first = reader.load();
    api.read(0).reject();
    await first;
    expect(reader.state()).toBe('error');
    expect(reader.date()).toBeNull();

    const retry = reader.load();
    // Pendant la nouvelle tentative, l'écran redit « chargement » plutôt que « erreur ».
    expect(reader.state()).toBe('loading');
    api.read(1).resolve(sheet({ relativeDay: 'tomorrow', date: TOMORROW }));
    await retry;

    expect(reader.state()).toBe('ready');
    expect(reader.date()).toBe(TOMORROW);
    expect(reader.dayLabel()).toBe(dayLabelOf(TOMORROW));
    expect(reader.dayOffset()).toBe('demain');
    expect(reader.refreshFailed()).toBe(false);
  });

  it('une lecture initiale dépassée par une plus récente ne décide de rien', async () => {
    const slow = reader.load();
    const fast = reader.load();
    api.read(1).resolve(sheet({ date: TOMORROW }));
    await fast;
    // La première arrive après : même en échec, elle ne ramène pas l'erreur.
    api.read(0).reject();
    await slow;
    expect(reader.state()).toBe('ready');
    expect(reader.date()).toBe(TOMORROW);
  });

  it('une journée ni aujourd’hui ni demain n’a pas de mot relatif', async () => {
    await loaded(sheet({ relativeDay: null }));
    expect(reader.dayOffset()).toBe('');
  });

  it('le tirage et le retirage se lisent en heures, absents = null', async () => {
    const at = new Date();
    at.setHours(4, 5, 0, 0);
    const retaken = new Date();
    retaken.setHours(11, 30, 0, 0);
    await loaded(sheet({ generatedAt: at.toISOString(), retakenAt: retaken.toISOString() }));
    expect(reader.generatedLabel()).toBe('4 h 05');
    expect(reader.retakenLabel()).toBe('11 h 30');
  });

  it('un plan non arrêté n’a ni heure de tirage ni de retirage', async () => {
    await loaded(sheet({ generatedAt: null, retakenAt: null }));
    expect(reader.generatedLabel()).toBeNull();
    expect(reader.retakenLabel()).toBeNull();
  });
});

describe('WorkshopDayReader — la relecture silencieuse', () => {
  it('ne lit rien tant que la fiche n’est pas chargée', async () => {
    await reader.refresh();
    expect(api.pending).toHaveLength(0);

    const failing = reader.load();
    api.read(0).reject();
    await failing;
    await reader.refresh();
    // État « erreur » : toujours pas de relecture silencieuse.
    expect(api.pending).toHaveLength(1);
  });

  it('une relecture en échec garde la fiche à l’écran et le dit', async () => {
    await loaded(sheet({ date: TODAY }));
    const before = reader.readLabel();

    const reread = reader.refresh();
    api.read(1).reject();
    await reread;

    expect(reader.state()).toBe('ready');
    expect(reader.date()).toBe(TODAY);
    expect(reader.refreshFailed()).toBe(true);
    // « relue à » ne bouge pas : l'écran n'a pas été relu.
    expect(reader.readLabel()).toBe(before);
  });

  it('une relecture réussie efface l’avertissement et avance « relue à »', async () => {
    const early = new Date();
    early.setHours(4, 12, 0, 0);
    vi.setSystemTime(early);
    await loaded(sheet());
    expect(reader.readLabel()).toBe('4 h 12');

    const failing = reader.refresh();
    api.read(1).reject();
    await failing;
    expect(reader.refreshFailed()).toBe(true);

    const later = new Date(early);
    later.setMinutes(27);
    vi.setSystemTime(later);
    const ok = reader.refresh();
    api.read(2).resolve(sheet());
    await ok;

    expect(reader.refreshFailed()).toBe(false);
    expect(reader.readLabel()).toBe('4 h 27');
  });

  it('un échec dépassé par une lecture plus récente et réussie n’alerte pas', async () => {
    await loaded(sheet());
    const slow = reader.refresh();
    const fast = reader.refresh();
    api.read(2).resolve(sheet({ date: TODAY }));
    await fast;
    api.read(1).reject();
    await slow;
    expect(reader.refreshFailed()).toBe(false);
  });

  it('une réponse lente n’écrase pas une plus récente', async () => {
    await loaded(sheet({ relativeDay: 'today' }));
    const slow = reader.refresh();
    const fast = reader.refresh();
    api.read(2).resolve(sheet({ relativeDay: 'tomorrow' }));
    await fast;
    api.read(1).resolve(sheet({ relativeDay: 'today' }));
    await slow;
    expect(reader.dayOffset()).toBe('demain');
  });
});

describe('WorkshopDayReader — la relecture qui suit une écriture', () => {
  it('une relecture périodique partie avant une écriture acceptée est jetée', async () => {
    await loaded(sheet({ relativeDay: 'today' }));

    const periodic = reader.refresh();
    vi.setSystemTime(new Date(Date.now() + 50));
    const afterWrite = reader.rereadAfterWrite();

    // L'état d'après le geste arrive d'abord, puis l'état d'avant, en retard.
    api.read(2).resolve(sheet({ relativeDay: 'tomorrow' }));
    expect(await afterWrite).toBe(true);
    api.read(1).resolve(sheet({ relativeDay: 'today' }));
    await periodic;

    // Le geste qu'on vient de faire ne s'efface pas sous les doigts.
    expect(reader.dayOffset()).toBe('demain');
  });

  it('la relecture d’après écriture est inscrite même tombée dans la même milliseconde', async () => {
    await loaded(sheet({ relativeDay: 'today' }));
    const afterWrite = reader.rereadAfterWrite();
    api.read(1).resolve(sheet({ relativeDay: 'tomorrow' }));
    expect(await afterWrite).toBe(true);
    expect(reader.dayOffset()).toBe('demain');
  });

  it('rend false quand sa lecture échoue, et le dit en pied', async () => {
    await loaded(sheet());
    const afterWrite = reader.rereadAfterWrite();
    api.read(1).reject();
    expect(await afterWrite).toBe(false);
    expect(reader.refreshFailed()).toBe(true);
    expect(reader.state()).toBe('ready');
  });

  it('rend false quand une lecture plus récente l’a dépassée, sans rien inscrire', async () => {
    await loaded(sheet({ relativeDay: 'today' }));
    const first = reader.rereadAfterWrite();
    const second = reader.rereadAfterWrite();
    api.read(2).resolve(sheet({ relativeDay: 'tomorrow' }));
    expect(await second).toBe(true);
    api.read(1).resolve(sheet({ relativeDay: 'today' }));
    expect(await first).toBe(false);
    expect(reader.dayOffset()).toBe('demain');
  });
});

describe('WorkshopDayReader — le changement de journée', () => {
  it('la première lecture n’annonce aucun changement', async () => {
    await loaded(sheet({ date: TOMORROW }));
    expect(reader.dayTurnedLabel()).toBeNull();
  });

  it('une relecture sur la même journée n’annonce rien', async () => {
    await loaded(sheet({ date: TODAY }));
    const reread = reader.refresh();
    api.read(1).resolve(sheet({ date: TODAY }));
    await reread;
    expect(reader.dayTurnedLabel()).toBeNull();
  });

  it('une relecture qui change de journée l’annonce, jusqu’à ce qu’on l’acquitte', async () => {
    await loaded(sheet({ date: TODAY }));
    const reread = reader.refresh();
    api.read(1).resolve(sheet({ date: TOMORROW, relativeDay: 'tomorrow' }));
    await reread;

    expect(reader.date()).toBe(TOMORROW);
    expect(reader.dayTurnedLabel()).toBe(dayLabelOf(TOMORROW));

    // Une relecture suivante, sur la même nouvelle journée, ne l'efface pas :
    // seul l'acquittement de la personne le fait.
    const again = reader.refresh();
    api.read(2).resolve(sheet({ date: TOMORROW }));
    await again;
    expect(reader.dayTurnedLabel()).toBe(dayLabelOf(TOMORROW));

    reader.acknowledgeDayTurn();
    expect(reader.dayTurnedLabel()).toBeNull();
    // L'acquittement ne touche pas à la journée lue.
    expect(reader.date()).toBe(TOMORROW);
  });

  it('un retour à la journée d’avant s’annonce aussi', async () => {
    await loaded(sheet({ date: TOMORROW }));
    const reread = reader.refresh();
    api.read(1).resolve(sheet({ date: TODAY }));
    await reread;
    expect(reader.dayTurnedLabel()).toBe(dayLabelOf(TODAY));
  });

  it('une réponse jetée ne fait pas changer de journée', async () => {
    await loaded(sheet({ date: TODAY }));
    const periodic = reader.refresh();
    const afterWrite = reader.rereadAfterWrite();
    api.read(2).resolve(sheet({ date: TODAY }));
    await afterWrite;
    api.read(1).resolve(sheet({ date: TOMORROW }));
    await periodic;
    expect(reader.date()).toBe(TODAY);
    expect(reader.dayTurnedLabel()).toBeNull();
  });
});

describe('WorkshopDayReader — ce qui s’est perdu au serveur', () => {
  it('shelvesLost : vrai seulement quand le serveur dit `false`', async () => {
    expect(reader.shelvesLost()).toBe(false);
    await loaded(sheet({ shelvesKnown: false }));
    expect(reader.shelvesLost()).toBe(true);

    const reread = reader.refresh();
    api.read(1).resolve(sheet({ shelvesKnown: true }));
    await reread;
    expect(reader.shelvesLost()).toBe(false);
  });

  it('workstationsLost : seulement en mode prod ET postes illisibles', async () => {
    await loaded(sheet({ grouping: 'workstation', workstationsKnown: false }));
    expect(reader.byWorkstation()).toBe(true);
    expect(reader.workstationsLost()).toBe(true);
  });

  it('workstationsLost : faux en mode prod quand les postes sont lus ou non précisés', async () => {
    await loaded(sheet({ grouping: 'workstation', workstationsKnown: true }));
    expect(reader.workstationsLost()).toBe(false);

    const reread = reader.refresh();
    api.read(1).resolve(sheet({ grouping: 'workstation' }));
    await reread;
    // Champ absent = pas une perte annoncée.
    expect(reader.workstationsLost()).toBe(false);
  });

  it('workstationsLost : faux en mode boutique, même si le champ dit `false`', async () => {
    await loaded(sheet({ grouping: 'shelf', workstationsKnown: false }));
    expect(reader.byWorkstation()).toBe(false);
    expect(reader.workstationsLost()).toBe(false);
  });

  it('les deux pertes sont indépendantes', async () => {
    await loaded(sheet({ shelvesKnown: false, grouping: 'workstation', workstationsKnown: true }));
    expect(reader.shelvesLost()).toBe(true);
    expect(reader.workstationsLost()).toBe(false);
  });
});

describe('WorkshopDayReader — les lignes en vol', () => {
  it('pose puis retire une ligne', () => {
    expect(reader.busy().size).toBe(0);
    reader.setBusy('BAG', true);
    expect(reader.busy().has('BAG')).toBe(true);
    reader.setBusy('BAG', false);
    expect(reader.busy().has('BAG')).toBe(false);
  });

  it('plusieurs lignes en vol ne se gênent pas', () => {
    reader.setBusy('BAG', true);
    reader.setBusy('SEI', true);
    reader.setBusy('BAG', false);
    expect([...reader.busy()]).toEqual(['SEI']);
  });

  it('poser deux fois n’en compte qu’une, retirer une absente ne casse rien', () => {
    reader.setBusy('BAG', true);
    reader.setBusy('BAG', true);
    expect(reader.busy().size).toBe(1);
    reader.setBusy('ABSENTE', false);
    expect([...reader.busy()]).toEqual(['BAG']);
  });

  it('chaque changement rend un nouvel ensemble : l’ancien n’est pas muté', () => {
    const empty = reader.busy();
    reader.setBusy('BAG', true);
    expect(empty.size).toBe(0);
    expect(reader.busy()).not.toBe(empty);
  });

  it('une relecture ne désarme pas les lignes en vol', async () => {
    await loaded(sheet());
    reader.setBusy('BAG', true);
    const reread = reader.refresh();
    api.read(1).resolve(sheet());
    await reread;
    expect(reader.busy().has('BAG')).toBe(true);
    await settle();
  });
});
