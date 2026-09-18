# Auth0 — le réglage du tenant (runbook)

> Ce qu'il faut régler dans le tenant Auth0 pour que la boutique LFC e-commerce,
> le back-office et l'API s'entendent, et les pièges rencontrés en le faisant. Le _pourquoi_ de
> l'architecture est dans
> [`architecture-identite-auth-tenancy.md`](architecture-identite-auth-tenancy.md).

**Écrit le 2026-07-29, nettoyé le 2026-09-18.** Ce jour-là, les valeurs du §1 ont
été confrontées aux variables GitHub (`gh variable list`) et le câblage au code.
**Le dashboard Auth0 n'a pas été rouvert** : tout ce qui décrit un réglage du
tenant (§2 à §5) est ce qu'on y a posé, pas ce qu'on y a constaté ce jour-là.

La première version décrivait un **autre tenant** (`dev-bjvl7ct5se266ij4`), une
autre audience et une seule application. Aucune de ces valeurs n'est plus lue
par le code. L'original se relit par
`git show 50d6733d:documentation/b2b/auth0-setup-b2b.md`.

## 0. Ce qu'Auth0 ne sait pas : la clientèle

La boutique n'est plus une plateforme B2B : c'est **LFC e-commerce**, et sa
clientèle — **particulier** ou **pro** — se définit par **nos** comptes, pas chez
Auth0.

- **Une personne, une identité.** Particuliers et pros naissent dans la même
  connexion (`lfc-b2b-customers`, ou Google) et reçoivent le même jeton. Auth0
  atteste **qui** se connecte, rien d'autre : ni claim, ni rôle, ni connexion
  ne dit « pro ».
- **Être pro se lit en base.** Une personne est rattachée à zéro, une ou
  plusieurs sociétés (`Membership`). Le front déclare l'espace où elle agit
  (en-tête `x-lfc-company`, ou `personal` pour l'espace perso) ; le serveur le
  confronte à ses rattachements. La clientèle tarifée est `pro` seulement pour
  une société **active** (`audienceOf`, `@lfd/contracts`) : déclarer un SIRET
  ne suffit pas.
- **Conséquence pour le tenant** : ne jamais y créer une connexion, un rôle ou
  une Action pour distinguer les pros. Ce serait une seconde définition de la
  clientèle, que personne ne tiendrait à jour avec la première.

⚠️ **Les identifiants disent encore `b2b`, et c'est voulu.** `lfc-b2b-customers`
et `api-b2b.lafoliedouce.eu` sont des **valeurs** : le nom d'une connexion Auth0
ne se change pas après sa création, et changer une audience invaliderait tous
les jetons en circulation. Le « b2b » y est un vestige, pas une restriction.

---

## 1. Les valeurs — toutes publiques

| Quoi                  | Valeur                                  | Variable GitHub                  | Lue par                                                                |
| --------------------- | --------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| Tenant                | `lafoliedouce.eu.auth0.com`             | `AUTH0_DOMAIN`                   | les deux fronts, l'API (`AUTH0_DOMAIN`)                                |
| Audience **client**   | `https://api-b2b.lafoliedouce.eu`       | `AUTH0_AUDIENCE_CUSTOMERS`       | boutique (`AUTH0_AUDIENCE`), API (`AUTH0_AUDIENCE`)                    |
| Audience **staff**    | `https://api-b2b.lafoliedouce.eu/admin` | `AUTH0_AUDIENCE_STAFF`           | back-office (`B2B_ADMIN_AUTH0_AUDIENCE`), API (`AUTH0_ADMIN_AUDIENCE`) |
| SPA de la boutique    | `S4RtdOqH65uSqOH54kLbna7R6hjVKp5J`      | `AUTH0_LFC_BOUTIQUE_CLIENT_ID`   | boutique (`AUTH0_CLIENT_ID`)                                           |
| SPA du back-office    | `Ne9hS7zH2AsYeVxu4EjZV6djtNiNIh7i`      | `AUTH0_LFD_BACKOFFICE_CLIENT_ID` | back-office (`B2B_ADMIN_AUTH0_CLIENT_ID`)                              |
| Connexion des clients | `lfc-b2b-customers`                     | `AUTH0_CUSTOMER_CONNECTION`      | API, et la boutique en dur (`CUSTOMER_CONNECTION`)                     |
| Connexion de l'équipe | `lfc-staff`                             | `AUTH0_STAFF_CONNECTION`         | API                                                                    |
| Connexion Google      | `google-oauth2`                         | —                                | boutique en dur (`GOOGLE_CONNECTION`)                                  |
| Namespace des claims  | `https://lafoliedouce.eu`               | —                                | API en dur (`platform/auth/auth0-claims.ts`)                           |

Rien ici n'est secret : un Client ID de SPA, une audience et un nom de connexion
voyagent en clair dans l'URL `/authorize`. Les **deux** secrets du sujet sont
ceux de l'application M2M (§6), et ils ne vivent que dans les secrets GitHub et
le Worker.

⚠️ **Une audience est un identifiant, pas une adresse.** `api-b2b.lafoliedouce.eu`
ne résout pas, et c'est sans conséquence. La changer invaliderait tous les jetons
en circulation.

🔴 **Règle d'or : chaque audience est identique au caractère près à trois
endroits** — l'Identifier de l'API dans Auth0, la variable de build du front,
la variable de l'API. Le moindre écart (espace, `/` final, `.eu` contre `.com`)
donne `Service not found` au login côté front, ou un `401` sur tout côté API.

---

## 2. Les applications

**Auth0 → Applications → Applications.**

| Application      | Type               | Sert à                                                                       |
| ---------------- | ------------------ | ---------------------------------------------------------------------------- |
| boutique         | Single Page App    | la connexion des clients, particuliers et pros (`lfc-b2b-customers`, Google) |
| back-office      | Single Page App    | la connexion de l'équipe (`lfc-staff`)                                       |
| Management (M2M) | Machine to Machine | ouvrir des identités, poser des liens de mot de passe (§6)                   |

Pour les deux SPA :

- **Application Type** : Single Page Application. Un autre type produit des
  erreurs d'autorisation qui ne nomment pas leur cause.
- **Token Endpoint Authentication Method** : `None` — client public, PKCE. Le
  Client Secret d'une SPA ne sert à rien et ne doit être copié nulle part.
- **Grant Types** : `Authorization Code` et `Refresh Token`.
- **Allowed Callback URLs, Allowed Logout URLs, Allowed Web Origins** : les
  trois listes, à tenir identiques. Leur contenu et le piège du renommage sont
  dans [`../ops/secrets-et-variables.md`](../ops/secrets-et-variables.md) §2 — la
  seule liste qui fasse foi. En dev : `http://localhost:7316` pour la boutique,
  `http://127.0.0.1:7317` pour le back-office (ports fixés dans les
  `angular.json`).

La boutique envoie `redirect_uri = appBaseUrl()` : l'origine **et** le chemin
de déploiement. Une même build sert plusieurs adresses, donc **chaque adresse
servie** doit être listée, sans barre finale.

---

## 3. Les deux APIs

**Auth0 → Applications → APIs.** Deux APIs, une par public :

| API    | Identifier                              | Garde                             |
| ------ | --------------------------------------- | --------------------------------- |
| client | `https://api-b2b.lafoliedouce.eu`       | toutes les routes hors `/admin`   |
| staff  | `https://api-b2b.lafoliedouce.eu/admin` | `/admin/*` (`AdminTokenVerifier`) |

Un seul backend, deux publics : c'est l'audience qui sépare la surface client de
la surface staff. Un jeton client présenté sur `/admin` est refusé dès la vérification
du jeton. Sans `AUTH0_ADMIN_AUDIENCE`, l'API refuse **tout** jeton staff
(fail-closed).

- **Identifier** : immuable après création. Le retaper à la main plutôt que le
  copier-coller — un copier-coller a déjà traîné une espace.
- **Signing Algorithm** : `RS256`. L'API vérifie par JWKS avec `jose`.
- **Aucune permission, aucun scope.** Le backend est **autoritaire en base** : le
  jeton n'atteste que le `sub` (et l'adresse, §5) ; société, rôle et statut sont
  relus en base à chaque requête.
- **Allow Offline Access** sur l'API **staff** : le back-office tient sa session
  par jetons de rafraîchissement (`useRefreshTokens`, cache en
  `localstorage`), parce que les navigateurs bloquent l'iframe de
  `checkSession`. La boutique, elle, n'en demande pas.

### 3.1 ⚠️ Le piège — « Application Access »

**APIs → l'API → onglet `Application Access`** (anciennement « Machine To
Machine Applications »). Deux colonnes :

- **User-delegated Access** — l'app demande un jeton **pour une personne
  connectée** (le flux PKCE des fronts). **C'est celle à activer.**
- **Client Access** — l'app pour elle-même (`client_credentials`). Le « test »
  du dashboard passe par là : qu'il marche ne prouve rien pour les fronts.

Sans le toggle, le retour de `/authorize` porte `invalid_request: Client "…" is
not authorized to access resource server "…"`. Une SPA first-party devrait être
autorisée d'office ; sur le premier tenant il a fallu le faire à la main (2026-07-29),
et **toute nouvelle SPA** repassera par là.

---

## 4. Les connexions

**Authentication → Database** et **Authentication → Social.**

| Connexion           | Qui y naît                                               | Comment on y entre                                                      |
| ------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `lfc-b2b-customers` | les clients, particuliers et pros                        | inscription libre (passkey), ou identité ouverte par l'API (invitation) |
| `lfc-staff`         | l'équipe                                                 | identité ouverte par l'API seulement (invitation staff)                 |
| `google-oauth2`     | les clients qui choisissent Google, particuliers et pros | bouton « Continuer avec Google » de la boutique                         |

- **La boutique nomme la connexion à chaque redirection** (`connection` dans
  `authorizationParams`, `auth.facade.ts`). Sans elle, c'est la configuration de
  l'application qui choisit parmi les connexions activées — et une inscription
  atterrie sur la mauvaise base se voit proposer un mot de passe au lieu de la
  passkey.
- **`lfc-b2b-customers` doit accepter les inscriptions** (« Disable Sign Ups »
  décoché) : la boutique ouvre l'inscription par `screen_hint: 'signup'`.
- **`Username-Password-Authentication`, la connexion d'usine, ne sert à rien
  ici.** C'était le défaut du code jusqu'à ce qu'on constate qu'elle n'existe
  pas sur ce tenant : toute ouverture d'accès remontait un `500`. Les défauts
  de `AppConfig` sont désormais les deux noms réels.
- **La séparation client / équipe se tient chez Auth0** : sur la SPA du
  back-office, n'activer **que** `lfc-staff`. Une identité client ne peut alors
  pas s'y authentifier du tout, et le refus arrive avant le moindre code de l'API.

Facebook et Apple ne sont pas branchés : voir
[`plan-connexion-sociale.md`](plan-connexion-sociale.md).

---

## 5. L'Action `add-email-claim`

**Actions → Library → `add-email-claim`**, attachée au trigger **Post Login.**

```js
exports.onExecutePostLogin = async (event, api) => {
  const NS = "https://lafoliedouce.eu";
  api.accessToken.setCustomClaim(NS + "/email", event.user.email);
  api.accessToken.setCustomClaim(NS + "/email_verified", event.user.email_verified);
};
```

Auth0 **retire en silence** tout claim non namespacé d'un access token : un
`email` nu n'arrive jamais, sans erreur. Le namespace doit être le même que dans
[`auth0-claims.ts`](../../apps/lfd-api/src/platform/auth/auth0-claims.ts) — ils
ont déjà divergé une fois entre `.eu` et `.com`.

Sans cette Action :

- côté client, l'identité est provisionnée avec une adresse vide ;
- côté staff, le premier rapprochement **exige** `email_verified: true` : il
  échoue en `403`, et personne n'entre.

---

## 6. L'application M2M — le canal d'identité

L'API ouvre elle-même les identités : invitation d'un contact client, invitation
d'un membre de l'équipe, changement d'adresse. Elle passe par la **Management
API** (`platform/identity/auth0-identity.gateway.ts`) : création de
l'utilisateur sur la bonne connexion avec un mot de passe jetable, puis un
**ticket de changement de mot de passe** à usage unique, envoyé par e-mail.

- **Applications → Create → Machine to Machine**, autorisée sur « Auth0
  Management API » avec `read:users`, `create:users`, `update:users`,
  `create:user_tickets`.
- **Jamais `delete:users`** : on ne donne pas à un service le droit d'effacer
  des identités.
- Identifiants : `AUTH0_M2M_CLIENT_ID` et `AUTH0_M2M_CLIENT_SECRET`, en
  **secrets** GitHub, jamais en variables. Ils vont ensemble : l'un sans l'autre
  fait refuser le démarrage.
- Absents, l'API démarre, mais **aucune invitation ne part** ; le bulletin de
  démarrage le dit, et le déploiement vérifie leur présence dans le container.

---

## 7. Le câblage côté code

- **Boutique** : les valeurs sont injectées **au build** par
  `scripts/generate-auth-config.mjs` dans le fichier généré `auth.env.generated` (non versionné),
  depuis le `.env` en local et les variables GitHub en déploiement
  (`deploy_lfc_boutique.yml`). `provideAuth()` (`auth/auth.providers.ts`) branche
  le SDK directement : l'app est **servie en statique, sans SSR**, donc le SDK
  tourne toujours au navigateur.
- **Back-office** : même mécanisme (`deploy_lfd_backoffice.yml`). Non configuré,
  il se sait tel et n'appelle pas Auth0.
- **API** : `AUTH0_DOMAIN` et `AUTH0_AUDIENCE` sont **obligatoires** — sans
  elles, le démarrage échoue. `AUTH0_ADMIN_AUDIENCE`, les deux connexions et le
  M2M sont optionnels, avec les conséquences dites plus haut.
- **Contournements de dev** : `AUTH_DEV_IMPERSONATE` et `AUTH_ADMIN_DEV_BYPASS`
  côté API, dont le démarrage **échoue** s'ils sont actifs en production ;
  `DEV_BYPASS_AUTH` côté fronts, lu seulement dans le `.env` local, donc
  inatteignable dans une build déployée. Les deux moitiés vont ensemble : l'une sans l'autre
  donne une boutique qui demande un vrai login, ou une API qui refuse tout.

---

## 8. Table de debug — les erreurs du 2026-07-29

Rencontrées sur le **premier** tenant, dans l'ordre où elles sont tombées. Les
valeurs ont changé depuis ; les causes restent celles à chercher.

| Symptôme                                                                   | Cause                                                                         | Correctif                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Oops!, something went wrong` (page Auth0)                                 | l'origine du front absente des Allowed Callback URLs / Web Origins            | ajouter l'origine aux **trois** listes de la SPA                |
| `403` sur `/authorize`, boucle sur `/login`                                | idem                                                                          | idem, puis enregistrer et recharger sans cache                  |
| jamais de redirection vers Auth0                                           | fausse piste : le SDK annonce `auth0Client 2.4.0` quelle que soit sa version  | rien                                                            |
| `access_denied — Service not found: …`                                     | l'audience demandée ne correspond à aucune API (API absente, faute de frappe) | créer l'API ou corriger l'Identifier, puis aligner front et API |
| `invalid_request — Client "…" is not authorized to access resource server` | **User-delegated Access** non activé pour la SPA                              | §3.1                                                            |
| « Callback URL mismatch » en production (2026-08-16)                       | projet Pages renommé, la variable GitHub a suivi, Auth0 non                   | [`secrets-et-variables.md`](../ops/secrets-et-variables.md) §2  |

---

## 9. Ce qui reste ouvert

- **Le plan Auth0.** Le tenant était en **essai** en août 2026 (date non
  notée). Non revérifié depuis. À vérifier quand il retombe sur l'offre gratuite : si l'autorisation
  par application (§3.1) y disparaît, les APIs repassent en « toutes applications
  autorisées » — ça marche encore, avec une frontière de moins. Hors offre
  gratuite : domaine personnalisé, quota M2M élevé, Organizations.
- **Les applications de test du premier tenant** (`… (Test Application)`,
  trois) étaient à supprimer. Elles vivent sur `dev-bjvl7ct5se266ij4`, que plus
  rien ne lit : c'est ce tenant entier qu'il faut décider de garder ou non.
- **L'application « La Folie Coffee Admin Suite »**, citée dans
  `secrets-et-variables.md`, n'est lue par aucune variable du dépôt. Non tranché
  ici si elle sert encore.
