import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Coque native de l'app CLIENT — même parti pris que l'admin staff
 * (`apps/lfc-B2B-admin-frontend/capacitor.config.ts`), et pour les mêmes
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
 * ⚠️ `server.url` pointera sur `https://lafoliecoffee.info/pro` dès que la zone
 * y routera le projet Pages. En attendant, l'adresse du projet lui-même — celle
 * que nos déploiements mettent à jour, cf. la note sous `url`. C'est la seule
 * ligne à changer.
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
  webDir: 'dist/lfc-b2b-platform-frontend/browser',
  server: {
    // ⚠️ `lfc-b2b-eu7`, PAS `lfc-b2b` : Cloudflare a suffixé le sous-domaine du
    // projet Pages en silence, et `lfc-b2b.pages.dev` rend une build PLUS
    // ANCIENNE qu'aucun déploiement ne met à jour. Vérifié le 2026-08-27 : les
    // deux répondent 200, avec des bundles différents.
    url: 'https://lfc-b2b-eu7.pages.dev',
    // Pas de HTTP en clair : la WebView doit refuser un downgrade, comme le
    // ferait Safari. C'est le défaut, on l'écrit pour que ça reste vrai.
    cleartext: false,
  },
  ios: {
    // La WebView occupe tout l'écran, encoche comprise ; c'est le CSS qui
    // réserve les marges (`env(safe-area-inset-top)` dans la barre de marque),
    // et `viewport-fit=cover` dans `index.html` qui les rend disponibles.
    contentInset: 'never',
  },
};

export default config;
