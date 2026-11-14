import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Coque native de l'app CLIENT — même parti pris que l'admin staff
 * (`apps/lfd-backoffice-frontend/capacitor.config.ts`), et pour les mêmes
 * raisons : **coque distante** (`server.url`), la WebView charge le site déjà
 * déployé au lieu d'embarquer une copie.
 *
 * Ce que ça préserve, et qui n'est pas rien : l'origine reste celle du site.
 * Auth0 et le CORS du backend continuent donc de fonctionner tels quels. En
 * mode embarqué l'origine deviendrait `capacitor://localhost` — deux murs à
 * percer pour un confort. Et l'app suit les déploiements : un push sur `main`
 * la met à jour, sans reconstruire ni re-signer.
 *
 * Contrepartie assumée, la même que l'admin : **aucun mode hors-ligne**.
 *
 * `server.url` vise `https://lafoliecoffee.info`, la seule adresse de la
 * boutique qu'Auth0 autorise (Callback, Logout et Web Origins, relu le
 * 2026-11-14) : depuis une autre, la connexion est refusée au retour.
 *
 * Pour passer en mode embarqué (App Store, ou vrai hors-ligne) : retirer le
 * bloc `server`, lancer `pnpm build:capacitor` — cette configuration-là garde
 * un `base href` à `/`, puisqu'un conteneur lit des fichiers et pas une URL —
 * puis `pnpm ios:sync`. Et déclarer `capacitor://localhost` chez Auth0.
 */
const config: CapacitorConfig = {
  appId: 'fr.lafoliecoffee.pro',
  appName: 'La Folie Coffee Pro',
  // Sortie du builder `@angular/build:application` (sous-dossier `browser/`).
  // Inutilisée tant que `server.url` est défini, mais `cap sync` exige que le
  // chemin existe — et c'est elle qui servira au basculement en mode embarqué.
  webDir: 'dist/lfc-ecommerce-frontend/browser',
  server: {
    // 🔴 **Cette URL EST l'application** : la WebView ne sert rien en local tant
    // qu'elle est définie, donc une adresse périmée livre une app figée à qui
    // l'a installée — sans qu'aucun déploiement ne rougisse.
    //
    // L'adresse publique de la boutique, celle que la passerelle sert et
    // qu'Auth0 autorise — jamais l'adresse technique du projet Pages, que
    // la connexion refuserait.
    url: 'https://lafoliecoffee.info',
    // Pas de HTTP en clair : la WebView doit refuser un downgrade, comme le
    // ferait Safari. C'est le défaut, on l'écrit pour que ça reste vrai.
    cleartext: false,
  },
  ios: {
    // La WebView occupe tout l'écran, encoche comprise ; c'est le CSS qui
    // réserve les marges (`env(safe-area-inset-top)` dans la barre de marque),
    // et `viewport-fit=cover` dans `index.html` qui les rend disponibles.
    contentInset: 'never',
    // Ce que le natif peint DERRIÈRE la WebView — le temps du chargement, et
    // sous la bande de sécurité. Blanc par défaut, ce qui donnait un bandeau
    // clair au-dessus d'une app bleue.
    backgroundColor: '#12307f',
  },
};

export default config;
