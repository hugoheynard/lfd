import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import type { ProductionForecastView, ProductionPlanClosure } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCatalogService } from '../../../commandes/catalog.service';
import { PrevisionnelPage } from '../previsionnel-page';
import { ProductionService } from '../../production.service';

/**
 * **Arrêter le plan depuis le prévisionnel.**
 *
 * Le geste n'existait nulle part avant le 2026-09-13 : la route de clôture
 * était servie et testée, et aucune interface ne l'appelait. Ce qui s'éprouve
 * ici est donc ce que l'écran DÉCIDE — quelle journée il propose d'arrêter, et
 * ce qu'il dit quand ça a eu lieu — pas la clôture elle-même, qui a ses e2e.
 */

/**
 * Une journée **relative à maintenant**, `AAAA-MM-JJ` en heure locale.
 *
 * 🔴 Aucune date absolue dans une fixture (CLAUDE.md §5) : l'écran compare la
 * journée visée à SON aujourd'hui, donc un « 2026-09-14 » écrit en dur serait
 * vert jusqu'au 14 septembre et rouge le 15 — sans qu'une ligne de code ait
 * bougé, et sans que le diff explique rien.
 */
function dayIn(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const dayOfMonth = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

/** Le libellé abrégé que la table écrit — « 14 sept. ». */
function dayMonthOf(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date);
}

/** Un jour de la matrice, réduit à ce que le choix de la cible en lit. */
function day(
  date: string,
  options: { readonly closed?: boolean; readonly orderCount?: number } = {},
): ProductionForecastView['days'][number] {
  return {
    date,
    totalUnits: 120,
    orderCount: options.orderCount ?? 4,
    closed: options.closed ?? false,
    state: options.closed === true ? 'closed' : 'open',
  };
}

function forecast(days: ProductionForecastView['days']): ProductionForecastView {
  return { days, lines: [], peakDate: days[0]?.date ?? null, totalUnits: 0 };
}

interface Harness {
  readonly page: PrevisionnelPage;
  readonly closeDay: ReturnType<typeof vi.fn>;
}

/**
 * Monte le VRAI gabarit, pour les cas qui portent sur ce qui est écrit à
 * l'écran. Un libellé ne se vérifie nulle part ailleurs : ni `tsc`, ni le build
 * AOT, ni un test sur l'instance ne lisent le texte d'un bouton.
 */
async function render(view: ProductionForecastView): Promise<HTMLElement> {
  await mount(view);
  const fixture = TestBed.createComponent(PrevisionnelPage);
  // L'effet du constructeur part à la première détection ET repose l'état sur
  // « lecture en cours » : on le laisse partir AVANT de rejouer le chargement,
  // sinon il écrase le nôtre juste après qu'on l'a attendu.
  fixture.detectChanges();
  // ⚠️ `whenStable()` ne suffit pas : le chargement part d'un `void this.load()`
  // dans le constructeur, et rien ne le suit en zoneless. On le rejoue pour
  // ATTENDRE dessus plutôt que d'espérer une microtâche — l'écran restait sur
  // « Lecture du prévisionnel… », donc sur zéro bouton, et le test passait en
  // affirmant l'absence de ce qu'il cherchait.
  await TestBed.runInInjectionContext(() => fixture.componentInstance['load']());
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

async function mount(
  view: ProductionForecastView,
  closure: ProductionPlanClosure | Error = {
    date: dayIn(1),
    absorbed: 14,
    alreadyClosed: false,
    closedAt: new Date().toISOString(),
  },
): Promise<Harness> {
  const closeDay = vi.fn(async () => {
    if (closure instanceof Error) {
      throw closure;
    }
    return closure;
  });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ProductionService,
        useValue: { forecast: async () => view, closeDay },
      },
      { provide: AdminCatalogService, useValue: { list: async () => [] } },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new PrevisionnelPage());
  await TestBed.runInInjectionContext(() => page['load']());
  return { page, closeDay };
}

describe('le prévisionnel — arrêter le plan', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  /**
   * 🔴 **Aujourd'hui est écarté même grand ouvert et plein de commandes.**
   *
   * Le geste du soir arrête le service du LENDEMAIN. Arrêter la journée en
   * cours figerait le compte à produire d'une fournée déjà au four, et une
   * commande de l'après-midi n'y entrerait plus alors qu'elle est encore
   * servable. La bande proposait « le plan du dimanche 13 » un dimanche 13.
   */
  it('écarte AUJOURD’HUI et vise la journée ouverte suivante', async () => {
    const { page } = await mount(
      forecast([
        // Ouverte, et la mieux fournie de la semaine : elle ne doit PAS gagner.
        day(dayIn(0), { orderCount: 99 }),
        day(dayIn(1)),
        day(dayIn(2)),
      ]),
    );

    expect(page['dayToArrest']()?.date).toBe(dayIn(1));
  });

  /**
   * 🔴 La clôture REFUSE d'arrêter une journée vide
   * (`ProductionDayEmptyError`, 409). Proposer le bouton là serait proposer un
   * refus — et celui qui l'appuierait chercherait la panne dans le réseau.
   */
  it('saute une journée sans commande plutôt que de proposer un refus', async () => {
    const { page } = await mount(
      forecast([day(dayIn(1), { orderCount: 0 }), day(dayIn(2), { orderCount: 2 })]),
    );

    expect(page['dayToArrest']()?.date).toBe(dayIn(2));
  });

  it('ne propose rien quand toute la fenêtre est arrêtée', async () => {
    const { page } = await mount(
      forecast([day(dayIn(0), { closed: true }), day(dayIn(1), { closed: true })]),
    );

    expect(page['dayToArrest']()).toBeUndefined();
  });

  /**
   * 🔴 **Le bouton nomme sa journée** (décidé le 2026-09-13).
   *
   * On le presse en regardant une semaine entière, et il agit presque toujours
   * sur DEMAIN — pas sur la colonne qu'on a sous les yeux. « Arrêter le plan »
   * tout court laissait deviner laquelle, le soir, vite fait. Se tromper de
   * journée fige le mauvais compte à produire, et un compte figé ne se
   * recalcule pas.
   */
  it('écrit la journée visée SUR le bouton, pas seulement au-dessus', async () => {
    const el = await render(forecast([day(dayIn(0), { closed: true }), day(dayIn(1))]));

    const bouton = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Arrêter le plan'),
    );
    expect(bouton).toBeDefined();
    expect(bouton?.textContent?.trim()).toContain('Arrêter le plan du');
    // La date, et pas seulement les mots : c'est elle qui manquait.
    expect(bouton?.textContent).toContain(dayMonthOf(1));
  });

  /** Le compte rendu est un CHIFFRE, jamais « c'est fait » — la grammaire du dépôt. */
  it('dit combien de commandes viennent d’entrer au plan', async () => {
    const { page, closeDay } = await mount(forecast([day(dayIn(1))]));

    await page['arrest'](dayIn(1));

    expect(closeDay).toHaveBeenCalledWith(dayIn(1));
    expect(page['arrestSaid']()).toContain('14 commande');
    expect(page['arrestFailed']()).toBe(false);
  });

  /**
   * Une journée déjà arrêtée n'est PAS une panne : quelqu'un d'autre vient de
   * le faire, et la réponse du serveur le dit (`alreadyClosed`) au lieu
   * d'échouer. Montrer une erreur à celui qui a appuyé une seconde trop tard
   * l'enverrait chercher un problème qui n'existe pas.
   */
  it('traite « déjà arrêtée » comme une information, pas comme un échec', async () => {
    const { page } = await mount(forecast([day(dayIn(1))]), {
      date: dayIn(1),
      absorbed: 3,
      alreadyClosed: true,
      closedAt: new Date().toISOString(),
    });

    await page['arrest'](dayIn(1));

    expect(page['arrestFailed']()).toBe(false);
    expect(page['arrestSaid']()).toContain('déjà arrêtée');
  });

  it('dit la panne sans prétendre que quelque chose a été figé', async () => {
    const { page } = await mount(forecast([day(dayIn(1))]), new Error('réseau'));

    await page['arrest'](dayIn(1));

    expect(page['arrestFailed']()).toBe(true);
    expect(page['arrestSaid']()).toBeNull();
  });

  /**
   * La confirmation se referme quoi qu'il arrive. Sans ça, un échec laisserait
   * une confirmation ouverte sur une journée dont l'écran vient de dire qu'elle
   * n'a pas bougé — et le second appui viserait un état inconnu.
   */
  it('referme la confirmation même quand l’arrêt échoue', async () => {
    const { page } = await mount(forecast([day(dayIn(1))]), new Error('réseau'));
    page['arrestingDay'].set(dayIn(1));

    await page['arrest'](dayIn(1));

    expect(page['arrestingDay']()).toBeNull();
    expect(page['arresting']()).toBe(false);
  });

  describe('le rattrapage du plan du jour', () => {
    /**
     * Régression : un plan du jour oublié la veille n'était plus proposé — la
     * bande sautait à demain et rien ne disait l'oubli (vu le 2026-10-06).
     */
    it('un plan du jour oublié la veille n’était plus proposé', async () => {
      const el = await render(forecast([day(dayIn(0)), day(dayIn(1))]));

      const texte = el.textContent ?? '';
      expect(texte).toContain('n’a pas été arrêté hier soir');
      const bouton = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('maintenant'),
      );
      expect(bouton?.textContent).toContain(dayMonthOf(0));
    });

    it('ne propose pas le rattrapage quand aujourd’hui est déjà arrêté', async () => {
      const { page } = await mount(forecast([day(dayIn(0), { closed: true }), day(dayIn(1))]));

      expect(page['dayToCatchUp']()).toBeUndefined();
    });

    it('ne propose pas le rattrapage d’une journée du jour sans commande', async () => {
      const { page } = await mount(forecast([day(dayIn(0), { orderCount: 0 })]));

      expect(page['dayToCatchUp']()).toBeUndefined();
    });

    it('ne propose jamais une journée passée restée ouverte', async () => {
      const { page } = await mount(forecast([day(dayIn(-1)), day(dayIn(1))]));

      expect(page['dayToCatchUp']()).toBeUndefined();
      expect(page['dayToArrest']()?.date).toBe(dayIn(1));
    });

    it('montre le rattrapage AU-DESSUS de la bande du soir', async () => {
      const el = await render(forecast([day(dayIn(0)), day(dayIn(1))]));

      const boutons = [...el.querySelectorAll('button')]
        .map((b) => b.textContent?.trim() ?? '')
        .filter((t) => t.startsWith('Arrêter le plan du'));
      expect(boutons).toHaveLength(2);
      expect(boutons[0]).toContain(dayMonthOf(0));
      expect(boutons[0]).toContain('maintenant');
      expect(boutons[1]).toContain(dayMonthOf(1));
    });

    it('arrête le rattrapage avec la date du jour', async () => {
      const { page, closeDay } = await mount(forecast([day(dayIn(0)), day(dayIn(1))]));

      await page['arrest'](page['dayToCatchUp']()?.date ?? '');

      expect(closeDay).toHaveBeenCalledWith(dayIn(0));
    });
  });

  /**
   * Le rattrapage est une alerte de PAGE (2026-10-06) : naviguer vers une
   * autre semaine faisait disparaître la bande, alors que l'oubli restait.
   */
  describe('le rattrapage hors de la fenêtre affichée', () => {
    async function mountAway(
      offset: number,
      todayClosed: boolean,
      tomorrow: { readonly closed?: boolean; readonly orderCount?: number } = {},
    ): Promise<{ page: PrevisionnelPage; closeDay: ReturnType<typeof vi.fn>; el: HTMLElement }> {
      let closed = todayClosed;
      const forecastCall = vi.fn(async (from: string, to: string) =>
        // La fenêtre qui commence aujourd'hui, lue à part de la fenêtre affichée.
        from === dayIn(0) && to === dayIn(6)
          ? forecast([day(dayIn(0), { closed }), day(dayIn(1), tomorrow)])
          : forecast([day(dayIn(offset)), day(dayIn(offset + 1))]),
      );
      const closeDay = vi.fn(async (date: string) => {
        closed = true;
        return { date, absorbed: 5, alreadyClosed: false, closedAt: new Date().toISOString() };
      });
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: ProductionService, useValue: { forecast: forecastCall, closeDay } },
          { provide: AdminCatalogService, useValue: { list: async () => [] } },
        ],
      });
      const fixture = TestBed.createComponent(PrevisionnelPage);
      const page = fixture.componentInstance;
      page['from'].set(dayIn(offset));
      // L'effet du constructeur part ici et repose « lecture en cours » : on le
      // laisse partir AVANT de rejouer le chargement qu'on attend.
      fixture.detectChanges();
      await TestBed.runInInjectionContext(() => page['load']());
      fixture.detectChanges();
      return { page, closeDay, el: fixture.nativeElement as HTMLElement };
    }

    it('visible sur la semaine suivante quand aujourd’hui est ouvert avec commandes', async () => {
      const { el } = await mountAway(7, false);
      expect(el.textContent).toContain('n’a pas été arrêté hier soir');
      expect(el.textContent).toContain(dayMonthOf(0));
    });

    it('visible sur la semaine précédente', async () => {
      const { el } = await mountAway(-7, false);
      expect(el.textContent).toContain('n’a pas été arrêté hier soir');
    });

    it('absent quand aujourd’hui est arrêté', async () => {
      const { page, el } = await mountAway(7, true);
      expect(page['dayToCatchUp']()).toBeUndefined();
      expect(el.textContent).not.toContain('n’a pas été arrêté hier soir');
    });

    it('l’arrêt depuis une autre semaine vise aujourd’hui et éteint la bande', async () => {
      const { page, closeDay } = await mountAway(7, false);
      await page['arrest'](page['dayToCatchUp']()?.date ?? '');
      expect(closeDay).toHaveBeenCalledWith(dayIn(0));
      expect(page['dayToCatchUp']()).toBeUndefined();
    });
  });

  /**
   * Le bouton du soir est un geste de PAGE (Hugo, 2026-10-06) : il garde sa
   * place sur toutes les fenêtres, actif s'il y a une journée à arrêter dans
   * celle qui commence aujourd'hui, désactivé sinon.
   */
  describe('le bouton du soir sur toutes les fenêtres', () => {
    function arrestButton(el: HTMLElement): HTMLButtonElement | undefined {
      return [...el.querySelectorAll<HTMLButtonElement>('button.pv-arrest')][0];
    }

    async function mountOn(
      offset: number,
      tomorrow: { readonly closed?: boolean; readonly orderCount?: number },
    ): Promise<{ page: PrevisionnelPage; closeDay: ReturnType<typeof vi.fn>; el: HTMLElement }> {
      const forecastCall = vi.fn(async (from: string, to: string) =>
        from === dayIn(0) && to === dayIn(6)
          ? forecast([day(dayIn(0), { closed: true }), day(dayIn(1), tomorrow)])
          : forecast([day(dayIn(offset), { orderCount: 0 })]),
      );
      const closeDay = vi.fn(async (date: string) => ({
        date,
        absorbed: 5,
        alreadyClosed: false,
        closedAt: new Date().toISOString(),
      }));
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: ProductionService, useValue: { forecast: forecastCall, closeDay } },
          { provide: AdminCatalogService, useValue: { list: async () => [] } },
        ],
      });
      const fixture = TestBed.createComponent(PrevisionnelPage);
      const page = fixture.componentInstance;
      page['from'].set(dayIn(offset));
      fixture.detectChanges();
      await TestBed.runInInjectionContext(() => page['load']());
      fixture.detectChanges();
      return { page, closeDay, el: fixture.nativeElement as HTMLElement };
    }

    it.each([7, -7])(
      'actif sur la fenêtre décalée de %i jours quand demain est ouvert',
      async (offset) => {
        const { el } = await mountOn(offset, {});
        const bouton = arrestButton(el);
        expect(bouton?.disabled).toBe(false);
        expect(bouton?.textContent).toContain('Arrêter le plan du');
        expect(bouton?.textContent).toContain(dayMonthOf(1));
      },
    );

    it('désactivé, « Rien à arrêter », quand aucune journée n’a de commande', async () => {
      const { el } = await mountOn(7, { orderCount: 0 });
      const bouton = arrestButton(el);
      expect(bouton?.disabled).toBe(true);
      expect(bouton?.textContent?.trim()).toBe('Rien à arrêter');
    });

    it('désactivé, nomme le plan de demain quand il est déjà arrêté', async () => {
      const { el } = await mountOn(7, { closed: true });
      const bouton = arrestButton(el);
      expect(bouton?.disabled).toBe(true);
      expect(bouton?.textContent).toContain('arrêté');
      expect(bouton?.textContent).toContain(dayMonthOf(1));
    });

    it('l’arrêt depuis une autre semaine clôt demain', async () => {
      const { page, closeDay } = await mountOn(7, {});
      await page['arrest'](page['dayToArrest']()?.date ?? '');
      expect(closeDay).toHaveBeenCalledWith(dayIn(1));
    });
  });

  /**
   * L'état bascule `open` → `overdue` à l'heure d'alerte sans qu'aucune donnée
   * ne change : seule une relecture périodique peut le montrer.
   */
  describe('la relecture périodique', () => {
    it('relit en silence et fait passer la colonne en alerte', async () => {
      let served = forecast([day(dayIn(1))]);
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: ProductionService, useValue: { forecast: async () => served } },
          { provide: AdminCatalogService, useValue: { list: async () => [] } },
        ],
      });
      const page = TestBed.runInInjectionContext(() => new PrevisionnelPage());
      await TestBed.runInInjectionContext(() => page['load']());
      expect(page['headers']()[0]?.tone).toBeNull();

      served = forecast([{ ...day(dayIn(1)), state: 'overdue' }]);
      const refreshing = page['refresh']();
      expect(page['state']()).toBe('ready');
      await refreshing;

      expect(page['headers']()[0]?.tone).toBe('overdue');
      expect(page['headers']()[0]?.stateLabel).toBe('Plan non arrêté');
    });
  });
});
