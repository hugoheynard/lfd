# Auth0 — configuration B2B (runbook)

> Runbook **daté** de la configuration réelle du tenant Auth0 pour la plateforme
> B2B (front `lfc-B2B-platform-frontend` + backend `lfc-B2B-platform-backend`).
> Décisions d'architecture : voir [`architecture-identite-auth-tenancy.md`](architecture-identite-auth-tenancy.md).
> Ici = **le concret** : quels réglages cliquer dans le dashboard, dans quel
> ordre, et les pièges rencontrés.

**Établi le : 2026-07-29.** Login utilisateur de bout en bout fonctionnel à
cette date (front → Auth0 → retour `/?code=…` → session).

---

## 1. Valeurs (toutes publiques — aucun secret ici)

| Clé | Valeur | Où |
|-----|--------|-----|
| **Tenant / Domain** | `dev-bjvl7ct5se266ij4.eu.auth0.com` | front `auth.config.ts`, backend `AUTH0_DOMAIN` |
| **API Identifier = Audience** | `https://api.lfc-b2b-platform` | front `auth.config.ts` `audience`, backend `AUTH0_AUDIENCE` |
| **SPA Client ID** | `Qk5sMKDBKB8OD3YC3JjIzfeXXkUf00qJ` | front `auth.config.ts` `clientId` |

> Le Client ID d'une SPA et l'Identifier d'API **ne sont pas secrets** (ils
> transitent dans l'URL `/authorize`). Le seul secret du flux est le code
> d'autorisation à usage unique + PKCE. Le **Client Secret** de l'app SPA n'est
> **pas** utilisé (client public, PKCE). Ne jamais committer : le secret DB
> (`DATABASE_B2B_URL`), qui n'a rien à voir avec Auth0.

⚠️ **Règle d'or** : l'audience doit être **identique au caractère près** à 3
endroits — API Identifier (Auth0) · `auth.config.ts` (front) · `AUTH0_AUDIENCE`
(backend `.env`). Le moindre écart (espace, `plateform` vs `platform`, `/` final)
→ erreur `Service not found` au login.

---

## 2. L'Application SPA (front login)

**Auth0 → Applications → Applications → `La Folie Coffee B2B Platform`**

- **Application Type** : **Single Page Application** (impératif — c'est ce qui
  autorise le flux utilisateur sur une API ; un mauvais type = erreurs d'autor.).
- **Grant Types** (Advanced Settings → Grant Types) : `Authorization Code`,
  `Refresh Token`, `Implicit` (défaut SPA — OK).
- **Token Endpoint Authentication Method** : `None` (client public, PKCE).
- **URLs** — l'origine du front, **exactement**, sans slash final :
  - **Allowed Callback URLs** : `http://localhost:7316`
  - **Allowed Logout URLs** : `http://localhost:7316`
  - **Allowed Web Origins** : `http://localhost:7316`
  - > Ajouter `https://lfc-b2b.pages.dev` (et tout autre port de dev réellement
  >   utilisé) quand on déploiera. Le `redirect_uri` est calculé à l'exécution
  >   = `window.location.origin`, donc **chaque origine servie** doit être listée.
  - > Port **7316** = celui que `ng serve` sort en local (4200 occupé). Si le
  >   port change, il faut le rajouter ici, sinon `403` au `/authorize`.

---

## 3. L'API (resource server)

**Auth0 → Applications → APIs → `LFC B2B Platform API`**

- **Identifier** : `https://api.lfc-b2b-platform` (= l'audience ; **immuable**
  après création — se retape à la main, pas de copier-coller qui traîne une
  espace).
- **Signing Algorithm** : `RS256` (le backend vérifie via JWKS `jose`).
- Pas de permissions/scopes définis pour l'instant (`0/0`) — pas nécessaire : le
  backend est **DB-autoritaire** (le rôle/société viennent de la base, pas des
  scopes du token).

### 3.1 ⚠️ LE piège — « Application Access »

**Auth0 → APIs → [l'API] → onglet `Application Access`** (ancien nom :
« Machine To Machine Applications »).

Deux colonnes :

- **User-delegated Access** = l'app demande un jeton **pour un utilisateur
  connecté** (flux `authorization_code` + PKCE du front). **← à activer.**
- **Client Access** = l'app pour elle-même (flux `client_credentials` / M2M ; le
  « test curl » du dashboard passe par là — normal qu'il marche même sans ça).

**Action faite** : ouvrir la ligne `La Folie Coffee B2B Platform` → activer
**User-delegated Access** (le `0/0 permissions` n'empêche pas : c'est
**l'autorisation de l'app sur la resource server** qui compte) → Save.

Sans ce toggle → `invalid_request: Client "…" is not authorized to access
resource server "https://api.lfc-b2b-platform"` au retour du `/authorize`.

> Une SPA first-party est censée être auto-autorisée pour les APIs du tenant ;
> ici il a fallu l'activer explicitement. Toute nouvelle app SPA de ce tenant
> devra repasser par **Application Access → User-delegated Access**.

---

## 4. Utilisateurs

**Auth0 → User Management → Users → Create User** (connection
`Username-Password-Authentication`). Auth0 gère les credentials ; notre base ne
stocke que le `auth0_sub` (+ email). Pour ouvrir l'auto-inscription :
Authentication → Database → `Username-Password-Authentication` → décocher
« Disable Sign Ups ».

---

## 5. Chronologie des erreurs rencontrées (2026-07-29) — table de debug

Dans l'ordre où elles sont tombées, chacune levée par un réglage précis :

| Symptôme | Cause | Fix |
|----------|-------|-----|
| `Oops!, something went wrong` (page Auth0) | `redirect_uri` = `http://localhost:7316` absent des Allowed Callback/Web Origins (front sur 7316, pas 4200) | Ajouter `http://localhost:7316` aux 3 champs URLs de l'app SPA |
| `403` sur `/authorize`, boucle sur `/login` | Idem (origine non autorisée) | Idem + Save + hard refresh |
| Jamais de redirection vers Auth0 | (fausse piste) télémétrie `auth0Client version 2.4.0` — c'est une **constante non bumpée dans le SDK 2.11.0**, pas un cache | Rien à faire côté version |
| `access_denied — Service not found: https://api.lfc-b2b-plateform` | Audience pointe une API inexistante (l'app SPA existait, pas l'API ; puis identifiant avec une **espace** / `plateform` vs `platform`) | Créer l'API avec Identifier `https://api.lfc-b2b-platform` **exact**, aligner front + backend |
| `invalid_request — Client "…" is not authorized to access resource server` | App SPA pas autorisée sur l'API (**User-delegated Access** à `0/0`) | API → Application Access → activer **User-delegated Access** pour l'app SPA |

---

## 6. Câblage côté code

- **Front** ([`auth.config.ts`](../apps/lfc-B2B-platform-frontend/src/app/auth/auth.config.ts)) :
  `domain` / `clientId` / `audience` + `apiBaseUrl` (`http://localhost:3200`).
  SDK `@auth0/auth0-angular` **isolé dans la config navigateur**
  (`app.config.browser.ts` → `main.ts`) car non isomorphe (constructeur
  `AuthService` → `checkSession()` → `window`) ; le pré-rendu SSR/statique passe
  par `app.config.server.ts` sans Auth0. Façade `AuthFacade` = seule frontière
  SSR-safe. Commits `501f5bf`, `eb02bb0`.
- **Backend** (`.env`, gitignoré) : `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` (= même
  audience), vérification RS256/JWKS via `jose`. Résolution **DB-autoritaire** :
  le token prouve le `sub`, la base donne `userId`/`companyId`/`role`/`status`.

---

## 7. Nettoyage à faire (dette de tâtonnement)

Le tenant contient des **apps de test résiduelles** créées pendant la mise au
point, à **supprimer** pour n'y voir que le nécessaire :

- `lfc-b2b-platform (Test Application)` — `aRCNw1vCTcHo8dk3KmYPrlUa3oiOER4z`
- `LFC-B2B-PLATFORM (Test Application)` — `xyCRv0TqCH0uxO2rB9dyNJZb2SYqjpsK`
- `lfc-b2b-platform-frontend (Test Application)` — `nP1iZ8swzlSSyudZhM9U5UuZJ8fKdJY0`

**À conserver** : `La Folie Coffee B2B Platform` (`Qk5s…`, celle de
`auth.config.ts`) + l'API `LFC B2B Platform API`. Le `Default App` du tenant peut
rester (non utilisé).

---

## 8. Reste à faire (auth)

- **Seed** DB B2B : `Company` + `User` (`auth0_sub` = sub du user de test,
  `status=active`) pour que `GET /me` réponde l'identité réelle (sinon `401
  Compte inconnu`, attendu).
- **Provisioning** customer par un commercial via **Management API** (app M2M à
  créer plus tard) → `sub` stocké → `INVITED` → `ACTIVE`.
- **Déploiement** : ajouter les origines de prod aux Allowed URLs.
