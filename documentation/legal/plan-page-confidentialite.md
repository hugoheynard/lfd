# Plan — la page publique « Politique de confidentialité »

> **État : 📐 plan, rien n'est bâti.** Ouvert le 2026-09-29 : la soumission de
> l'app sur Meta for Developers (connexion Facebook) refuse sans **URL de
> politique de confidentialité** ni **suppression des données utilisateur**.
> Le texte à publier part du modèle que Hugo a collé le même jour ; ce plan dit
> **où il vit**, **comment la page est servie**, et **ce qui doit changer dans
> le modèle** pour qu'il décrive l'app réelle.
>
> ⚠️ Ce n'est pas un avis juridique. L'app traite des paiements : le texte final
> se fait relire.

---

## 0. Ce que Meta demande

| Champ Meta                   | Ce qu'il faut                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Icône de l'app (1024 × 1024) | **Existe** : `apps/lfc-ecommerce-frontend/resources/icon.png`, 1024 × 1024 (vérifié).             |
| Catégorie                    | **Shopping** (« Achats ») : une boutique en ligne, particuliers et pros.                          |
| URL de la politique          | Une page **publique**, lisible **sans connexion**, qui répond **200** avec le texte dans le HTML. |
| Suppression des données      | L'option « URL d'instructions » : la même page, ancrée sur la section de suppression.             |

La seconde option de Meta — une **URL de rappel** qui reçoit un `signed_request`
et supprime d'elle-même — est écartée pour l'instant (§6).

---

## 1. Ce qui existe

Ouvert le 2026-09-29.

| Fait                                                                                                                                                                            | Où                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| La politique de confidentialité **existe comme document légal** : un des cinq (`legalNotice`, `salesTerms`, `privacy`, `cookies`, `accessibility`), rédigé dans le back-office. | `apps/lfd-api/src/b2b/content/`, `packages/contracts/src/legal-document.ts` |
| Un document = un **titre** et des **paragraphes** (titre + corps), en **fr / en / it**. Chaque paragraphe a un **id ULID** donné par le serveur, jamais dérivé du titre.        | `legalDocumentSchema`, `legalDocumentParagraphSchema`                       |
| Il est servi **en public**, sans jeton : `GET /content/legal/:mention` (throttle 60/min, mention inconnue → 404).                                                               | `platform-content.controller.ts`                                            |
| La boutique l'affiche **dans une fenêtre** ouverte depuis le pied de page — **aucune adresse** ne l'ouvre directement.                                                          | `client/legal-document-panel/`, `client/foot/`                              |
| La boutique est un **SPA statique** sur Cloudflare Pages (`outputMode: static`, `ssr: false`), avec un repli `_redirects` vers `index.html`.                                    | `angular.json`, `DEPLOYMENT-CLOUDFLARE.md`, `public/_redirects`             |
| Connexion client : **Auth0**, par **passkey** ; **Google** comme méthode sociale. **Facebook est reporté** : sa ligne est prête, activée « le jour où le tenant l'active ».     | `auth/auth.config.ts`, `account/login-methods.ts` (`ADDABLE_PROVIDERS`)     |
| **Aucun bouton « Supprimer mon compte »** dans la boutique, ni commande côté API (cherché : `deleteAccount`, « supprimer mon compte »).                                         | —                                                                           |
| **Aucun bandeau de consentement aux cookies** trouvé dans la boutique.                                                                                                          | —                                                                           |

---

## 2. La décision principale : le texte vit au back-office, la page le rend

**Un seul texte**, celui du document `privacy`. La page publique et la fenêtre
du pied de page lisent la même source ; corriger une phrase au back-office la
corrige partout. Écrire le texte en dur dans une page le ferait diverger de la
fenêtre au premier correctif — exactement ce que le document légal existe pour
empêcher.

## 3. Comment la page est servie — le piège du SPA

Un SPA statique renvoie, pour `/confidentialite`, **le même `index.html` vide**
que pour toute autre adresse ; le texte n'apparaît qu'après exécution du
JavaScript et un appel à l'API. Un robot qui ne l'exécute pas lit une page sans
contenu. Meta vérifie la page par robot : c'est le risque de refus.

| Option                                                                                                                                   | Pour                                                                                      | Contre                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **A. Une Pages Function** (à créer dans un dossier `functions` du projet Pages) : elle lit `GET /content/legal/privacy` et rend du HTML. | HTML complet, **toujours à jour**, même domaine, rien à redéployer quand le texte change. | Premier fichier `functions/` du projet : le déploiement Pages doit l'emporter (à vérifier). |
| **B. Une route Angular** `/confidentialite` dans le SPA.                                                                                 | Aucune infrastructure nouvelle.                                                           | Contenu invisible sans JavaScript : **ne règle pas le problème de Meta**.                   |
| **C. Un HTML statique** généré au build depuis l'API.                                                                                    | Simple à servir.                                                                          | Périmé dès que le texte change au back-office, jusqu'au déploiement suivant.                |

**Recommandation : A pour Meta, B en plus pour les humains** — la route Angular
ouvre le même document en pleine page depuis la boutique (le pied de page peut
y lier), et la Function répond à l'adresse publique. Si A et B visent la même
adresse, c'est la Function qui gagne : Pages sert une Function avant le repli
`_redirects`. **À vérifier au bâti** : ce comportement, et que le workflow de
déploiement emporte bien `functions/`.

La page rendue par la Function :

- langue française par défaut, `lang="fr"` ;
- un `<h2>` par paragraphe, dont l'`id` est l'**ancre** (§4) ;
- corps échappé (aucun HTML venu du back-office n'est interprété) ;
- « Dernière mise à jour » = `updatedAt` du document, pas une date écrite à la main ;
- `Cache-Control` court (quelques minutes) : un correctif doit se voir vite ;
- si l'API ne répond pas : **503** avec un message lisible, jamais une page vide en 200.

## 4. L'ancre `#suppression-des-donnees`

Meta pointe une section précise. Or les paragraphes n'ont qu'un **id ULID**
(`01J…`), et c'est voulu : un id dérivé du titre mentirait au premier
renommage. Deux façons d'avoir une ancre stable :

- **(a) un champ `anchor` facultatif** sur le paragraphe, saisi au back-office
  (`suppression-des-donnees`), validé en slug, unique dans le document. Stable,
  explicite, et utile aux autres documents (un lien vers « Droit de
  rétractation » des CGV). Demande une évolution du contrat, **additive** : un
  document sans ancre se lit comme avant.
- **(b) une URL dédiée** `/confidentialite/suppression-des-donnees` qui ne rend
  que le paragraphe dont le titre commence par « Suppression » — fragile, c'est
  le titre-clé que le contrat a écarté.

**Recommandation : (a).** Tant qu'il n'est pas bâti, la page peut rendre
l'`id` ULID comme ancre et Meta recevoir `…/confidentialite#<ulid>` : ça tient
tant qu'on ne supprime pas ce paragraphe pour le recréer.

---

## 5. Le texte : ce qui change par rapport au modèle

Le modèle collé est une bonne base. Ce qui suit est ce qui **ne décrit pas
l'app** et doit être corrigé avant publication.

### 5.1 Ce qui est faux pour l'app

| Passage du modèle                                                | Réalité                                                                                                                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Création de compte classique — mot de passe (stocké chiffré) » | **Pas de mot de passe** : inscription par **passkey** via Auth0. Écrire « clé d'accès (passkey) — la clé privée reste sur votre appareil, nous n'en recevons que la partie publique ». |
| « Connexion avec Facebook »                                      | **Pas encore active** (reportée). La garder, puisque la soumission Meta sert à l'activer ; ajouter **Google**, qui l'est déjà.                                                         |
| « Depuis l'app : Mon compte > Supprimer mon compte »             | **Le bouton n'existe pas** (§1). Retirer cette voie, ou la bâtir d'abord (§6).                                                                                                         |
| « mots de passe stockés de façon sécurisée » (section sécurité)  | Même correction : aucun mot de passe n'est stocké.                                                                                                                                     |
| « L'app utilise uniquement les cookies nécessaires »             | **À vérifier** : aucun bandeau trouvé ; confirmer qu'aucun outil de mesure d'audience ne tourne sur la boutique avant de l'écrire.                                                     |

### 5.2 Les prestataires réels

| Prestataire              | Rôle                                                                        | Localisation                                 |
| ------------------------ | --------------------------------------------------------------------------- | -------------------------------------------- |
| Auth0 (Okta)             | Authentification : passkey, connexion Google (et Facebook une fois activée) | **à confirmer** (région du tenant)           |
| Meta Platforms Ireland   | Connexion avec Facebook, une fois activée                                   | UE, transferts possibles vers les États-Unis |
| Google                   | Connexion avec Google                                                       | **à confirmer**                              |
| Cloudflare               | Hébergement de la boutique, de l'API et des documents (R2)                  | **à confirmer**                              |
| Prisma (Prisma Postgres) | Base de données                                                             | **à confirmer** (région)                     |
| Resend                   | Envoi des e-mails                                                           | **à confirmer**                              |
| Stripe                   | Paiement en ligne                                                           | **à confirmer**                              |

### 5.3 Les données réellement collectées — à confirmer avec Hugo

À partir de ce que l'app manipule : identité (nom, prénom, e-mail, téléphone),
pour les pros la **société** (raison sociale, SIRET, TVA, adresses de
facturation et de livraison), les **commandes** et leurs **factures**, les
**créneaux de retrait**, la **fidélité**, et les **journaux techniques**
(adresse IP côté passerelle). Le RIB d'un pro (prélèvement) est une donnée à
nommer s'il est collecté.

### 5.4 Les durées de conservation

Celles du modèle (compte 3 ans sans connexion, factures 10 ans, journaux 12 mois,
prospection 3 ans) sont **des propositions, pas l'état du code** : l'app ne
purge aujourd'hui ni les comptes inactifs ni les journaux. Écrire une durée
qu'aucun mécanisme n'applique, c'est promettre ce qu'on ne tient pas. Soit on
bâtit les purges, soit on écrit ce qui est vrai.

### 5.5 Ce que seul Hugo peut fournir

- raison sociale, forme juridique, capital ;
- RCS (ville) et SIREN ;
- adresse du siège ;
- adresse e-mail dédiée (ex. `confidentialite@…`) ;
- le **domaine public** de la boutique (pour l'URL donnée à Meta).

---

## 6. La suppression des données — le geste réel

Le modèle promet « suppression sous 30 jours et confirmation ». Aujourd'hui,
**aucun outil** ne supprime un compte client ; et le dépôt refuse le DELETE
physique sur les agrégats métier (CLAUDE.md §3). Il faut donc décider du geste
avant de le promettre :

- **Ce qui est effaçable** : l'identité de la personne (nom, e-mail, téléphone),
  son lien Auth0, ses méthodes de connexion.
- **Ce qui ne l'est pas** : les factures et les commandes facturées (10 ans,
  obligation comptable), les journaux d'audit déjà écrits.
- **Donc** : une **anonymisation** du compte, pas une suppression — la personne
  disparaît, la commande reste, rattachée à un client anonyme.

Deux voies, par ordre de coût :

1. **Par e-mail, traité à la main** : la page le dit, l'équipe l'exécute. Il
   faut alors un **geste d'anonymisation au back-office** (il n'existe pas) —
   sans lui, la promesse ne se tient qu'en SQL, et le runbook interdit ce
   genre de geste sur la production.
2. **Un bouton « Supprimer mon compte »** dans la boutique, qui appelle la
   même anonymisation. Plus tard, le **rappel de suppression Meta**
   (`signed_request`) pourrait déclencher le même geste.

⚠️ Ce chantier (l'anonymisation) touche au **mur tenant** et aux **données
réelles** : il passera par `vitruve` avant d'être bâti. Il n'est pas dans ce
plan.

---

## 7. Les lots

| Lot                  | Contenu                                                                                                                                  | Qui                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **P1**               | Le texte : remplir les crochets (§5.5), corriger le modèle (§5.1–5.4), le saisir au back-office dans le document `privacy`, en fr/en/it. | Hugo (+ relecture juridique) |
| **P2**               | Champ `anchor` facultatif sur un paragraphe (contrat, domaine, back-office) (§4a).                                                       | `batisseur` + `pablo`        |
| **P3** ✅ 2026-09-29 | La Pages Function `/confidentialite` (§3A) ; vérification sans JavaScript (`curl`) et en navigation privée.                              | `batisseur`                  |
| **P4**               | La route Angular `/confidentialite` et le lien du pied de page (§3B).                                                                    | `pablo`                      |

P1 ne dépend de rien. Pour soumettre à Meta au plus vite : P1 puis P3, avec
l'ancre ULID en attendant P2.

---

## 8. Questions ouvertes

- **Q1** — La voie de suppression tient-elle par e-mail seul au lancement, en
  s'engageant à bâtir l'anonymisation (§6) ? Ou attend-on l'outil ?
- ~~**Q2** — Le domaine public~~ : la boutique est servie à la racine de
  `lafoliecoffee.info` depuis le 2026-09-15 — URL Meta :
  `https://lafoliecoffee.info/confidentialite`.
- **Q3** — Aucun outil de mesure d'audience sur la boutique ? (§5.1, cookies)
- **Q4** — Le texte en anglais et en italien : traduit par nous, ou la page
  Meta ne sert que le français ?
