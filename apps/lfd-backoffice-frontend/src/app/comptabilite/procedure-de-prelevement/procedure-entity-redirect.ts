import { inject } from '@angular/core';
import { Router, type CanActivateFn, type Routes, type UrlTree } from '@angular/router';

import { CollectionProcedureService } from '../collection-procedure.service';
import { PROCEDURE_LIST_ROUTE } from './procedure-list-wording';
import { PROCEDURE_TAB_PARAM } from './procedure-tab-param';

/**
 * `/comptabilite/procedure-de-prelevement/entite/:entityId` — la procédure EN
 * COURS d'une entité, sans connaître son identifiant (2026-10-24).
 *
 * Aucune lecture nouvelle : celle du détail, adressée par l'entité seule, où
 * la règle du § 4.3 choisit le lot suivi (comme les anciennes adresses
 * `?entite=&lot=`). Sa procédure, sinon celle de la clôture à préparer ;
 * sans l'une ni l'autre, ou si la lecture échoue, la table des procédures de
 * l'entité — qui dit elle-même son refus. `?onglet=` suit le renvoi.
 */
export const procedureOfEntityRedirect: CanActivateFn = async (route): Promise<UrlTree> => {
  const router = inject(Router);
  const api = inject(CollectionProcedureService);
  const entityId = route.paramMap.get('entityId') ?? '';
  const tab = route.queryParamMap.get(PROCEDURE_TAB_PARAM);
  const procedureId = await api
    .read({ legalEntityId: entityId }, null)
    .then((view) => view.followed?.procedureId ?? view.toPrepare?.procedureId ?? null)
    .catch(() => null);
  return procedureId === null
    ? router.createUrlTree([PROCEDURE_LIST_ROUTE], { queryParams: { entite: entityId } })
    : router.createUrlTree([PROCEDURE_LIST_ROUTE, procedureId], {
        queryParams: tab === null ? {} : { [PROCEDURE_TAB_PARAM]: tab },
      });
};

/** La route du renvoi : sans écran, la garde décide toujours d'ailleurs. */
export const procedureOfEntityRoutes: Routes = [
  { path: '', canActivate: [procedureOfEntityRedirect], children: [] },
];
