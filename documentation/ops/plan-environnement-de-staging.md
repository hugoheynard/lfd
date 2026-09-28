# Plan — l'environnement de staging

> Nommé **staging** par Hugo le 2026-09-28 (d'abord écrit « recette »).

**Statut** : 📝 **doc-first**, 2026-09-28. Rien n'est bâti. ⚠️ **Contredit par
`vitruve` le même jour : 6 BLOQUANT, 9 SÉRIEUX** — le §6 l'emporte sur ce qui
précède, notamment sur R1 (le tenant Auth0 devient séparé). À contredire par
`vitruve` avant Hugo : il déplace des frontières de sécurité (identité, e-mails,
copie de données de production) et finira dans un runbook.

## 0. La demande

> « on va avoir une période de test beta avec le staff de l'application,
> simuler des commandes etc. et je ne veux pas polluer ma base […] certaines
> fonctionnalités sont déjà en prod, acquisition commerciale, inscription, ça
> sert déjà » — Hugo, 2026-09-28.
>
> « si je veux recopier une partie de la data du back-office ? comme le PIM ? »
> — « je pense qu'on peut recopier les comptes staff aussi pour avoir une
> base ».

## 1. L'existant (ouvert le 2026-09-28)

- **Un seul environnement.** Les quatre workflows `deploy_*.yml` se
  déclenchent sur `main` seulement (`deploy_lfd_api.yml:22-26`). Aucun
  `staging`, `staging` ou `preview` dans `.github/workflows` ni dans les
  `wrangler`.
- **Tout ce qui dépend de l'environnement est injecté**, rien n'est compilé
  en dur, sauf des replis (`DEFAULT_FROM_ADDRESS`,
  `DEFAULT_BOOTSTRAP_ADMIN_EMAIL`, connexions Auth0 par défaut) que la config
  de staging surcharge, et le `NAMESPACE` des claims Auth0
  (`auth0-claims.ts:31`), propriété du tenant. L'inventaire complet des clés,
  secrets et variables est dans
  [`secrets-et-variables.md`](secrets-et-variables.md) ; ce plan ne le recopie
  pas.
- **Aucune garde sur les destinataires d'e-mails** : `platform/mailer/` n'a ni
  liste blanche ni redirection. Un staging qui enverrait avec la config
  actuelle écrirait aux adresses qu'on y saisit, quelles qu'elles soient.
- **Un outil de clone existe** : `prisma/clone-dev.ts` (`pnpm db:dev:clone`)
  copie **toutes** les tables d'une source vers une cible, par PrismaClient,
  et **purge** la cible. Sa cible est refusée si elle n'est pas locale
  (`refuseNonLocalTarget`, liste blanche d'hôtes). Il copie donc aussi les
  clients, les commandes et les données personnelles : il ne sert pas tel quel.
- **Cinq crons** (`container/worker.ts`) : maintien à chaud, recalcul du
  cockpit, balayage des médias, nuit de la fidélité, rappels de règlement.
  Le dernier envoie des e-mails.
- **Deux webhooks entrants** : Stripe et Resend. Leur URL est déclarée **chez
  le prestataire** : c'est là, pas dans le code, que le staging se sépare.

## 2. Ce qu'on bâtit, en une phrase

Une **seconde copie** de la plateforme — API, passerelle, boutique,
back-office — déployée depuis `dev` sur ses propres sous-domaines, avec sa
**propre base**, ses propres clés, Stripe **en mode test**, des e-mails qui ne
peuvent partir **que vers une liste blanche**, et un référentiel recopié de la
production **dans un seul sens**.

## 3. Les décisions

### R1 — Identité : même tenant Auth0, applications et audiences propres

- Le **même tenant**, parce que le staff recopié (R6) doit se connecter avec
  son compte habituel : son `sub` est la clé de l'annuaire.
- **Deux applications SPA neuves** (boutique et back-office de staging), avec
  leurs URLs de retour, et **deux audiences neuves**. Un jeton émis pour la
  production n'est donc jamais accepté par le staging, ni l'inverse.
- **La connexion staff est partagée** (`lfc-staff`) : c'est ce qui rend la
  copie du staff utile.
- 🔴 **La connexion clients n'est PAS partagée** : une connexion
  `lfc-staging-customers` propre. Sinon, les faux clients de la beta
  s'inscriraient dans la même base d'utilisateurs que les vrais — une
  pollution de la production par la porte d'Auth0, que la base séparée ne
  verrait pas.
- Un M2M propre, limité à la connexion clients de staging.

### R2 — Les e-mails : une liste blanche, imposée par le code

La garde manque aujourd'hui (§1) : elle est **à bâtir avant toute beta**.

- Une variable `MAILER_RECIPIENT_ALLOWLIST` (domaines et adresses). **Présente
  = mode staging** : tout destinataire hors liste est **refusé et journalisé**,
  jamais envoyé. Absente = production, comportement inchangé.
- Le refus est **dans l'adaptateur Resend**, le seul chemin sortant — pas dans
  chaque handler.
- ⚠️ Le sens de la valeur par défaut est le point à contredire : une variable
  oubliée en staging laisserait tout partir. D'où R2 bis.

**R2 bis — le staging se déclare.** Une variable `DEPLOYMENT_ENV` (`production`
| `staging`), **obligatoire**, lue par `AppConfig`, refusée au démarrage si
absente. En `staging`, `MAILER_RECIPIENT_ALLOWLIST` devient **obligatoire** et
non vide, sinon l'API ne démarre pas. En `production`, elle est **interdite**.
Un staging mal configurée ne démarre pas ; elle n'envoie pas en silence.

### R3 — Stripe : le mode test, de bout en bout

Clés `sk_test_…`/`pk_test_…` et un webhook de test pointant la passerelle de
staging. En `staging`, `AppConfig` **refuse** une clé qui ne commence pas par
`sk_test_` (R2 bis) : aucune carte réelle ne peut être débitée depuis la beta.

### R4 — Le reste de l'infrastructure, en propre

| Élément                | Staging                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| Base                   | une base Postgres neuve, migrée par `migrate deploy`                     |
| R2                     | quatre buckets neufs, jetons limités à chacun                            |
| Resend                 | une clé et un webhook propres ; même domaine expéditeur, préfixe visible |
| VAPID                  | une paire neuve                                                          |
| `FIELD_ENCRYPTION_KEY` | une clé neuve                                                            |
| `RECOMPUTE_TOKEN`      | un jeton neuf                                                            |
| Cloudflare             | `lfd-api-staging`, `lfd-gateway-staging`, deux projets de front          |
| Domaines               | `beta.…`, `beta-admin.…`, `beta-media.…` — `noindex`                     |

Les crons restent actifs en staging : la nuit de la fidélité et les rappels de
règlement font partie de ce que la beta éprouve, et R2 tient leurs e-mails.

### R5 — Le déploiement : `dev` → staging, `main` → production

- Les quatre workflows gagnent un déclencheur `push: dev`, qui déploie vers la
  staging avec les secrets d'un **environnement GitHub** `staging` (les
  secrets de production restent dans l'environnement `production`, avec sa
  protection).
- La migration Prisma tourne **d'abord en staging** : chaque migration est
  répétée sur une base vivante avant la production. C'est un gain de sûreté
  qui vaut à lui seul une partie du coût.
- Le filtre de chemins existant s'applique à l'identique.

### R6 — La copie depuis la production : une liste blanche de tables

**Sens unique**, production → staging. La production n'est que **lue**.

- **Liste blanche**, jamais liste noire : une table ajoutée demain au schéma
  n'est **pas** copiée tant qu'on ne l'a pas inscrite. Les clients et les
  commandes restent dehors par construction.
- **Copié** :
  - le référentiel : tout le schéma `pim` ;
  - la médiathèque (tables) **et** les objets du bucket média, sans quoi les
    fiches pointent vers des images absentes ;
  - les réglages de vente : points de retrait, zones de livraison, tarifs et
    mercuriales, heures limites, réglage de la fidélité, projection du
    catalogue ;
  - le **staff** (demande de Hugo) : annuaire, rôles, dérogations, droits.
- **Jamais copié** : sociétés, clients, adresses, commandes, factures, KBIS,
  IBAN, fidélité (livre et bons), acquisition, inscriptions, journal, cockpit ;
  côté staff, les **invitations en attente** (elles enverraient un lien vers
  la beta) et les **abonnements push** (ils feraient sonner des téléphones
  pour des commandes fictives).
- **L'outil** : un dérivé de `clone-dev.ts`, `clone-staging.ts`, qui ne lit
  que la liste blanche. Sa cible est refusée si elle n'est pas **l'hôte de
  staging déclaré** (liste blanche d'un hôte, comme `refuseNonLocalTarget`) ;
  il refuse aussi une source qui n'est pas la production déclarée, pour ne
  pas recopier le staging sur elle-même. Il purge ses tables de la liste
  blanche seulement.
- **Qui le lance** : Hugo, comme toute lecture de production. L'URL de
  production ne traverse aucune ligne de commande : elle se lit d'un fichier
  d'environnement local, non versionné.
- **Rejouable** : relancer la copie rafraîchit le référentiel ; les commandes
  de beta, elles, restent (tables hors liste).

⚠️ Correction de ce qui a été dit à Hugo le 2026-09-28 : une copie **par le
bus** (comme `seed:pim`) avait été proposée. Pour une copie depuis la
production, la copie des tables est plus juste : la source a déjà été validée
par les handlers, et le bus ne sait pas rejouer le staff ni les réglages. Le
bus reste pour le **semis** local, qui fabrique.

⚠️ Une copie de tables traverse des clés étrangères : une table copiée qui
pointe une table exclue (une fiche vers un auteur client ?) doit être relevée
avant de bâtir. C'est l'étape 1 du lot R-C.

### R7 — On sait toujours où l'on est

- Un **bandeau « STAGING — données fictives »** sur les deux fronts, lu depuis
  la config de build, impossible à retirer par l'écran.
- Le préfixe `[STAGING]` au sujet de chaque e-mail.
- `noindex` sur les domaines de staging.

## 4. Les lots

| Lot | Contenu                                                                                                                                               | Qui         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| R-A | `DEPLOYMENT_ENV`, la liste blanche des e-mails, le refus de la clé Stripe non test, le préfixe mail, le bandeau des fronts. Tests.                    | code        |
| R-B | Les comptes : base, Auth0 (2 SPA, 2 audiences, 1 connexion clients, 1 M2M), R2, Resend, Stripe test, VAPID, domaines, environnement GitHub `staging`. | Hugo, guidé |
| R-C | `clone-staging.ts` : l'inventaire des clés étrangères, la liste blanche, les gardes de source et de cible, les objets média.                          | code        |
| R-D | Les workflows : déclencheur `dev`, environnement GitHub, migration en staging d'abord.                                                                | code        |
| R-E | Le runbook : créer, rafraîchir, remettre à zéro le staging.                                                                                           | doc         |

R-A et R-C ne dépendent de rien et se bâtissent d'abord. R-B est manuel.
R-D attend R-B.

## 5. Questions ouvertes

1. Les sous-domaines exacts.
2. Le coût d'une seconde base et d'un second conteneur, à lire sur les
   factures en cours.
3. La liste blanche des e-mails : le domaine du staff seulement, ou quelques
   adresses de testeurs extérieurs ?

## 6. Ce que la contradiction a changé (2026-09-28)

**Bloquants**

- **B1 + B2 — le même tenant Auth0 laissait le staging écrire sur les
  identités de production.** Avec `lfc-staff` partagé et le même `sub`,
  corriger l'adresse d'un staff en staging la changeait en production
  (`update-staff-user.handler.ts:70` → PATCH Auth0), un lien de mot de passe
  posé en staging devenait celui de la production, et un M2M ne peut **pas**
  être limité à une connexion : ses droits valent pour tout le tenant.
  **R1 est remplacé : un tenant Auth0 propre au staging** (validé par Hugo le
  2026-09-28), avec ses deux
  applications, ses deux audiences, ses deux connexions et son M2M. Aucun
  geste fait en staging ne peut atteindre une identité de production, et
  les e-mails qu'Auth0 envoie lui-même (vérification, mot de passe oublié)
  partent du tenant de staging.
  **Conséquence sur R6 (le staff recopié)** : le `sub` ne se recopie plus. On
  copie la **structure** — personnes, rôles, dérogations, droits — sans
  identité ; chaque staff reçoit ensuite une **invitation du tenant de
  staging**, à son adresse (dans la liste blanche), et se lie à sa fiche
  recopiée en l'acceptant. `StaffSubjectAlias` n'est pas copiée. Un staff
  `pending` en production est copié `pending`, sans invitation : il en reçoit
  une neuve avec les autres.
- **B3 — Resend n'est pas le seul chemin sortant.** Auth0 envoie ses propres
  e-mails (réglé par B1 : tenant propre, et son fournisseur d'e-mails de
  staging n'écrit qu'au staff invité). Le push web est **voulu** en staging,
  pour un staff qui s'y abonne. La garde s'insère dans
  `packages/mailer/src/resend-mailer.ts` (construit par `create-mailer.ts`),
  pas dans `platform/mailer/` : ses tests tournent à la racine.
- **B4 — une garde par hôte ne distingue pas le staging de la production**,
  toutes deux chez Prisma Postgres (`db.prisma.io`). Et l'outil purge sa
  cible. **La base se déclare elle-même** : une table `ops.deployment_marker`
  à une ligne (`production` ou `staging`), écrite une fois à la création de
  chaque base. `clone-staging.ts` **refuse** une cible dont le marqueur n'est
  pas `staging`, et une source dont le marqueur n'est pas `production`. Plus
  aucune URL ne décide seule. Pas de repli `DATABASE_LFD_URL` hérité de
  `clone-dev.ts:40`, pas de `dotenv`.
- **B5 — les origines CORS sont écrites en dur** (`packages/endpoints/src/index.ts:133-160`,
  lues par `main.ts` et `gateway/src/routes.ts`), et la passerelle fixe son
  nom, sa route de zone et son binding (`gateway/wrangler.toml:35,91-93,115-117`).
  §1 avait tort de dire « rien n'est compilé en dur ». **Nouveau lot R-A2** :
  les origines deviennent une donnée d'environnement, et la passerelle gagne
  une section `[env.staging]` (nom, routes, binding vers `lfd-api-staging`).
- **B6 — les workflows partagent leur groupe `concurrency`**
  (`deploy_lfd_api.yml:32-38`) : un push sur `dev` pourrait évincer un
  déploiement de production en attente. Le groupe est **suffixé par
  environnement**.

**Sérieux**

- **Les tarifs négociés ne se copient pas.** `company_mercuriales`,
  `volume_commitments` et les `price_rules` d'audience `company` portent des
  prix de vrais clients (`pricing.prisma:32-34,289-298,442-449`). Seules les
  règles d'audience publique ou générale sont copiées.
- **L'URL de production suit la convention existante**
  (`secrets-et-variables.md:157-162`) : jamais dans un `.env`, lue d'une seule
  variable dédiée, `LFD_PRODUCTION_DATABASE_URL`, posée dans le terminal depuis
  le gestionnaire de mots de passe.
- **« La migration en staging d'abord » n'est plus une promesse.** Une
  migration encore amendée sur `dev` changerait sa somme de contrôle et
  bloquerait le staging. Le staging **se remet à zéro par script** (autorisé
  là, et le marqueur l'y borne), et `main` n'attend pas le staging : c'est un
  bénéfice de fait, pas une garde.
- **Les workflows `ops_*`** (sondes d'identité, parité du catalogue, journaux)
  entrent dans le lot R-D, avec leurs secrets de staging.
- **Des environnements GitHub séparés pour les `vars` aussi** :
  `SENTRY_DSN`, `BOOTSTRAP_ADMIN_EMAIL`, `CLIENT_BASE_URL`, `ADMIN_BASE_URL`,
  et les `B2B_ADMIN_AUTH0_*` des fronts, lus à la compilation. Sinon les
  erreurs arrivent dans le Sentry de production et les liens des e-mails et
  QR pointent vers la production.
- **Le périmètre des schémas** : `pim` et `media` copiés (liste blanche) ;
  `public` seulement pour les réglages et le staff listés ; `growth`, `ops`
  (hors marqueur), `production` et `handover` **jamais**.
- **Les crons en staging** : les cinq sont repris, sauf le maintien à chaud
  `*/5`, qui coûte et ne sert qu'à la latence de production.
- **L'URL publique du bucket média** (`env-readers.ts:233`) est surchargée en
  staging, sinon les fiches copiées pointeraient les images de production.

**Non vérifié par `vitruve`, à ouvrir au lot R-C** : les clés étrangères de
`pim` et `media` vers `public` (auteurs, porteurs) ; les Actions du tenant
Auth0 ; la CSP et le domaine des cookies ; la destination du journal `ops`.

**Les lots deviennent** : R-A (gardes : `DEPLOYMENT_ENV`, e-mails, Stripe,
bandeau), **R-A2 (CORS et passerelle par environnement)**, R-B (comptes, dont
un tenant Auth0 neuf), R-C (copie gardée par marqueur, staff sans identité,
invitations), R-D (workflows, `concurrency`, `ops_*`, environnements GitHub),
R-E (runbook, dont la remise à zéro).
