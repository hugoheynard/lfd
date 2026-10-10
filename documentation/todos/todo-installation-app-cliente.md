# TODO — bandeau d'installation de l'app cliente

> ✅ **Bâti le 2026-10-10** (non commité à l'écriture de ce bandeau). Fichiers :
> `apps/lfc-ecommerce-frontend/src/app/client/install-prompt.service.ts` (la
> détection en fonctions pures, la capture de `beforeinstallprompt` au démarrage
> par `app.config.ts`, le refus mémorisé quatre semaines sous
> `lfc.install-dismissed-at`) et `src/app/client/install-banner/` (le bandeau
> `fold-callout`, monté par `client/shell/client-shell.html`), libellés dans
> `client/copy/{fr,en,it}.ts`. **Reste à vérifier sur un vrai téléphone** :
> iPhone Safari, iPhone Chrome, Android Chrome (le bouton rejoue l'invite), et
> l'app une fois installée (rien ne doit paraître) — ainsi que la place du
> bandeau au-dessus de la zone de geste iOS.

> **État au 2026-08-29** : l'app est **installable** (manifeste + icônes livrés,
> vérifiés en production sur `lafoliecoffee.info/pro`). Ce qui manque est
> l'invitation à le faire — rien, aujourd'hui, ne dit à un client que l'app
> peut sortir du navigateur.

> ⚠️ **Budget** (mesuré le 2026-10-10) : la configuration `cloudflare` de la
> boutique pèse 1,29 Mo pour un plafond d'erreur de 1,30 Mo — il reste une
> dizaine de ko avant que le déploiement refuse.

## Le problème

Les deux rangées du navigateur (adresse en haut, outils en bas) ne disparaissent
qu'une fois l'app posée sur l'écran d'accueil. Or **personne ne le devine** :

- **iOS ne propose jamais l'installation.** Il faut Partager → « Sur l'écran
  d'accueil », un geste que rien n'annonce.
- **Sur iOS, seul Safari sait le faire.** Chrome, Firefox et Edge y sont des
  habillages de WKWebView : Apple ne leur donne pas la capacité de créer une app
  plein écran, et leur « Sur l'écran d'accueil » ne produit qu'un raccourci qui
  rouvre le navigateur. Vérifié le 2026-08-29 — c'est une restriction de la
  plateforme, aucune balise n'y change quoi que ce soit.
- **Android, lui, sait le proposer** — mais via `beforeinstallprompt`, qu'il faut
  capter et rejouer soi-même si on veut choisir le moment.

## Ce qu'il faut écrire

Un bandeau discret, avec **trois états et un seul message chacun** :

| Contexte               | Message                                                        |
| ---------------------- | -------------------------------------------------------------- |
| iOS + Safari           | le geste exact : Partager → Sur l'écran d'accueil              |
| iOS + autre navigateur | « ouvrez cette page dans Safari pour installer »               |
| Android / Chrome       | un vrai bouton **Installer**, qui rejoue `beforeinstallprompt` |

Et **jamais** quand l'app tourne déjà en `display-mode: standalone`.

## Les pièges, avant d'écrire

- **Détecter Safari sur iOS n'est pas trivial** : tous les navigateurs iOS
  déclarent WebKit. Le marqueur utilisable est l'absence de `CriOS`/`FxiOS`/
  `EdgiOS` dans l'`userAgent`. C'est du reniflage, donc à isoler dans un service
  testable plutôt que de le semer dans un gabarit.
- **SSR** : `navigator`, `window.matchMedia` et l'événement d'installation
  n'existent pas au rendu serveur. Le bandeau doit naître fermé et ne s'ouvrir
  qu'au navigateur.
- **Le rejet doit tenir.** Un bandeau qui revient à chaque visite est une
  publicité. Mémoriser le refus, et ne pas le rappeler avant plusieurs semaines.
- **La place.** L'app n'a pas de barre basse ; le bandeau ne doit pas recouvrir
  le dernier bouton d'un écran, ni s'insérer dans la zone de geste iOS
  (`env(safe-area-inset-bottom)`).

## Ce qui existe déjà

`public/manifest.webmanifest` (tout en chemins **relatifs** — voir
`public/MANIFEST-README.md`, l'app est servie sous `/pro/`), les icônes 192/512
en `any maskable`, l'`apple-touch-icon` 180, et les balises `mobile-web-app-capable`.
