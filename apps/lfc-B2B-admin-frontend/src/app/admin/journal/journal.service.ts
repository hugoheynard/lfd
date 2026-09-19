import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ActivityEventView, ActivityModule, ActivityPageView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import type { DetailRow } from '../../shared/journal/detail-rows';
import type { Segment } from '../../shared/journal/phrase';

/** Ce que l'écran demande au journal. Tout est facultatif. */
export interface JournalFilters {
  readonly module?: ActivityModule;
  readonly type?: string;
  readonly actorId?: string;
  /** Ce dont on veut l'histoire — un produit, une société… — posé par une fiche. */
  readonly subjectType?: string;
  readonly subjectId?: string;
  readonly since?: string;
  /**
   * Recherche libre — nom de l'auteur, texte de la charge, identifiant du
   * sujet. Typée ici plutôt que tirée de `ActivityQuery` : la clé part en
   * paramètre de requête, et l'écran n'en dépend pas pour compiler.
   */
  readonly q?: string;
  /** La page demandée, à partir de 1. */
  readonly page?: number;
  /**
   * L'ancre de l'instantané, rendue par la page 1 et renvoyée par les
   * suivantes. Absente : la réponse en fixe une neuve.
   */
  readonly asOf?: string;
  /** La taille d'une page. */
  readonly limit?: number;
}

/**
 * Les filtres de la **tranche fiscale** : ceux du journal, sans `module`. Le
 * serveur borne déjà la tranche à ses types et retire la clé de son contrat ;
 * l'écarter du type rend son envoi inexprimable plutôt qu'ignoré.
 */
export type TaxJournalFilters = Omit<JournalFilters, 'module'>;

/** Lecture du journal d'activité (`GET /admin/activity`) et de sa tranche fiscale. */
@Injectable({ providedIn: 'root' })
export class JournalService {
  private readonly http = inject(HttpClient);

  page(filters: JournalFilters): Promise<ActivityPageView> {
    return this.read(`${B2B_API_BASE}/admin/activity`, filters);
  }

  /**
   * `GET /admin/activity/tax` — taux de TVA, TVA d'une catégorie ou d'un
   * produit, règles comptables. Exige `pim_tax:write` : la comptabilité n'a
   * pas `activity:read`, et recevrait `403` sur le journal entier.
   */
  taxPage(filters: TaxJournalFilters): Promise<ActivityPageView> {
    return this.read(`${B2B_API_BASE}/admin/activity/tax`, filters);
  }

  private read(url: string, filters: JournalFilters): Promise<ActivityPageView> {
    return firstValueFrom(this.http.get<ActivityPageView>(url, { params: paramsOf(filters) }));
  }
}

/** Seuls les filtres renseignés partent : un paramètre vide filtrerait sur du vide. */
function paramsOf(filters: JournalFilters): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}

/**
 * Ce que l'événement raconte, **en français**.
 *
 * Deux lignes, et c'est délibéré : la première dit CE QUI s'est passé, la
 * seconde QUAND, PAR QUI et POUR QUI. Tout sur une seule ligne, on ne lisait
 * plus rien ; réparti sur deux, un journal se parcourt à l'œil.
 */
export interface JournalLine {
  readonly event: ActivityEventView;
  /** « Création d'un membre de l'équipe » — le geste ; vide quand la phrase suffit. */
  readonly title: string;
  /** La phrase en segments — les noms en gras, le sujet lié à sa fiche. */
  readonly segments: readonly Segment[];
  /** « Commande ORD-142 passée » — la même phrase, en texte suivi. */
  readonly sentence: string;
  /** Tout ce que la phrase n'a pas dit de la charge, clé par clé (replié à l'écran). */
  readonly detail: readonly DetailRow[];
  /** Vrai quand la phrase nomme déjà l'auteur : la méta ne répète pas « par … ». */
  readonly sentenceNamesActor: boolean;
  /** « Comptes clients » — le libellé du module, jamais sa clé ; vide sans module. */
  readonly moduleLabel: string;
  /** « 21 août 2026 à 14:32 » — jamais l'ISO brut. */
  readonly when: string;
  /** « Hugo Heynard (Commercial) », ou la NATURE de l'acteur si l'annuaire l'ignorait. */
  readonly actor: string;
  /** « pour Boulangerie Martin (SARL MARTIN) » — vide quand le fait n'a pas de client. */
  readonly forWhom: string;
  /** « touche 3 familles à emporter, 1 sur place » — vide quand le fait n’a pas de portée. */
  readonly blast: string;
}
