import { type Routes } from '@angular/router';
import { legalMentionOrder } from '@lfd/contracts/content-values';

import { LEGAL_MENTION_SLUGS } from '../reglages/legal-mention-slugs';

/**
 * L'ancienne adresse d'une mention (`/b2b/contenu/mentions/<clé>`) vers la
 * nouvelle (`/reglages/legal/<segment>`). Une clé hors vocabulaire garde son
 * segment : l'écran dit alors « Mention inconnue », comme avant.
 */
export function legacyLegalMentionRedirect({
  params,
}: {
  readonly params: Readonly<Record<string, string>>;
}): string {
  const segment = params['mention'] ?? '';
  const known = legalMentionOrder.find((mention) => mention === segment);
  return `/reglages/legal/${known === undefined ? segment : LEGAL_MENTION_SLUGS[known]}`;
}

/**
 * Les anciennes adresses `/b2b/…`.
 *
 * L'**espace « E-commerce LFC »** a été supprimé le 2026-10-17 (Hugo) : plus
 * d'entrée au rail ni au lanceur, plus de coquille. Ses écrans étaient tous
 * partis ailleurs ; il ne reste ici que leurs redirections — elles vivent dans
 * des favoris, et une adresse qui tombe en 404 après un rangement coûte à celui
 * qui ne l'a pas fait. Le parent n'a ni composant ni garde : une redirection
 * s'applique avant tout mur.

 * Le dernier écran, la boîte des demandes clients, est parti dans le
 * Commercial le 2026-10-17 (Hugo) : `/commercial/demandes`.
 */
export const b2bRoutes: Routes = [
  {
    path: 'b2b',
    children: [
      // L'ancienne entrée de l'espace menait aux demandes clients.
      { path: '', pathMatch: 'full', redirectTo: '/commercial/demandes' },
      {
        // LES ANCIENNES ADRESSES DU CONTENU DE PLATEFORME. Tout ce qu'il portait
        // est parti : la vitrine, les mentions, puis le pied de page (2026-10-15,
        // Hugo, section Communication). Elles vivent dans des favoris.
        // Absolues, les redirections s'appliquent AVANT les gardes : le mur de
        // l'espace ne les voit pas.
        path: 'contenu',
        children: [
          { path: '', pathMatch: 'full', redirectTo: '/pied-de-page' },
          // LE PIED DE PAGE est parti en Communication le 2026-10-15 (Hugo),
          // `/pied-de-page`, sous le même droit `b2b_settings:read`.
          { path: 'app-footer', pathMatch: 'full', redirectTo: '/pied-de-page' },
          {
            // L'ANCIENNE adresse de la vitrine. Elle a quitté l'espace pour
            // `/vitrine`, gardée par son propre droit : sous ce parent, le mur
            // `b2b_settings` aurait fermé l'éditeur à la communication, qui la
            // compose (boutique-rayon-layout.md, D7). La redirection
            // s'applique AVANT les gardes : le mur de l'espace ne la voit pas.
            path: 'vitrine',
            pathMatch: 'full',
            redirectTo: '/vitrine',
          },
          {
            // L'ANCIENNE adresse des CGV, quand elles étaient la seule mention
            // adossée à un document. Elle est dans des favoris : un rangement
            // qui rend 404 se paie par celui qui ne l'a pas fait.
            path: 'cgv',
            pathMatch: 'full',
            redirectTo: '/reglages/legal/cgv',
          },
          {
            // LES CINQ MENTIONS sont parties en Réglages › Légal le 2026-10-15
            // (Hugo), sous le même droit `b2b_settings:read`. Absolue, la
            // redirection s'applique AVANT les gardes : le mur de l'espace ne
            // la voit pas.
            path: 'mentions/:mention',
            redirectTo: legacyLegalMentionRedirect,
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
          // Il ne reste ici que des anciennes adresses : l'ouverture, l'heure
          // limite et l'annulation sont parties en Réglages › Commandes sous
          // leurs propres droits (plan-reglages-commandes.md, O1b, 2026-10-13).
          // Absolues, les redirections s'appliquent AVANT les gardes : le mur
          // `b2b_settings` de l'espace ne les voit pas.
          { path: '', pathMatch: 'full', redirectTo: '/reglages/commandes/heure-limite' },
          // LES POINTS DE RETRAIT sont devenus les SITES (plan des sites, lot
          // S1, 2026-10-13) : même identifiant, Réglages › Sites, sous
          // `lfc_site_settings`. Les anciennes adresses vivent dans des favoris
          // et dans le journal. Absolues, la redirection s'applique AVANT les
          // gardes : le mur `b2b_settings` de l'espace ne la voit pas.
          {
            path: 'points-de-retrait',
            pathMatch: 'full',
            redirectTo: '/reglages/sites',
          },
          {
            path: 'points-de-retrait/nouveau',
            pathMatch: 'full',
            redirectTo: '/reglages/sites/nouveau',
          },
          {
            path: 'points-de-retrait/:id',
            pathMatch: 'full',
            redirectTo: '/reglages/sites/:id',
          },
          {
            // LA LIVRAISON est partie dans l'Exploitation (Hugo, 2026-10-10) :
            // à qui on livre et avec quelles marges se règle à côté des
            // tournées qui le tiennent. L'ancienne adresse est dans des favoris.
            // La redirection s'applique AVANT les gardes.
            path: 'livraison',
            pathMatch: 'full',
            redirectTo: '/reglages/livraison/zones',
          },
          {
            path: 'ouverture-boutique',
            pathMatch: 'full',
            redirectTo: '/reglages/commandes/ouverture',
          },
          {
            path: 'commandes',
            pathMatch: 'full',
            redirectTo: '/reglages/commandes/annulation',
          },
          // Les motifs des demandes ont rejoint Réglages › Commercial (Hugo,
          // 2026-10-13). Absolue, sans quoi elle resterait sous le mur
          // `b2b_settings` de l'espace.
          {
            path: 'motifs-des-demandes',
            pathMatch: 'full',
            redirectTo: '/reglages/commercial/motifs-des-demandes',
          },
          {
            path: 'heures-limites',
            pathMatch: 'full',
            redirectTo: '/reglages/commandes/heure-limite',
          },
        ],
      },
      // LA CARTE DE CONTACT est partie en Communication le 2026-10-15 (Hugo),
      // `/contact`, sous le même droit `b2b_contact:read`. Les anciennes
      // adresses vivent dans des favoris ; absolues, elles s'appliquent AVANT
      // les gardes : le mur `b2b_settings` de l'espace ne les voit pas.
      { path: 'contact', pathMatch: 'full', redirectTo: '/contact' },
      { path: 'contact/carte', pathMatch: 'full', redirectTo: '/contact' },
      {
        path: 'contact/formulaire',
        pathMatch: 'full',
        redirectTo: '/reglages/commercial/motifs-des-demandes',
      },
      // L'ancienne adresse de la cloche : un courriel déjà parti la porte encore.
      { path: 'contact/messages', pathMatch: 'full', redirectTo: '/commercial/demandes' },
      // LA BOÎTE DES DEMANDES CLIENTS est partie dans le Commercial le
      // 2026-10-17 (Hugo), `/commercial/demandes`. Favoris, notifications et
      // courriels déjà partis portent l'ancienne adresse ; la redirection garde
      // `?demande=<id>`. Absolue, elle s'applique AVANT les gardes.
      { path: 'demandes', pathMatch: 'full', redirectTo: '/commercial/demandes' },
      // LA BOÎTE DE RÉCEPTION est partie en X2 (2026-10-17) avec le push : les
      // faits du catalogue s'appliquent fiche par fiche. L'adresse vit dans des
      // favoris ; absolue, la redirection s'applique AVANT les gardes.
      { path: 'reception', pathMatch: 'full', redirectTo: '/catalogue-publie' },
      // LE CATALOGUE PUBLIÉ (l'ancien « Catalogue actuel en ligne ») a quitté
      // cet espace le 2026-10-15 pour Gestion Boutique, `/catalogue-publie`
      // (H9 de plan-catalogue-synchronise-par-audience.md). L'ancienne adresse
      // vit dans des favoris ; absolue, la redirection s'applique AVANT les
      // gardes : le mur de l'espace ne la voit pas.
      { path: 'catalogue', pathMatch: 'full', redirectTo: '/catalogue-publie' },
      // LES PROMOTIONS (l'ancienne « Tarification B2B ») ont quitté cet espace
      // le 2026-10-13 (Hugo : « ne devrait pas ouvrir le secondary menu
      // d'e-commerce LFC ») : route de premier niveau `/promotions`, dans
      // Gestion Boutique. Les anciennes adresses vivent dans des favoris.
      { path: 'tarification', pathMatch: 'full', redirectTo: '/promotions' },
      { path: 'tarification/frise', redirectTo: '/promotions/frise' },
      { path: 'tarification/simulateur', redirectTo: '/promotions/simulateur' },
    ],
  },
];
