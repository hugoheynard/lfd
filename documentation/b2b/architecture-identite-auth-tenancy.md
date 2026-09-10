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

## 2. Séparation staff / client = frontière de contexte

> 🔴 **CE PARAGRAPHE A DÉCRIT DEUX BASES JUSQU'AU 2026-09-10, ET C'ÉTAIT FAUX
> DEPUIS B4.** Il y a **une seule base**, **une seule URL**, **un seul client
> Prisma**. Le référentiel produit avait la sienne ; il l'a rejointe, et le staff
> n'en a jamais eu une à lui.
>
> Ce qui existe à la place : **cinq schémas Postgres dans une base** —
> `public`, `growth`, `ops`, `pim`, `production` — déclarés par le `datasource`
> de [`prisma/schema/datasource.prisma`](../../apps/lfd-api/prisma/schema/datasource.prisma).
> Les tables du staff sont dans `public`, avec le commerce
> ([`public/staff.prisma`](../../apps/lfd-api/prisma/schema/public/staff.prisma)).
>
> Le texte d'origine est conservé plus bas parce que son RAISONNEMENT reste
> juste — la frontière est réelle, et pour les raisons qu'il donne. Seul son
> mécanisme a changé : elle n'est plus tenue par la physique.

Deux **bounded contexts**, chacun avec son propre modèle d'identité :

- **Le staff / back-office** — les back-offices (PIM, B2B, prod) **fusionnés en un
  seul**. L'identité s'appelle **`StaffUser`**, et non `User` : le nom a été
  désambigüisé dans le code le jour où la séparation physique a disparu. Non
  tenant-scoped (voit à travers les tenants, selon rôle). Privilégié.
- **Le commerce B2B** — ici `User` = **customer** (client pro), tenant-scoped par
  `company_id`.
- **Le référentiel produit (PIM)** — schéma `pim` de la même base.

⚠️ **Les deux tables ne peuvent PLUS s'appeler `User`.** L'ancienne rédaction s'en
remettait au contexte pour désambigüiser (« admin `User` = staff ; B2B
`User` = customer ») : c'est ce que permettaient deux bases. Dans un schéma
partagé, il a fallu trancher — `StaffUser` et `User`.

**Pourquoi la frontière existe** (le raisonnement d'origine, toujours valable) :

1. **Blast radius** — les identités staff privilégiées sont isolées des données
   clients.
2. **Formes différentes** — client = company_id/adresses/facturation/commandes ;
   staff = rôle interne, MFA, pas de tenancy.
3. **Politiques différentes** — tenancy sur les clients, aucune sur le staff ;
   MFA obligatoire staff ; provisioning différent.
4. **Découpe logicielle** — la séparation **découle de la frontière de contexte**
   (back-office interne vs commerce), pas d'une optimisation.

🔴 **Mais le point 1 ne dit plus « physiquement ».** Une jointure entre le staff et
le commerce **marcherait** : même base, même client Prisma. L'isolation est tenue
par la **discipline**, et une discipline se perd là où une impossibilité tenait
toute seule. C'est pourquoi elle est adossée à des portes CI plutôt qu'à une
promesse — `lint:context-boundaries`, `lint:cross-schema-join`,
`lint:prisma-model-ownership` — et pourquoi le CLAUDE.md racine (§1) note que
deux franchissements ont déjà eu lieu, en SQL direct, sans qu'aucun import ne les
trahisse.

**Le back-office unifié est une app** qui lit et écrit les tables métier via **un
seul** client Prisma. App unique, base unique, cinq schémas.

## 3. Tables

**Le staff** ([`public/staff.prisma`](../../apps/lfd-api/prisma/schema/public/staff.prisma)) :

```
StaffUser                 -- le membre interne
  id · auth0_id (unique, NULLABLE) · email (unique) · first_name · last_name
     · phone · job_title · role (StaffRole) · status (StaffStatus)
     · invited_at · timestamps
StaffRoleDefinition       -- ce que chaque rôle ouvre
StaffPermissionOverride   -- les dérogations, personne par personne
StaffNotification · StaffPushSubscription
```

⚠️ **`auth0_id` est NULLABLE**, et ce n'est pas un relâchement : une fiche existe
dans l'annuaire **avant** la première connexion (elle est invitée). C'est
l'**e-mail** qui fait le premier rapprochement, puis le `sub` qui relie pour de
bon.

⚠️ **Il n'y a pas de table `AuditLog`.** L'esquisse en promettait une ; le journal
qui existe est **`ActivityEvent`**, dans le schéma `growth`
([`growth.prisma`](../../apps/lfd-api/prisma/schema/growth.prisma)) — il porte
`actor_type` / `actor_id` / `actor_name` / `actor_role`, donc il couvre bien
« qui a fait quoi », mais il est commun au staff et aux clients.

**Le commerce** ([`public/account.prisma`](../../apps/lfd-api/prisma/schema/public/account.prisma)) :

```
Company        -- le tenant (établissement client pro)
User           -- = customer, avec auth0_sub (unique) et email_verified
Membership     -- le RATTACHEMENT d'une personne à une société (0..N)
Address · CompanyContact
```

🔴 **Une personne n'a pas de `company_id`.** L'esquisse posait `company_id (FK)`
sur `User` : c'est faux, et l'écart n'est pas cosmétique. Le rattachement passe
par **`Membership`**, une personne peut appartenir à **plusieurs** sociétés, et
c'est toute la raison d'être de `resolveCompany`
([`resolve-company.ts`](../../apps/lfd-api/src/platform/auth/resolve-company.ts)) —
qui refuse de deviner quand il y en a plusieurs.

Garde-fou : un même `auth0_sub`/email ne doit exister ni côté staff ni côté
commerce en double (pas de double-rôle : personne n'est à la fois boulanger
interne et client pro). ⚠️ **Aucune contrainte de base ne le tient** — les deux
colonnes sont dans deux tables, chacune `@unique` chez elle. C'est la connexion
Auth0 d'origine (staff vs client), donc l'**audience** du jeton, qui décide où
résoudre l'identité — cf. §6.

## 4. Provisioning d'un client par un commercial

⚠️ **« Le client ne s'auto-inscrit pas » n'est plus vrai**, et l'en-tête de ce
document le dit déjà en renvoyant à « self-signup + porte commerciale ». Une
société déclarée par le client depuis « Mes entreprises » entre en statut
`pending` (cf. l'énumération `CompanyStatus`). Le flux ci-dessous décrit la
création PAR UN COMMERCIAL, qui existe toujours et reste l'un des deux chemins ;
l'autre vit dans [`architecture-compte-client-cycle-de-vie.md`](architecture-compte-client-cycle-de-vie.md).
Non réécrit ici : ce document n'est pas celui du cycle de vie.

Flux (création via Management API) :

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
  🔴 **LE JWT NE PORTE PAS LA TENANCY, ET NE DOIT PAS LA PORTER.** Ce paragraphe
  affirmait le contraire — « via une Auth0 Action (custom claims), le token porte
  `company_id`, `type` (staff|customer), `role` ; chaque requête est
  scoping-ready » — et c'est **faux** (vérifié le 2026-09-10 dans
  [`access-token.verifier.ts`](../../apps/lfd-api/src/platform/auth/access-token.verifier.ts)) :
  le jeton n'atteste que le `sub`, les `scopes` et `email_verified`.

C'est la correction la plus importante de ce document, parce que c'est la seule
dont l'application ouvrirait une faille : **la base est autoritaire**. Le
`company_id`, le rôle et le statut sont relus en base à chaque requête, contre
les `Membership` du demandeur. Un compte désactivé est donc bloqué
immédiatement, sans attendre l'expiration du jeton, et **aucun claim forgé ne
peut élargir la portée**.

Quand une personne appartient à plusieurs sociétés, la requête **déclare** dans
laquelle elle travaille (un en-tête), et la déclaration est **vérifiée** contre
ses rattachements — cf. `resolveCompany`. Une société déclarée à laquelle elle
n'appartient pas est ignorée, jamais servie.

## 6. Back-office admin (privilégié) — 2 portes + pas de backdoor

- **Porte 1 — Cloudflare Access** devant l'app admin : elle n'est **pas joignable**
  publiquement, un mur SSO/OTP passe **avant** le chargement. Gratuit ≤ 50 users.
- **Porte 2 — Auth0** avec **connexion staff durcie** : **MFA obligatoire** +
  **allowlist** de nos emails. Même tenant Auth0, connexion différente.
- **Sessions courtes** admin + **journal d'activité** (qui a fait quoi) — c'est
  `ActivityEvent`, pas une table `AuditLog` ; cf. §3.
- **Porte 3, celle qui tient réellement dans le code** : la surface `/admin/*` est
  vérifiée contre une **audience Auth0 distincte** (`AUTH0_ADMIN_AUDIENCE`) de
  celle du client, et elle est **fail-closed** — audience non configurée, aucun
  jeton accepté (vérifié le 2026-09-10 dans
  [`admin-token.verifier.ts`](../../apps/lfd-api/src/platform/auth/admin-token.verifier.ts)).
  Puis un second guard résout le périmètre depuis l'annuaire. Les deux « portes »
  ci-dessus sont de l'infrastructure ; celle-ci est dans le backend.
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
requête. Voir [`architecture-flux-commande-prod.md`](../order/architecture-flux-commande-prod.md).
