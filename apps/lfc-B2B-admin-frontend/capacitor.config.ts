import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Coque iOS de l'admin staff — l'app qu'on installe sur SON téléphone, pas une
 * app de l'App Store.
 *
 * **Mode retenu : coque distante** (`server.url`). La WebView charge directement
 * le site déjà déployé sur Cloudflare Pages au lieu d'embarquer une copie des
 * fichiers. Ce n'est pas de la paresse, c'est ce qui fait que RIEN d'autre ne
 * change :
 *
 * - L'origine reste `https://lfc-b2b-admin.pages.dev`. Donc Auth0 fonctionne tel
 *   quel (l'URL de retour est déjà déclarée) et le CORS du backend aussi
 *   (`PROD_FRONT_ORIGINS.b2bAdminFront`). En mode embarqué, l'origine
 *   deviendrait `capacitor://localhost` : il faudrait la déclarer chez Auth0 ET
 *   l'ouvrir dans la liste CORS — deux murs percés pour un confort.
 * - L'app suit les déploiements. Chaque push sur `main` la met à jour, sans
 *   reconstruire ni re-signer quoi que ce soit. Avec un compte Apple gratuit la
 *   signature expire au bout de 7 jours ; autant que le contenu, lui, ne dépende
 *   pas d'une réinstallation.
 *
 * Contrepartie assumée : **aucun mode hors-ligne**. Sans réseau, écran blanc.
 * Pour un outil d'administration qui ne fait qu'appeler une API, un cache
 * local n'afficherait de toute façon rien d'utile.
 *
 * Pour passer en mode embarqué (App Store, ou vrai hors-ligne) : supprimer le
 * bloc `server`, lancer `pnpm build`, puis `pnpm cap sync ios` — `webDir` pointe
 * déjà au bon endroit. Et déclarer `capacitor://localhost` chez Auth0 + dans
 * `PROD_CORS_ORIGINS.b2b` (packages/endpoints), sinon la connexion échoue.
 */
const config: CapacitorConfig = {
  appId: 'com.lafoliecoffee.b2badmin',
  appName: 'LFC Admin',
  // Sortie du builder `@angular/build:application` (sous-dossier `browser/`).
  // Inutilisé tant que `server.url` est défini, mais `cap sync` exige que le
  // chemin existe — et c'est lui qui servira au basculement en mode embarqué.
  webDir: 'dist/lfc-b2b-admin-frontend/browser',
  server: {
    url: 'https://lfc-b2b-admin.pages.dev',
    // Pas de HTTP en clair : la WebView doit refuser un downgrade, comme le
    // ferait Safari. C'est le défaut, on l'écrit pour que ça reste vrai.
    cleartext: false,
  },
  ios: {
    // La WebView occupe tout l'écran, encoche comprise ; c'est le CSS de l'app
    // qui réserve les marges (`env(safe-area-inset-*)` dans styles.scss), pour
    // que la barre d'état ne recouvre jamais l'en-tête.
    contentInset: 'never',
  },
};

export default config;
