import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSurfaceDirective,
  FoldViewToggleComponent,
  FoldLoadingStateComponent,
  type FoldSelectItem,
  type FoldViewToggleOption,
} from 'fold-ng';

import type { CatalogItemView, ProductionWorksheetView, WorkshopLine } from '@lfd/contracts';

import { AdminCatalogService } from '../../commandes/catalog.service';
import { PermissionsStore } from '../../auth/permissions.store';
import { StaffPrefsService } from '../../shared/staff-prefs/staff-prefs.service';
import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import {
  dayLabelOf,
  hourLabel,
  isoDay,
  nextDay,
  markKey,
  withLocalMarks,
  type LocalMark,
} from '../worksheet-day';
import { worksheetGroups, type WorksheetGroup } from '../worksheet-groups';
import { refreshWhileVisible } from '../periodic-refresh';
import { serverMessageOf } from '../server-message';
import { WorksheetService } from '../worksheet.service';
import { DriftBanner } from './drift-banner/drift-banner';
import { WorksheetLine } from './worksheet-line/worksheet-line';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * 🔴 **Le seuil du fournil — 1024 px, pas les 640 px du back-office.**
 *
 * La bascule est structurelle, pas cosmétique : au-dessus, les onglets de
 * catégorie et la colonne d'initiales tiennent ; en dessous, les onglets
 * deviennent un menu qu'on ouvre par erreur les mains sales. C'est la largeur
 * où la barre d'onglets cesse de tenir sur une ligne qui décide.
 *
 * ⚠️ La même valeur est écrite dans `fiche-atelier.scss` (une media query ne lit
 * pas un `const`). Les deux bougent ensemble ou l'écran se coupe en deux.
 */
const WORKSHOP_NARROW = '(max-width: 1023px)';

/**
 * **La fiche d'atelier** — ce que le fournil a à sortir, et ce qui est sorti.
 *
 * Aucun prix, aucun nom de client, aucun total en euros : ce n'est pas une
 * omission, c'est la règle qui définit cet écran, et le contrat la porte dans le
 * TYPE plutôt qu'en consigne — il n'y a pas de champ à laisser vide.
 *
 * **Deux supports, une seule liste.** Le poste fixe montre les fiches en
 * onglets ; le téléphone en montre une, choisie à l'entrée, et fait descendre
 * les lignes faites dans un bloc replié épinglé au-dessus du pied. Ce qui change
 * est **ce que le support enlève** — jamais la ligne, qui est le geste qu'on
 * répète neuf fois.
 *
 * **Une coche part tout de suite.** La case se coche à l'écran et se désarme
 * le temps de l'envoi ; acceptée, elle reste ; refusée, elle revient en arrière
 * et l'écran dit pourquoi. 🔴 Il n'y a plus de file hors ligne depuis le
 * 2026-09-14 — le fournil a toujours du réseau, et la file coûtait plus qu'elle
 * ne protégeait (`documentation/production/relecture-des-postes.md`).
 *
 * **La catégorie ouverte suit la PERSONNE**, dans `nav_prefs` et non dans
 * `localStorage` : le téléphone du pétrin n'est pas la machine du chef, et c'est
 * la personne qui reprend son poste. Un `PATCH` refusé laisse simplement la
 * catégorie à la session.
 */
@Component({
  selector: 'app-fiche-atelier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DriftBanner,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSurfaceDirective,
    FoldViewToggleComponent,
    WorksheetLine,
  ],
  templateUrl: './fiche-atelier.html',
  styleUrl: './fiche-atelier.scss',
})
export class FicheAtelier {
  private readonly api = inject(WorksheetService);
  private readonly catalog = inject(AdminCatalogService);
  private readonly permissions = inject(PermissionsStore);
  private readonly prefs = inject(StaffPrefsService);

  /**
   * 🔴 **La journée que le four est en train de faire** — elle se déduit, elle
   * ne se choisit pas.
   *
   * La règle, décidée le 2026-09-13 : **demain dès que le plan de demain est
   * arrêté, aujourd'hui sinon.** C'est le geste du soir qui fait basculer
   * l'écran : on arrête le plan du lendemain au prévisionnel, et à partir de cet
   * instant la fiche montre ce que le fournil va sortir — il commence à 4 h, et
   * à 4 h « aujourd'hui » n'est plus la bonne réponse.
   *
   * Ni « aujourd'hui » ni « demain » en dur, donc, et c'est tout l'intérêt : les
   * deux étaient faux la moitié du temps. « Aujourd'hui » laissait le fournil de
   * la nuit sur la journée qui vient de finir ; « demain » le faisait cocher une
   * fiche qui n'existe pas encore.
   *
   * Pas de sélecteur, délibérément : c'est l'écran qu'un poste garde allumé
   * toute la fournée, et la seule question qu'on s'y pose est « qu'est-ce qui
   * reste à sortir ». En contrepartie, l'écran NOMME sa journée en toutes
   * lettres — une fiche sans sélecteur doit dire de quel jour elle parle.
   */
  protected readonly date = signal(isoDay(new Date()));

  /** « samedi 16 août » — l'en-tête de la fiche. */
  protected readonly dayLabel = computed(() => dayLabelOf(this.date()));

  /**
   * « aujourd'hui » ou « demain », à côté de la date.
   *
   * 🔴 La fiche n'a pas de sélecteur, et sa journée **se déduit** — elle bascule
   * sur demain dès que le plan de demain est arrêté. Le fournil n'a donc aucun
   * moyen de savoir quel jour il coche, sauf à lire la date et à la comparer
   * mentalement à celle d'aujourd'hui, à 4 h du matin. Se tromper d'un jour est
   * l'erreur la plus chère que cet écran puisse coûter : on fabrique pour rien,
   * et ce qui était dû manque.
   *
   * Vide en dehors de ces deux cas — la fiche ne montre jamais une autre
   * journée, et un troisième mot suggérerait qu'elle le pourrait.
   */
  protected readonly dayOffset = computed(() => {
    const day = this.date();
    if (day === isoDay(new Date())) {
      return 'aujourd’hui';
    }
    return day === isoDay(nextDay(new Date())) ? 'demain' : '';
  });

  protected readonly state = signal<LoadState>('loading');
  protected readonly compact = narrowViewport(WORKSHOP_NARROW);

  private readonly sheet = signal<ProductionWorksheetView | null>(null);
  private readonly catalogue = signal<readonly CatalogItemView[]>([]);

  /**
   * 🔴 La lecture du catalogue a-t-elle échoué ?
   *
   * Elle ne fait pas tomber la fiche — les quantités viennent de la production,
   * pas d'elle — mais elle ne peut pas passer en silence : sans catalogue, chaque
   * SKU tombe dans le groupe sans rayon, et un libellé « Hors catalogue »
   * affirmerait que le fournil fabrique des articles retirés de la vente.
   */
  protected readonly shelvesLost = signal(false);

  /** Le retirage vient-il d'échouer ? Un échec partiel, la fiche reste à l'écran. */
  protected readonly retakeFailed = signal(false);

  /** Les coches en cours d'envoi, par `AAAA-MM-JJ SKU` — l'écran les montre avant la réponse. */
  private readonly localMarks = signal<ReadonlyMap<string, LocalMark>>(new Map());

  /** Le bloc des lignes faites, sur téléphone. Replié : on vient voir ce qui reste. */
  protected readonly doneOpen = signal(false);

  /** La fiche choisie. `null` tant que rien n'a été lu ni préféré. */
  private readonly chosen = signal<string | null>(null);

  /** Les lignes dont la coche est en train de partir — leur case est désarmée. */
  private readonly busy = signal<ReadonlySet<string>>(new Set());

  /**
   * La dernière coche refusée, avec le produit et la raison du serveur.
   *
   * 🔴 La case est revenue en arrière : il reste à le DIRE. Une coche qui se
   * défait sans explication se recoche, et se refait refuser.
   */
  protected readonly markFailed = signal<string | null>(null);

  /**
   * L'instant de la dernière écriture acceptée (`Date.now()`). Une relecture
   * partie AVANT elle rendrait l'état d'avant : sa réponse est jetée.
   */
  private lastWriteAt = 0;

  /** L'instant ISO de la dernière lecture réussie — le pied dit de quand date l'écran. */
  private readonly readAt = signal<string | null>(null);

  /** « 4 h 12 » — l'heure de la dernière lecture réussie. */
  protected readonly readLabel = computed(() => hourLabel(this.readAt()));

  /**
   * La dernière relecture a-t-elle échoué ? La fiche reste à l'écran — une
   * relecture ratée ne vide rien —, mais le pied dit depuis quand elle n'a pas
   * bougé. Un écran figé qui a l'air vivant fait cocher deux fois la même ligne.
   */
  protected readonly refreshFailed = signal(false);

  /**
   * La journée vers laquelle la fiche vient de basculer **pendant qu'on la
   * regardait**, le temps de le dire.
   *
   * 🔴 Le soir, quand le plan du lendemain est arrêté, la relecture fait passer
   * la fiche à demain — c'est la règle, et c'est ce qui évite au fournil de 4 h
   * de trouver la fournée d'hier. Mais un écran qui change de journée sans
   * prévenir ferait cocher le mauvais jour : il le dit.
   */
  protected readonly dayTurned = signal<string | null>(null);

  protected readonly dayTurnedLabel = computed(() => {
    const day = this.dayTurned();
    return day === null ? null : dayLabelOf(day);
  });

  /**
   * Le rang de la dernière lecture lancée. Une réponse lente n'écrase jamais une
   * lecture partie après elle — un retirage suivi d'une relecture en vol, par
   * exemple, ne doit pas faire revenir la fiche d'avant.
   */
  private readSeq = 0;

  constructor() {
    // 🔴 Une lecture UNIQUE, et pas un `effect` sur la journée. L'écran n'a pas
    // de sélecteur de date : le seul à écrire `date` est `load` lui-même, donc
    // un effet qui la lirait se rappellerait après chaque lecture — et le jour
    // où la règle bascule d'aujourd'hui à demain, il partirait deux fois.
    void this.load();
    // Les autres postes cochent aussi : sans relecture, une ligne sortie du four
    // par le voisin resterait « à faire » ici, et on la fabriquerait deux fois.
    refreshWhileVisible(() => this.refresh());
    // La préférence n'arrive pas avant la personne : `GET /admin/me` est déjà en
    // vol pour les droits, on ne le redemande pas. Si elle n'arrive jamais, la
    // première fiche de la liste fait très bien l'affaire.
    void this.prefs.worksheetCategory().then((category) => {
      if (category !== null && this.chosen() === null) {
        this.chosen.set(category);
      }
    });
  }

  /** Les lignes du serveur, recouvertes par ce qui a été coché ici. */
  private readonly lines = computed<readonly WorkshopLine[]>(() => {
    const sheet = this.sheet();
    return sheet === null ? [] : withLocalMarks(sheet.lines, sheet.date, this.localMarks());
  });

  protected readonly groups = computed(() =>
    worksheetGroups(this.lines(), this.catalogue(), !this.shelvesLost()),
  );

  /** La fiche affichée : celle qu'on a choisie, ou la première s'il n'y a pas de choix. */
  protected readonly current = computed<WorksheetGroup | null>(() => {
    const groups = this.groups();
    const key = this.chosen();
    return groups.find((group) => group.key === key) ?? groups[0] ?? null;
  });

  /** Le rang de la fiche dans la liste — « fiche 2 sur 5 ». */
  protected readonly rank = computed(() => {
    const current = this.current();
    return current === null ? 0 : this.groups().indexOf(current) + 1;
  });

  /** Les onglets du poste fixe : le rayon et son avancement. */
  protected readonly tabs = computed<readonly FoldViewToggleOption[]>(() =>
    this.groups().map((group) => ({
      value: group.key,
      label: `${group.label} ${group.doneCount}/${group.lines.length}`,
    })),
  );

  /** Le même choix, sous le pouce : une liste, jamais six onglets de 390 px. */
  protected readonly tabOptions = computed<readonly FoldSelectItem<string>[]>(() =>
    this.groups().map((group) => ({
      value: group.key,
      label: `${group.label} · ${group.doneCount}/${group.lines.length}`,
    })),
  );

  /** Ce qui reste à faire, dans l'ordre de la fiche. */
  protected readonly todo = computed(() => (this.current()?.lines ?? []).filter((l) => !l.done));

  /** Ce qui est sorti — sur téléphone, dans le bloc replié épinglé au pied. */
  protected readonly done = computed(() => (this.current()?.lines ?? []).filter((l) => l.done));

  protected readonly donePieces = computed(() =>
    this.done().reduce((sum, line) => sum + line.quantity, 0),
  );

  /** « 4 h 05 », l'heure du tirage. `null` = le plan n'est pas arrêté. */
  protected readonly generatedLabel = computed(() => hourLabel(this.sheet()?.generatedAt ?? null));

  /** L'heure du dernier retirage, si la journée en a connu un. */
  protected readonly retakenLabel = computed(() => hourLabel(this.sheet()?.retakenAt ?? null));

  protected readonly drift = computed(() => this.sheet()?.drift ?? null);

  protected async load(date?: string): Promise<void> {
    this.state.set('loading');
    this.retakeFailed.set(false);
    this.readSeq += 1;
    const seq = this.readSeq;
    try {
      // Le catalogue part avec la fiche : sans lui, pas de rayons, donc pas de
      // postes. Une lecture ratée ne doit pas faire disparaître la production,
      // mais elle ne doit pas se taire non plus.
      const [served, catalogue] = await Promise.all([
        date === undefined ? this.workedDay() : this.api.worksheet(date),
        this.catalog.list().catch(() => null),
      ]);
      if (seq !== this.readSeq) {
        return;
      }
      this.sheet.set(served);
      // La journée vient de la RÉPONSE, pas de la demande : `workedDay` peut
      // rendre demain là où on avait aujourd'hui, et l'en-tête doit nommer la
      // fiche qu'on lit, jamais celle qu'on a demandée.
      this.date.set(served.date);
      this.shelvesLost.set(catalogue === null);
      this.catalogue.set(catalogue ?? []);
      this.state.set('ready');
      this.readAt.set(new Date().toISOString());
      this.refreshFailed.set(false);
    } catch {
      if (seq === this.readSeq) {
        this.state.set('error');
      }
    }
  }

  /**
   * **La fiche que le four est en train de faire** : demain si son plan est
   * arrêté, aujourd'hui sinon.
   *
   * Deux lectures dans le pire des cas, et une seule dans le cas courant — celui
   * du fournil de la nuit, qui trouve le plan du lendemain déjà arrêté. On
   * demande donc demain D'ABORD : la journée qui a un tirage est celle qu'on
   * fabrique, et un tirage est précisément ce qu'« arrêté » veut dire.
   *
   * ⚠️ On ne devine pas à partir de l'heure du poste. Une bascule à minuit, ou à
   * 16 h, serait une règle de plus à connaître — et fausse le jour où le fournil
   * décale son service. Ici c'est le GESTE qui fait basculer l'écran, et ce
   * geste est déjà celui que l'équipe fait.
   */
  private async workedDay(): Promise<ProductionWorksheetView> {
    const tomorrow = await this.api.worksheet(isoDay(nextDay(new Date())));
    return tomorrow.generatedAt === null ? this.api.worksheet(isoDay(new Date())) : tomorrow;
  }

  /**
   * **La relecture silencieuse** — toutes les 15 s tant que l'onglet est visible.
   *
   * Silencieuse, et c'est la différence avec {@link load} : pas d'écran de
   * chargement, pas de fiche qui disparaît, la catégorie ouverte ne bouge pas.
   * Seul change ce que le serveur sait de nouveau.
   *
   * Elle réapplique la règle du jour (`workedDay`) : la fiche bascule sur demain
   * dès que son plan est arrêté, même si l'écran était déjà ouvert — et elle le
   * dit.
   *
   * 🔴 Une réponse est **jetée** si une coche a été acceptée après le départ de
   * la relecture : elle rendrait l'état d'avant, et décocherait sous les doigts.
   * La suivante, quinze secondes plus tard, la contiendra.
   */
  private async refresh(): Promise<void> {
    if (this.state() !== 'ready') {
      return;
    }
    this.readSeq += 1;
    const seq = this.readSeq;
    const startedAt = Date.now();
    try {
      const served = await this.workedDay();
      if (seq !== this.readSeq || this.lastWriteAt >= startedAt) {
        return;
      }
      const previousDay = this.sheet()?.date ?? null;
      this.sheet.set(served);
      this.date.set(served.date);
      if (previousDay !== null && previousDay !== served.date) {
        this.dayTurned.set(served.date);
      }
      this.readAt.set(new Date().toISOString());
      this.refreshFailed.set(false);
    } catch {
      if (seq === this.readSeq) {
        this.refreshFailed.set(true);
      }
    }
  }

  /** La personne a vu que la fiche a changé de journée. */
  protected acknowledgeDayTurn(): void {
    this.dayTurned.set(null);
  }

  /** Change de fiche, et le retient pour la personne. */
  protected choose(key: string): void {
    this.chosen.set(key);
    this.doneOpen.set(false);
    void this.prefs.remember({ worksheetCategory: key });
  }

  /**
   * Coche ou décoche une ligne : **à l'écran tout de suite**, au serveur aussitôt.
   *
   * La case se coche avant la réponse — une case qui attendrait serait recochée
   * une seconde fois — mais elle est désarmée le temps de l'envoi : un second
   * geste contraire pourrait arriver avant le premier, et le serveur garderait
   * le mauvais. Acceptée, la coche est inscrite dans la fiche lue ; refusée, la
   * case revient en arrière et l'écran dit pourquoi.
   */
  protected async toggle(line: WorkshopLine, done: boolean): Promise<void> {
    const date = this.sheet()?.date ?? this.date();
    const key = markKey(date, line.sku);
    if (this.busy().has(key)) {
      return;
    }
    const initials = this.initials();
    this.markFailed.set(null);
    this.setLocal(key, { done, initials });
    this.setBusy(key, true);
    try {
      await this.api.mark(date, line.sku, done, initials);
      this.writeServed(line.sku, done, initials);
      this.lastWriteAt = Date.now();
    } catch (error) {
      this.markFailed.set(`${line.productName} — ${serverMessageOf(error)}`);
    } finally {
      this.setLocal(key, null);
      this.setBusy(key, false);
    }
  }

  /** La coche de cette ligne est-elle en train de partir ? */
  protected isBusy(line: WorkshopLine): boolean {
    return this.busy().has(markKey(this.sheet()?.date ?? this.date(), line.sku));
  }

  /**
   * Inscrit une coche acceptée dans la fiche lue. Sans ça, la case retomberait
   * sur l'état d'avant entre la réponse et la prochaine relecture.
   */
  private writeServed(sku: string, done: boolean, initials: string): void {
    this.sheet.update((sheet) =>
      sheet === null
        ? sheet
        : {
            ...sheet,
            lines: sheet.lines.map((line) =>
              line.sku === sku
                ? { ...line, done, initials: done && initials !== '' ? initials : null }
                : line,
            ),
          },
    );
  }

  private setLocal(key: string, mark: LocalMark | null): void {
    const next = new Map(this.localMarks());
    if (mark === null) {
      next.delete(key);
    } else {
      next.set(key, mark);
    }
    this.localMarks.set(next);
  }

  private setBusy(key: string, busy: boolean): void {
    const next = new Set(this.busy());
    if (busy) {
      next.add(key);
    } else {
      next.delete(key);
    }
    this.busy.set(next);
  }

  /** Absorbe ce qui est arrivé depuis le tirage, puis relit la fiche. */
  protected async retake(): Promise<void> {
    this.retakeFailed.set(false);
    try {
      await this.api.retake(this.date());
    } catch {
      this.retakeFailed.set(true);
      return;
    }
    await this.load();
  }

  protected toggleDone(): void {
    this.doneOpen.update((open) => !open);
  }

  /**
   * Les initiales de qui coche, prises sur la personne connectée.
   *
   * ⚠️ Le plan ne dit pas d'où elles viennent. Les demander à l'écran ferait taper
   * deux lettres les doigts farinés à chaque ligne ; les déduire du nom est la
   * seule source non inventée dont l'écran dispose (tranché le 2026-09-13, à
   * revoir si le fournil signe au nom de son poste et non du sien).
   */
  private initials(): string {
    const me = this.permissions.identity();
    if (me === null) {
      return '';
    }
    return `${me.firstName.charAt(0)}${me.lastName.charAt(0)}`.toUpperCase();
  }
}
