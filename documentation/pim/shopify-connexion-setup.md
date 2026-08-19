# Connexion Shopify — mise en place (runbook)

> **But.** Brancher le PIM sur une vraie boutique Shopify pour l'API Admin, en
> **server-to-server** (le backend appelle Shopify, aucune UI embarquée). Ce doc
> retrace **les étapes qui ont effectivement marché**, dans l'ordre, avec les
> pièges rencontrés.
>
> Statut : **connexion établie** (validée sur `1kkhae-8q.myshopify.com`, 2026-08-04).
> Voisins : [`projection-shopify.md`](projection-shopify.md) (comment le catalogue
> se projette une fois connecté), [`migration-pim-localdb-vers-prisma.md`](migration-pim-localdb-vers-prisma.md).

---

## 1. La décision de connexion (pourquoi PAS `npm init @shopify/app`)

Deux modèles d'intégration Shopify existent :

- **App publique / embedded** (`npm init @shopify/app@latest`) : OAuth interactif,
  App Bridge, hébergement, App Store. C'est pour **distribuer une app à N marchands**.
  **Overkill** et hors-sujet ici.
- **App server-to-server sur SA boutique** : le backend appelle l'API Admin avec un
  jeton. **C'est notre cas.**

Depuis le **1ᵉʳ janvier 2026**, on ne peut plus créer de « legacy custom app »
(l'ancien flux _Settings → Develop apps → copier le token_). Toute nouvelle app
passe par le **Dev Dashboard**, qui **n'affiche plus de jeton** à copier : il faut
l'obtenir **par programme** via un grant OAuth.

Chemin retenu : **client credentials grant** — le backend échange
`client_id` + `client_secret` contre un jeton d'accès **valable 24 h**, mis en cache
et rafraîchi. Pas de redirect interactif, pas d'hébergement.

> ⚠️ **Contrainte forte du client credentials** : il ne fonctionne que si **l'app et
> la boutique sont dans la même organisation Shopify**. Pour une boutique hors-org,
> il faut passer par l'authorization code grant (non implémenté ici).

---

## 2. Ce que le backend attend

| Élément                    | Où                           | Valeur                                  |
| -------------------------- | ---------------------------- | --------------------------------------- |
| `client_id` d'app          | env `SHOPIFY_CLIENT_ID`      | secret, jamais en base                  |
| `client_secret` d'app      | env `SHOPIFY_CLIENT_SECRET`  | secret, jamais en base                  |
| Domaine boutique           | réglages en base (écran PIM) | `xxx.myshopify.com` **permanent**       |
| Version d'API              | réglages en base             | défaut `2026-07`                        |
| Jeton legacy (alternative) | env `SHOPIFY_ADMIN_TOKEN`    | seulement si legacy custom app pré-2026 |

Le cœur est le **`ShopifyTokenProvider`**
([`token-provider.ts`](../../packages/shopify-admin/src/index.ts)) :

1. si `SHOPIFY_ADMIN_TOKEN` est présent → rendu tel quel (aucun échange) ;
2. sinon `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` → **échange client credentials**
   `POST https://{shop}/admin/oauth/access_token`, jeton caché 24 h, rafraîchi avant
   expiration, ré-échangé si la boutique change.

Le provider lit ses identifiants via un **port étroit** `ShopifyCredentialsSource`
(aliasé sur `AppConfig` dans le module) — testable sans toucher `process.env`.

Le `mode` de l'intégration (`live` / `dry-run`) passe à **`live`** dès qu'un moyen
d'auth **et** l'activation sont présents ; sinon tout tourne sur un miroir simulé.

---

## 3. Runbook — les étapes qui ont marché

### 3.1 Créer l'app dans le Dev Dashboard

- `dev.shopify.com` → **Apps** → créer une app.

### 3.2 Config d'URL (inerte pour notre flux, mais demandée)

- **URL de l'application** : une https quelconque qu'on contrôle (**pas**
  `https://example.com`). Jamais appelée par le client credentials grant.
- **Intégrer l'app dans l'admin Shopify** : **décoché** (aucune UI embarquée).
- **URL des préférences** : vide.
- Tout ceci est **modifiable après coup**, sans rien casser.

### 3.3 Déclarer les scopes (Admin API access scopes)

**Scopes réellement accordés à l'install** (read **et** write) :

- ✅ `read_products`, `write_products` — pousser produits & déclinaisons.
- ✅ `read_publications`, `write_publications` — publier sur les canaux de vente.

Pas encore accordés (à ajouter plus tard **avec ré-install**, cf. §4) :

- `read_collections`, `write_collections` — nécessaires quand on branchera les
  collections de TVA / catégories.

> Les commandes (`read_orders`) et l'historique complet (`read_all_orders`)
> demandent en plus l'accès **protected customer data** — non activé, et de toute
> façon les commandes n'ont pas leur place dans le PIM (contexte commerce séparé).

### 3.4 Publier une version

- Une app du Dev Dashboard **ne s'installe pas tant qu'elle n'a pas au moins une
  version publiée** (onglet **Versions**). Étape bloquante si oubliée.

### 3.5 Récupérer les identifiants → `.env`

- App → **Settings / API credentials** → copier **Client ID** + **Client secret**.
- Les coller dans `apps/lfd-api/.env` (valeurs brutes, **sans guillemets ni
  espaces**), en laissant `SHOPIFY_ADMIN_TOKEN` vide :

  ```dotenv
  SHOPIFY_ADMIN_TOKEN=
  SHOPIFY_CLIENT_ID=<client_id>
  SHOPIFY_CLIENT_SECRET=<client_secret>
  ```

- **Redémarrer le backend** : `AppConfig` lit l'environnement **une seule fois au
  boot**.

### 3.6 Installer l'app sur la boutique

- Bouton **« Installer l'application »** → choisir sa boutique → **Shopify vérifie
  l'app**, puis l'installe (écran de consentement des scopes le cas échéant).
- **Indispensable** : sans install, l'échange renvoie `400 app_not_installed`
  (cf. §4).
- Après install, si le dashboard **n'affiche aucun jeton** (comportement Dev
  Dashboard) → normal : on reste sur le client credentials, rien de plus à coller.

### 3.7 Renseigner le domaine + activer, côté PIM

- Écran **Réglages** du PIM → **Domaine de la boutique** = le `.myshopify.com`
  **permanent** (ex. `1kkhae-8q.myshopify.com`), **sans** `https://` ni slash.
  - Le trouver : URL de l'admin `admin.shopify.com/store/<handle>` →
    `<handle>.myshopify.com`, ou **Paramètres → Domaines** (domaine permanent).
  - **Ne pas** utiliser un domaine public (`lafoliecoffee.fr`) : l'API Admin ne
    répond que sur le `.myshopify.com`.
- **Activer** l'intégration.
- Cliquer **Vérifier la connexion** → déclenche le 1ᵉʳ échange de jeton + un vrai
  `query { shop { name } }`. Succès attendu : **« Connecté à … »** en vert.

---

## 4. Pièges rencontrés (et comment on les a vus)

- **`400 app_not_installed`** — l'app existait mais n'était pas installée sur la
  boutique. Fix : §3.6. C'est la cause n°1 d'un 400 sur le grant.
- **Le message d'erreur était aveugle** — le code ne remontait que le statut HTTP.
  Corrigé : `exchange()` lit désormais le corps de la réponse et affiche le motif
  Shopify (`error` / `error_description`, ou le `<title>` HTML d'erreur). C'est ce
  détail qui a révélé `app_not_installed`.
- **Boutique hors organisation** — si la boutique n'apparaît pas sous **Stores** de
  l'org du dev, le client credentials est **impossible** dessus. Alternative : une
  **development store** (naît dans l'org, gratuite) pour valider, puis authorization
  code grant pour une vraie boutique hors-org.
- **Scopes figés à l'install** — les droits accordés sont ceux **au moment de
  l'install**. Ajouter un scope (`read_orders`, `write_collections`…) impose de
  **ré-installer / ré-autoriser** pour que le prochain jeton les porte.

---

## 5. Référence env

```dotenv
# Chemin A — legacy custom app (créée avant 2026-01-01) : jeton statique seul.
SHOPIFY_ADMIN_TOKEN=

# Chemin B — app Dev Dashboard : les DEUX, token vide. Échange client credentials.
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
```

`.env` est gitignoré ; `.env.example` versionné documente ces clés.

---

## 6. Ce qui reste (non fait)

- **Copie du front** : l'écran d'intégration parle encore de « jeton
  `SHOPIFY_ADMIN_TOKEN` » / libellé « Jeton Admin ». Sous le chemin B, le mental
  model est « identifiants d'app ». Le contrat (`hasToken`) est stable ; seule la
  **copie** est à rafraîchir.
- **Axe des collections** : le module `collections/` est spécialisé `tva-*`.
  L'étendre aux **catégories → collections Shopify** est un chantier à part
  (Slice 2/4 de la migration).
- **Vraie boutique de prod** : la connexion validée l'est sur une boutique de test.
  Pour une boutique de prod hors-org, prévoir l'authorization code grant.
