import { type Routes } from '@angular/router';

/** Les anciennes adresses des **Réglages**, vidés le 2026-10-10. */
export const reglagesRoutes: Routes = [
  {
    path: 'reglages',
    // Plus d'écran depuis le 2026-10-10 : seulement les anciennes adresses,
    // qui vivent dans des favoris. Sans garde, la destination porte le sien.
    children: [
      { path: '', pathMatch: 'full', redirectTo: '/documentation/facturation' },

      // Le catalogue et la tarification B2B ont DÉMÉNAGÉ dans l'espace B2B : on
      // ne va pas dans les réglages pour travailler. Les anciennes adresses
      // redirigent — elles vivent dans des favoris et des liens collés, et un
      // rangement qui rend 404 se paie par celui qui ne l'a pas fait.
      //
      // Les redirections sont ici, DANS les enfants de `reglages`, et non au
      // niveau racine : le routeur entre d'abord dans cette route parente, et
      // ce qu'il y cherche doit s'y trouver.
      { path: 'catalogue', redirectTo: '/b2b/catalogue' },
      { path: 'tarification', pathMatch: 'full', redirectTo: '/b2b/tarification' },
      { path: 'tarification/frise', redirectTo: '/b2b/tarification/frise' },
      { path: 'tarification/simulateur', redirectTo: '/b2b/tarification/simulateur' },
      // « Retraits & livraisons » a suivi, découpé en trois pages de
      // « E-commerce LFC → Réglages ». L'ancienne adresse mène à la première.
      { path: 'retraits-livraisons', redirectTo: '/b2b/reglages/points-de-retrait' },

      // La surtaxe de retard est partie en Comptabilité, sous son propre droit
      // `b2b_late_fee` (Hugo, 2026-09-29). Absolue, sans quoi elle resterait
      // sous le mur `b2b_settings` de ce parent.
      { path: 'surtaxe-de-retard', redirectTo: '/comptabilite/surtaxe-de-retard' },

      // Partis le 2026-10-10 (Hugo) : la facturation explique, elle va à la
      // Documentation ; les réglages commerciaux vont à l'Exploitation.
      { path: 'facturation', redirectTo: '/documentation/facturation' },
      { path: 'commercial', redirectTo: '/exploitation/commercial' },
    ],
  },
];
