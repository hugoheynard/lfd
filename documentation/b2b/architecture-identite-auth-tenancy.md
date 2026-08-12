# Identité · Auth · Tenancy (B2B commerce + back-office)

Décisions figées avant d'écrire le schéma. Contexte : LaFolieDouce B2B, ~20 users
(peak < 200), Auth0 pour l'auth, Postgres + Prisma, Cloudflare (statique + Workers).

> **Config concrète du tenant Auth0** (réglages exacts du dashboard, valeurs,
> pièges rencontrés) : [`auth0-setup-b2b.md`](auth0-setup-b2b.md) — runbook daté.
>
> **Onboarding & provisioning** (comment un client entre : self-signup + porte
> commerciale, états, activation) : [`architecture-compte-client-cycle-de-vie.md`](architecture-compte-client-cycle-de-vie.md).

## 1. Principe de frontière

- **Auth0 = authentification** (mots de passe, MFA, social, reset). **On ne stocke
  AUCUN credential** dans notre db. Pas de table `credentials`.
- **Notre db = identité + autorisation + données.** Une identité y est keyée par le
  **`auth0_sub`** (id stable du JWT). L'email est stocké **en plus** (clé humaine +
  clé de secours pour une future migration d'IdP).

## 2. Séparation staff / client = frontière de contexte (db séparées)

Deux **bounded contexts** → **deux db distinctes**, chacune avec son propre `User` :

- **DB admin / back-office** — les différents back-offices (PIM, B2B, prod) **fusionnés
  en un seul** back-office ; sa db héberge le **staff**. Ici `User` = **membre interne**
  (équipe, labo, admin). Non tenant-scoped (voit à travers les tenants, selon rôle).
  Privilégié.
- **DB B2B commerce** — bloc commerce ; ici `User` = **customer** (client pro).
  Tenant-scoped par `company_id`. Provisionné par un commercial.
- **DB PIM catalog** — existe déjà.

Comme ce sont des **db/schemas séparés**, les deux tables peuvent s'appeler `User`
sans collision : **le contexte désambigüise** (admin `User` = staff ; B2B `User` =
customer).

**Pourquoi séparer physiquement (et pas un flag `type` dans une table unique) :**

1. **Blast radius** — les identités staff privilégiées sont **physiquement isolées**
   des données clients ; escalade de privilège structurellement impossible.
2. **Formes différentes** — client = company_id/adresses/facturation/commandes ;
   staff = rôle interne, MFA, pas de tenancy.
3. **Politiques différentes** — RLS/tenancy sur les clients, aucune sur le staff ;
   MFA obligatoire staff ; provisioning différent.
4. **Découpe logicielle** — la séparation **découle de la frontière de contexte**
   (back-office interne vs commerce), pas d'une optimisation.

**Le back-office unifié est une app** qui possède sa **DB admin** (identité staff +
rôles + audit) et **lit/écrit les db métier** (commerce, PIM) via des clients Prisma
distincts. App unique, plusieurs db.

## 3. Tables (esquisse)

**DB admin / back-office** (`schema.prisma` dédié) :

```
User           -- = membre interne (staff)
  id · auth0_sub (unique) · email · role interne · status · timestamps
Role / Permission   -- rôles internes (PIM / commandes / prod), à affiner
AuditLog       -- qui a fait quoi (obligatoire pour du privilégié)
```

**DB B2B commerce** (`schema.prisma` dédié) :

```
Company        -- le tenant (établissement client pro)
  id · raison sociale · SIRET · contact pro · représentant? · timestamps
User           -- = customer (client pro), tenant-scoped
  id · auth0_sub (unique) · email · company_id (FK) · role client
     · status (INVITED|ACTIVE|DISABLED) · invited_by · timestamps
-- + Address, BillingProfile, Order, OrderLine, ProductionPlan (à venir)
```

Garde-fou : un même `auth0_sub`/email ne doit exister **ni** dans la db admin **ni**
dans la db commerce en double (pas de double-rôle chez nous : personne n'est à la
fois boulanger interne et client pro). La connexion Auth0 d'origine (staff vs
client) indique dans **quelle db** résoudre l'identité.

## 4. Provisioning d'un client par un commercial

Le client ne s'auto-inscrit pas. Flux (option retenue : création via Management API) :

```
1. Commercial : choisit/crée la Company + saisit email + rôle du client
2. Back → Auth0 Management API : create user → Auth0 renvoie le `sub`
3. Écrit User (db commerce) { auth0_sub, email, company_id, role,
                              status: INVITED, invited_by }
4. Auth0 envoie une invitation (définir mot de passe / magic link)
5. Client pose son mot de passe → status: ACTIVE
6. 1ʳᵉ connexion : le `sub` du token = déjà stocké → mapping certain
```

`company_id` + `role` sont **notre** donnée d'autorisation. Auth0 prouve juste « ce
`sub` possède cet email ». Company d'abord, User ensuite.

## 5. Tenancy Postgres

- **Row-level** : chaque table possédée par un client porte `company_id`. On filtre
  **toujours** par le `company_id` du token (le « mur », version allégée de SH3PHERD).
- **Staff = non muré** (voit tout, selon rôle).
- **Renfort optionnel** : Postgres **RLS** pour bloquer l'isolation au niveau db
  (utile si des Workers requêtent en direct). Pas obligatoire au départ.
- Le **JWT porte la tenancy** : via une **Auth0 Action** (custom claims), le token
  porte `company_id`, `type` (staff|customer), `role`. Chaque requête est
  scoping-ready.

## 6. Back-office admin (privilégié) — 2 portes + pas de backdoor

- **Porte 1 — Cloudflare Access** devant l'app admin : elle n'est **pas joignable**
  publiquement, un mur SSO/OTP passe **avant** le chargement. Gratuit ≤ 50 users.
- **Porte 2 — Auth0** avec **connexion staff durcie** : **MFA obligatoire** +
  **allowlist** de nos emails. Même tenant Auth0, connexion différente.
- **Sessions courtes** admin + **audit log** (qui a fait quoi).
- **PAS de break-glass backdoor** (compte local qui bypass Auth0) : backdoor
  permanent ultra-privilégié = blast radius pire qu'une panne Auth0 rare. **Escape
  d'urgence = `psql` direct**, pas un backdoor.

## 7. Résilience (« et si Auth0 plante ? »)

- **Panne temporaire** : le JWT est validé **en local** (JWKS caché) → les sessions
  en cours **survivent** ; seuls les **nouveaux** logins sont bloqués. Les données ne
  dépendent pas d'Auth0.
- **Mitigations** : cacher le JWKS, TTL raisonnable + refresh tokens.
- **Lock-in / migration d'IdP** : Auth0 = **OIDC standard** (remplaçable par Cognito,
  Clerk, Zitadel…). Dérisque avec : **email vérifié stocké** (clé de re-mapping),
  **`AuthService` abstrait** (swap d'IdP = une couche), **exports réguliers** des
  users (Management API). Seul point dur = les mots de passe (export bridé) → **lazy
  migration** (reset sur le nouvel IdP). Les données métier ne bougent jamais.
- **Pas de self-host** de l'auth : ça réintroduirait un serveur always-on **et** la
  responsabilité de la sécurité des mots de passe (ce qu'on veut externaliser).

## 8. Modèle d'exécution

Aucune brique always-on ici non plus : l'admin et l'auth réveillent des Workers sur
requête. Voir [`architecture-flux-commande-prod.md`](./architecture-flux-commande-prod.md).
