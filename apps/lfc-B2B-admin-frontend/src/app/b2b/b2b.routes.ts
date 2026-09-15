import { type ActivatedRouteSnapshot, type Routes } from '@angular/router';
import { legalMentionLabels, legalMentionOrder } from '@lfd/contracts/content-values';

import { permissionGuard } from '../auth/permission.guard';

/**
 * L'onglet d'une mention : son nom consacré, jamais le segment brut.
 *
 * Le titre vient du CONTRAT et non du document lu : il est posé avant tout
 * appel, et un onglet qui attendrait la réponse du serveur afficherait l'URL
 * pendant ce temps.
 *
 * ⚠️ Une mention hors vocabulaire dit « Mention inconnue », **le même mot que
 * l'écran**. Le repli a d'abord été « Mentions légales », pensé comme le nom du
 * groupe — sauf que c'est EXACTEMENT le libellé de `legalNotice` : l'onglet
 * devenait indiscernable d'une vraie page pendant que la page, elle, refusait
 * d'afficher quoi que ce soit (corrigé le 2026-09-13, vu à l'écran).
 */
function legalMentionTitle(route: ActivatedRouteSnapshot): string {
  const segment = route.paramMap.get('mention') ?? '';
  const known = legalMentionOrder.find((mention) => mention === segment);
  return `${known === undefined ? 'Mention inconnue' : legalMentionLabels.fr[known]} — LFC B2B admin`;
}

/**
 * Les routes de l'**espace B2B** — le catalogue vendu et sa tarification.
 *
 * Elles vivaient sous `/reglages`. Les anciennes URL restent servies par des
 * redirections (`app.routes.ts`) : elles sont dans les favoris, dans des liens
 * collés, et une adresse qui tombe en 404 après un rangement est un rangement
 * qui coûte à celui qui ne l'a pas fait.
 */
export const b2bRoutes: Routes = [
  {
    path: 'b2b',
    canActivate: [permissionGuard('b2b_settings:read')],
    // Le titre suit le libellé de l'espace (« E-commerce LFC ») ; la clé et les
    // adresses `/b2b/…` restent, elles vivent dans des favoris.
    title: 'E-commerce LFC — LFC B2B admin',
    loadComponent: () => import('./b2b-page/b2b-page').then((m) => m.B2bPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'catalogue' },
      {
        // LE CONTENU DE PLATEFORME — les textes de la vitrine. Sous le B2B et
        // non dans un espace à lui : c'est le même contexte que son catalogue
        // et sa tarification, et un espace séparé aurait fait deux portes pour
        // une seule maison.
        path: 'contenu',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'app-footer' },
          {
            path: 'app-footer',
            title: 'App footer — LFC B2B admin',
            loadComponent: () =>
              import('../contenu/app-footer/app-footer-page').then((m) => m.AppFooterPage),
          },
          {
            // L'ANCIENNE adresse des CGV, quand elles étaient la seule mention
            // adossée à un document. Elle est dans des favoris : un rangement
            // qui rend 404 se paie par celui qui ne l'a pas fait.
            path: 'cgv',
            pathMatch: 'full',
            redirectTo: 'mentions/salesTerms',
          },
          {
            // LES CINQ MENTIONS par un seul écran, paramétré par son segment :
            // elles ont la même forme, et cinq composants auraient divergé au
            // premier correctif. Elles vivent avec le pied de page — même
            // table, même révision, même doctrine : un article à corriger ne
            // demande ni développeur, ni revue, ni déploiement.
            path: 'mentions/:mention',
            title: legalMentionTitle,
            loadComponent: () =>
              import('../contenu/mentions/mentions-page').then((m) => m.MentionsPage),
          },
        ],
      },
      {
        // LES RÉGLAGES DE L'E-COMMERCE — ce que la boutique propose à l'achat :
        // où retirer, à qui livrer, jusqu'à quand commander. Ils vivaient dans
        // un onglet « Retraits & livraisons » des Réglages ; ils ont rejoint
        // l'espace dont ils règlent la vente (plan « remise et livraison par
        // clientèle », D6). L'ancienne adresse redirige.
        path: 'reglages',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'points-de-retrait' },
          {
            path: 'points-de-retrait',
            title: 'Points de retrait — LFC B2B admin',
            loadComponent: () =>
              import('./reglages/pickup-addresses-page/pickup-addresses-page').then(
                (m) => m.PickupAddressesPage,
              ),
          },
          {
            path: 'livraison',
            title: 'Livraison — LFC B2B admin',
            loadComponent: () =>
              import('./reglages/delivery-availability-page/delivery-availability-page').then(
                (m) => m.DeliveryAvailabilityPage,
              ),
          },
          {
            path: 'heures-limites',
            title: 'Heures limites de commande — LFC B2B admin',
            loadComponent: () =>
              import('./reglages/order-cutoffs-page/order-cutoffs-page').then(
                (m) => m.OrderCutoffsPage,
              ),
          },
        ],
      },
      {
        // LA BOÎTE DE RÉCEPTION — avant le catalogue dans la lecture comme dans
        // le temps : ce qui attend d'être validé précède ce qui est en vente.
        path: 'reception',
        title: 'Réception du catalogue — LFC B2B admin',
        canActivate: [permissionGuard('b2b_catalog:read')],
        loadComponent: () => import('./reception/reception-page').then((m) => m.ReceptionPage),
      },
      {
        path: 'catalogue',
        title: 'Catalogue B2B — LFC B2B admin',
        loadComponent: () => import('./catalogue/catalogue-page').then((m) => m.CataloguePage),
      },
      {
        path: 'tarification',
        title: 'Tarification B2B — LFC B2B admin',
        loadComponent: () =>
          import('./tarification/tarification-page').then((m) => m.TarificationPage),
      },
      {
        // La frise vit à côté de la grille, pas dedans : deux façons de lire le
        // même prix — l'une pour décider aujourd'hui, l'autre pour comprendre ce
        // qui s'est passé. Une route propre les rend partageables par lien.
        path: 'tarification/frise',
        title: 'Frise tarifaire — LFC B2B admin',
        loadComponent: () => import('./tarification/frise/frise-page').then((m) => m.FrisePage),
      },
      {
        // Le banc d'essai vit à côté de la grille et de la frise : trois façons
        // de lire le même prix — ce qui est décidé, ce qui l'était, et ce que
        // ça donne pour ce client-là à cette quantité-là.
        path: 'tarification/simulateur',
        title: 'Simulateur de prix — LFC B2B admin',
        loadComponent: () =>
          import('./tarification/simulateur/simulateur-page').then((m) => m.SimulateurPage),
      },
    ],
  },
];
