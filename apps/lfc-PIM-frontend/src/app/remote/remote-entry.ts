import type { Routes } from '@angular/router';

import { routes as pageRoutes } from '../app.routes';
import { providePimIcons } from '../pim-icons';
import { PimRemoteShell } from './pim-remote-shell';

/**
 * Module **exposé** au shell via Native Federation (`./app`). Conforme au contrat
 * `SuiteRemoteModule` du shell : le remote livre `routes`, rien de plus. Le shell
 * les monte sous `/pim`.
 *
 * Un parent `path: ''` porte : (1) `PimRemoteShell`, la chrome intra-app (menu en
 * content) ; (2) `providePimIcons()`, car en fédéré la config du PIM n'est pas
 * appliquée — on ré-enregistre les icônes custom au niveau route. Les pages
 * existantes (`app.routes.ts`) deviennent ses enfants, inchangées.
 */
export const routes: Routes = [
  {
    path: '',
    component: PimRemoteShell,
    providers: [providePimIcons()],
    children: pageRoutes,
  },
];
