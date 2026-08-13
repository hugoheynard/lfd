# Admin staff en app iPhone (Capacitor)

🟡 **Configuration en place, projet Xcode pas encore généré** — la génération
exige Xcode, absent de la machine au 2026-08-13 (seuls les Command Line Tools
sont installés). Tout ce qui pouvait être fait sans Xcode l'est ; l'étape 2
ci-dessous est la première qui bloque.

## Ce que c'est

Une coque native iOS autour de l'admin staff, pour l'avoir comme une vraie app
sur son téléphone : icône sur l'écran d'accueil, plein écran sans barre
d'adresse, entrée propre dans le sélecteur d'apps. Ce n'est **pas** destiné à
l'App Store — c'est une installation personnelle.

## La décision qui structure tout : coque distante

`capacitor.config.ts` définit `server.url` sur
`https://lfc-b2b-admin.pages.dev`. La WebView charge donc le site **déjà
déployé** au lieu d'embarquer une copie des fichiers.

Ce n'est pas un raccourci, c'est ce qui fait que **rien d'autre ne change** :

|                     | Coque distante (retenu)           | Fichiers embarqués                                          |
| ------------------- | --------------------------------- | ----------------------------------------------------------- |
| Origine de la page  | `https://lfc-b2b-admin.pages.dev` | `capacitor://localhost`                                     |
| Auth0               | inchangé, l'URL est déjà déclarée | déclarer `capacitor://localhost` en callback                |
| CORS backend        | inchangé (`PROD_FRONT_ORIGINS`)   | ouvrir `capacitor://localhost` dans `PROD_CORS_ORIGINS.b2b` |
| Mise à jour du code | à chaque déploiement, automatique | reconstruire + `cap sync` + réinstaller                     |
| Hors-ligne          | **non** — écran blanc sans réseau | la coquille s'affiche                                       |

Les deux lignes du milieu sont les vraies : le mode embarqué demande de percer
**deux murs** (les URL de retour Auth0 et la liste CORS fermée du backend) pour
un confort. La ligne « mise à jour » compte autant en pratique : avec un compte
Apple gratuit, la signature expire au bout de 7 jours et l'app doit être
réinstallée — autant que le contenu, lui, ne dépende pas de cette réinstallation.

Le hors-ligne n'est pas une perte réelle : cette app n'est qu'une façade sur une
API. Sans réseau, un cache local n'afficherait rien d'utile.

**Pour basculer en mode embarqué** (App Store, ou vrai hors-ligne) : supprimer le
bloc `server` de `capacitor.config.ts`, faire `pnpm build` puis
`pnpm ios:sync` — `webDir` pointe déjà au bon endroit. Et ne pas oublier les
deux murs du tableau, sans quoi la connexion échoue.

## Marches de sécurité (encoche, barre d'accueil)

La WebView occupe tout l'écran. Deux réglages, dans l'app web et non dans la
coque, parce que c'est le site déployé qui s'affiche :

- `src/index.html` — `viewport-fit=cover` sur la balise viewport. Sans lui, iOS
  borde la page de bandes noires **et** laisse `env(safe-area-inset-*)` à zéro :
  les marges ci-dessous ne s'appliqueraient jamais.
- `src/styles.scss` — marges `env(safe-area-inset-*)` sur `body`, avec repli
  `0px`. Inoffensif hors iOS à encoche, donc pas de build séparée.

Non vérifié sur un appareil réel : ces deux réglages sont écrits d'après la
plateforme, pas mesurés. À contrôler au premier lancement.

## Mise en route

1. **Installer Xcode** depuis l'App Store, puis pointer dessus :
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
   Installer CocoaPods (`brew install cocoapods`). Les deux sont indispensables :
   `cap add ios` lance `pod install`.
2. `pnpm --filter lfc-b2b-admin-frontend build` puis `pnpm … ios:add` — génère
   `apps/lfc-B2B-admin-frontend/ios/` (à commiter, comme le recommande Capacitor).
3. `pnpm … ios:open` ouvre Xcode. Dans **Signing & Capabilities**, choisir son
   équipe (un Apple ID gratuit suffit), puis lancer sur l'iPhone branché.
4. Sur le téléphone : Réglages → Général → VPN et gestion de l'appareil → faire
   confiance au développeur.

Avec un compte gratuit, l'app cesse de démarrer au bout de **7 jours** : il faut
la relancer depuis Xcode. Un compte développeur payant (99 €/an) porte ça à un an
et ouvre TestFlight.

## L'alternative qu'on n'a pas prise

Ajouter un manifeste PWA et faire « Sur l'écran d'accueil » depuis Safari donne
la même icône et le même plein écran, **sans Xcode, sans compte Apple, sans
expiration**. C'est nettement moins cher. Capacitor n'a d'intérêt que pour ce
qu'une PWA ne sait pas faire : accès natif (appareil photo pour scanner les QR de
retrait, notifications fiables) et distribution App Store. Si aucun de ces deux
besoins ne se concrétise, la PWA est le bon outil et cette coque peut être
abandonnée.

## Fichiers

- `apps/lfc-B2B-admin-frontend/capacitor.config.ts`
- `apps/lfc-B2B-admin-frontend/package.json` — scripts `ios:add`, `ios:sync`, `ios:open`
- `apps/lfc-B2B-admin-frontend/src/index.html` — viewport + métas iOS
- `apps/lfc-B2B-admin-frontend/src/styles.scss` — marges de sécurité
