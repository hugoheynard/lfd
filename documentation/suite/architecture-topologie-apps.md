# Topologie des apps — ce qui fusionne, ce qui reste séparé

> 📐 **Doc-first.** Rien de ce document n'est codé. Il fixe la règle et l'ordre,
> pour que la question ne se rejoue pas à chaque nouveau sujet.
>
> Écrit le **2026-08-19**, à partir d'une question ouverte : « le PIM, même s'il
> gère Shopify, n'aurait-il pas intérêt à vivre dans le B2B ? »

## La règle, en une ligne

**Le backend se découpe par propriété des données. Le front se découpe par
audience × appareil.**

Les deux axes sont indépendants, et c'est ce qui évite les deux erreurs
symétriques : fusionner des modèles parce que deux écrans se ressemblent, ou
multiplier les déployables parce que deux populations ne se ressemblent pas.

## L'état mesuré, le jour où la question s'est posée

| Fait             | Mesure                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| Backends         | PIM **171** fichiers TS · B2B **866**                                    |
| Bases            | deux Postgres · B2B déjà en `multiSchema` (`public`, `growth`)           |
| Containers       | deux, `instance_type: "basic"` chacun                                    |
| Instances max    | B2B (chemin de vente) **1** · PIM (outil staff) **2**                    |
| Suite            | `SUITE_APPS` = 2 entrées, dont `b2b-admin` en **stub** sans URL          |
| Couture iframe   | **~24** fichiers (`suite/`, `suite-embed`, clients d'embed)              |
| Auth des fronts  | admin ✅ · client ✅ · **PIM ❌** (aucun SDK, jeton relayé par le shell) |
| Annuaire staff   | `StaffUser` (rôle, statut, overrides) **dans le B2B seulement**          |
| Autorisation PIM | **aucune** — `AuthGuard` global : jeton Auth0 valide ⇒ tu entres         |

Deux de ces lignes sont des trous, pas des choix :

- l'outil interne peut doubler ses instances, la **vente** est plafonnée à 1.
  Le commentaire du `wrangler.jsonc` B2B dit « grossir avant de multiplier » — la
  décision a été pensée, le PIM ne l'a jamais suivie ;
- le PIM n'a **que l'audience** comme mur. Quelqu'un passé en `revoked` dans
  l'annuaire staff **garde le PIM** : catalogue, prix canoniques, publication
  Shopify. C'est vrai aujourd'hui, indépendamment de toute fusion.

## Ce que la séparation coûte réellement

Ce n'est pas « deux dépôts à maintenir ». C'est deux couches qui n'existent que
parce que la frontière existe :

- côté **backend** : tout `src/catalog/` du B2B — ingestion, parité, décisions,
  projection de catégories, historique du prix canonique — plus l'identité M2M et
  la latence de propagation qui rend la bascule `C5b` bloquée ;
- côté **front** : les ~24 fichiers de couture, deux bundles Angular + fold, et
  l'impossibilité de faire un lien profond entre sujets. Ce dernier point vient
  de devenir concret : la médiane du marché a amené de la donnée catalogue dans un
  écran de tarification, et le geste suivant — « voir la fiche produit » — est un
  `routerLink` dans une app, un message de bridge entre deux iframes.

## Trois décisions, à trancher séparément

| Décision                                                   | Réversible ?       | Conditionnée à         |
| ---------------------------------------------------------- | ------------------ | ---------------------- |
| **Front** : PIM → arbre de routes de l'admin, shell retiré | oui, un après-midi | rien                   |
| **Backend** : PIM → contexte, une seule image              | **non**            | T1→T3 + les deux gates |
| **Audiences** : trois → une                                | moyen              | le mur staff           |

L'ordre recommandé découle de la réversibilité : **front d'abord**.

## Front — la cible

```
admin      staff bureau, desktop     ← + PIM (catalogue, publication, emplacements)
terrain    fournil / coursiers, tactile   ← le jour où l'appareil change, pas avant
client     clients B2B, public       ← ne fusionne JAMAIS
ops        alerting, téléphone, 3 h du matin
```

`production/` et `retrait/` sont **déjà** des modules de l'admin : le motif est
posé. Un sujet interne arrive comme un arbre de routes ; il se promeut en surface
à part le jour où **l'appareil** ou **la population** change — un boulanger les
mains dans la farine n'est pas un commercial sur un 27".

Fusionner le PIM ne se défait pas quand `terrain` arrive : le PIM, c'est le même
staff, le même appareil, les mêmes données que l'admin.

### Ce que le shell devient

Le shell n'est pas « l'auth partagée » : le login unique vient de la **session
Auth0**, que deux apps du même tenant partagent déjà. Le relais postMessage est le
prix de l'**iframe** — un iframe cross-origin n'obtient plus son jeton en
silence. Concrètement, le shell est aujourd'hui **l'auth du PIM**, seul front sans
SDK.

Survit : le **registre** (`SUITE_APPS` + `requiredPermission` par app) et sa
config d'URLs — deux fichiers, et c'est un lanceur.
Tombe : `AppFrame`, reachability, `SuiteBridge`, le relais de jeton, les clients
d'embed. Un lanceur **navigue**, il n'héberge pas.

Le lanceur redevient utile dès qu'il y a **deux** fronts internes — `ops` ou
`terrain`. Une page avec des tuiles, pas 24 fichiers de bridge.

## Backend — la cible

```
lfd-api      contextes : orders · pricing · catalog(+pim) · account · production · delivery
lfd-worker   MÊME image, rôle `worker` — réconciliation Shopify, exports, snapshots
lfd-ops      À PART, et pas pour une raison de données
```

Une seule image, deux **rôles**. On scale par rôle, jamais par domaine : un worker
n'est pas un contexte, c'est le même code exécuté ailleurs. L'API reste **chaude**
(cron `*/5`) ; le worker dort et se réveille sur un job.

Pas de file aujourd'hui, et pas besoin de Redis : une table `jobs` avec
`SELECT … FOR UPDATE SKIP LOCKED` dans le Postgres existant est une vraie file à
cette échelle. Le cron cesse alors de **faire** le travail : il **pose** un job.

Une seconde image ne se justifie que dans deux cas : la latence de réveil devient
inacceptable, ou le traitement exige une dépendance système que l'API n'a pas
(un binaire, un modèle).

**`lfd-ops` est le seul déployable réellement à part**, parce qu'un observateur ne
peut pas vivre dans ce qu'il observe : si `lfd-api` tombe, l'app qui doit le dire
ne peut pas être dedans. `@lfd/ops-contract` le suppose déjà — `reporter` (push)
et sondes (pull), avec ses données propres.

### Les invariants à poser AVANT de fusionner

Aujourd'hui, ce qui interdit `import { OrderPricing } from '../../pricing'` depuis
le PIM, **c'est le réseau**. On le supprime, on supprime le mur — et en six mois
quelqu'un écrit la jointure `pim.products × public.orders`. Ce jour-là c'est une
god app, quel que soit son nom.

Deux gates, dans l'idiome des gates existantes (`lint:feature-access`,
`lint:guarantees`, `no-direct-env`, `fold-tokens`) :

1. **`lint:context-boundaries`** — un contexte n'importe rien d'un autre, sauf un
   port déclaré ou un package `@lfd/*-contracts` ;
2. **une table appartient à un schéma, et personne ne joint entre schémas** — le
   franchissement passe par un port, comme il passait par HTTP.

Sans ces deux-là, **ne pas fusionner**. C'est le prix d'entrée, pas une option.

Ce qui fait une god app n'est pas la taille : c'est la première jointure
interdite. Et rien n'oblige le déployable à porter un sujet — l'image peut
s'appeler `lfd-api`, un hôte, pendant que les contextes gardent leurs noms.

## Audiences — pourquoi c'est le même projet que le mur staff

Fusionner supprime les trois audiences `suite`/`pim`/`b2b` et leur chorégraphie.
En échange, le mur cesse d'être **infrastructurel** (Auth0 refuse) pour devenir
**applicatif** (ton code refuse). Il faut donc que ce code existe et soit éprouvé.

Or c'est exactement **T1→T7 « Accès staff »** : catalogue de permissions, domaine,
mur backend, socle front. Autrement dit la fusion et le mur staff sont la **même
construction**, et les faire séparément écrirait deux fois le noyau — une fois
pour le B2B, une fois pour le PIM — alors qu'un seul `StaffUser` couvre les deux
surfaces.

Bénéfice qui vient avec : **Réglages → Utilisateurs** devient le point unique où
l'on ouvre et ferme _toutes_ les portes internes. Aujourd'hui elle en ferme une
sur deux.

## L'ordre

Trois choses ont longtemps été confondues dans cette note, et les séparer change
tout :

> **fusionner les processus ≠ fusionner les bases ≠ fusionner les audiences.**

Tant que les **deux audiences restent**, le mur staff (T1→T3) n'est pas un
prérequis à la fusion des processus : le PIM reste exactement aussi protégé
qu'aujourd'hui — mal, mais pas moins bien. T3 est requis avant de **supprimer une
audience**, pas avant de réunir deux modules.

Et un même processus peut porter **deux clients Prisma sur deux bases** : chaque
app génère déjà le sien dans son propre dossier. On obtient donc le M2M supprimé,
le saut réseau supprimé et une instance en moins **sans une seule ligne de
migration de données**.

D'où l'ordre retenu, **backend d'abord** :

|        | Étape                                                                                                                                   | Risque                       | Réversible |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------- |
| **B0** | Renommer l'app en `lfd-api` — **seul**, avant toute fusion                                                                              | faible                       | oui        |
| **B1** | Les **deux gates** (frontières de contexte, jointures inter-schéma)                                                                     | nul                          | —          |
| **B2** | Un processus, deux clients Prisma, **deux bases inchangées**. Le PIM devient `pim/`, le fil devient un port, les deux audiences restent | faible                       | oui        |
| **B3** | `b2b/catalog/` fond — la parité reste en garde-fou explicite                                                                            | faible                       | oui        |
| **B4** | Une base, quatre schémas                                                                                                                | moyen — migration de données | par dump   |
| **B5** | T1→T3, puis l'audience unique                                                                                                           | moyen                        | non        |
| **B6** | Le front — PIM greffé sur l'admin, shell réduit au registre                                                                             | faible                       | oui        |
| **B7** | `C7` — bascule du front client sur l'API                                                                                                | moyen                        | non        |

**B1 avant tout code de fusion.** C'est la seule marche non négociable : c'est
elle qui remplace le mur que le réseau tenait.

**B0 seul**, aussi : un renommage qui casse un déploiement au milieu d'une fusion
de contextes est indébrouillable. Et il se limite à l'identité **locale** —
dossier, paquet, CI. Le nom du Worker (`lfc-b2b-backend`) et celui de l'image
restent, parce qu'ils sont référencés par un **service binding** de la passerelle :
les renommer crée un nouveau Worker, laisse l'ancien orphelin, et coupe la
passerelle entre les deux déploiements. C'est une opération à part, à faire un
jour de calme.

Le coût d'avoir inversé l'ordre : les ~24 fichiers de couture front restent en
place pendant tout le chantier backend, et le PIM continue de recevoir son jeton
par le bridge. C'est acceptable — c'est de la plomberie qui attend, pas une
dette qui grossit.

`C7` reste **en dernier** : il câble le front client sur l'API du catalogue et
fige la frontière qu'on est en train de déplacer.

## Ce qui n'est pas tranché

- **Shopify reste-t-il une vitrine vivante ?** Si oui, le PIM garde la propriété
  du référentiel même devenu un contexte : Shopify continue d'être servi par
  `pim/channels/shopify`, jamais par le B2B. Si Shopify devient un canal de sortie
  parmi d'autres, la fusion complète des modèles se discute — mais alors avant
  `C7`.
- **Quand `terrain` devient une surface à part.** Critère proposé : le jour où
  l'appareil change, pas le jour où le sujet grossit.
- **Le trou d'autorisation du PIM** est à traiter **indépendamment** de tout ceci :
  il est ouvert maintenant.

## L'arborescence cible — la séparation, physiquement

Trois blocs métier, un socle technique. Le point du découpage est qu'on doit
pouvoir **voir** la frontière en ouvrant le dossier, et qu'un import qui la
franchit doit sauter aux yeux dans une revue de diff.

```
apps/lfd-api/                          ← ex lfc-B2B-platform-backend, renommé
├── prisma/
│   └── schema.prisma                  schemas = ["staff", "pim", "b2b", "growth"]
└── src/
    │
    ├── staff/                         ▸ LE SOCLE PARTAGÉ — schéma `staff`
    │   ├── directory/                   annuaire (ex `staff-users/`)
    │   ├── permissions/                 catalogue, rôles, overrides, résolution
    │   ├── invitations/                 émission, péremption, première entrée
    │   ├── notifications/               (ex `staff-notifications/`)
    │   └── staff.module.ts
    │
    ├── pim/                           ▸ LE RÉFÉRENTIEL — schéma `pim`
    │   ├── catalogue/                   produits, catégories, collections
    │   ├── channels/
    │   │   ├── shopify/                 réconciliation 3 voies, snapshots
    │   │   └── b2b-platform/            le fil — devient un PORT, plus du HTTP
    │   ├── commerce/                    régimes de TVA
    │   ├── locations/  allergens/
    │   └── pim.module.ts
    │
    ├── b2b/                           ▸ LA PLATEFORME MARCHANDE — `b2b` + `growth`
    │   ├── account/                     personnes, memberships, sociétés
    │   ├── orders/  subscriptions/  payments/
    │   ├── pricing/                     règles, planchers, barèmes, gabarits
    │   ├── catalog/                     la lecture du référentiel (voir plus bas)
    │   ├── delivery-zones/  pickup-addresses/  order-cutoffs/
    │   ├── alerts/  growth/
    │   └── b2b.module.ts
    │
    ├── platform/                      ▸ TECHNIQUE PURE — zéro connaissance métier
    │   ├── database/                    Prisma, clients, transactions
    │   ├── auth/                        vérification de jeton, principal
    │   ├── http/  mailer/  storage/  time/  security/
    │   └── platform.module.ts
    │
    ├── appBootstrap/                  racine de composition
    ├── main.ts                        rôle `api`
    └── worker.ts                      rôle `worker` — MÊME image
```

Ce qui bouge peu, volontairement : les dossiers du PIM se déplacent **tels
quels**, ceux du B2B se rangent sous `b2b/`, et `staff-users/` +
`staff-notifications/` — qui existent **déjà** comme dossiers de premier niveau —
se regroupent sous `staff/`. L'extraction du socle staff n'invente rien : elle
rend explicite un partage aujourd'hui accidentel, puisque le PIM ne peut pas
atteindre l'annuaire qui décide pourtant de qui a le droit d'y entrer.

### Qui a le droit d'importer qui

C'est la matrice que `lint:context-boundaries` transcrit. Elle est courte exprès :
si elle ne tient pas en cinq lignes, le découpage est faux.

| Depuis ↓ vers → | `staff`          | `pim`               | `b2b` | `platform` |
| --------------- | ---------------- | ------------------- | ----- | ---------- |
| **`staff`**     | —                | ✗                   | ✗     | ✓          |
| **`pim`**       | ✓ (autorisation) | —                   | ✗     | ✓          |
| **`b2b`**       | ✓ (autorisation) | **port uniquement** | —     | ✓          |
| **`platform`**  | ✗                | ✗                   | ✗     | —          |

Deux lectures à retenir :

- **`staff` ne connaît personne.** Il dit qui est qui et qui peut quoi ; s'il
  connaissait le B2B, on ne pourrait plus le poser devant le PIM ;
- **`b2b → pim` passe par un port, jamais par une table.** C'est la frontière
  qui remplace le réseau : `CatalogFeedPort` déclaré dans `b2b/`, implémenté dans
  `pim/channels/b2b-platform/`. Le jour où quelqu'un écrit une jointure
  `pim.products × b2b.orders`, la gate le refuse.

### Les schémas Postgres

Une base, quatre schémas — le B2B est **déjà** en `multiSchema` (`public`,
`growth`), donc ce n'est pas un saut d'architecture mais une ligne de plus :

```prisma
datasource db {
  provider = "postgresql"
  schemas  = ["staff", "pim", "b2b", "growth"]
}
```

`public` devient `b2b`. Une table appartient à **un** schéma, et le schéma dit
qui la possède. Aucune jointure ne traverse : le franchissement passe par un port,
exactement comme il passait par HTTP.

### Les packages

```
packages/
├── staff-contracts/       ▸ NOUVEAU — rôles, permissions, vues annuaire
├── pim-contracts/         ▸ existe — DTO du référentiel
├── b2b-contracts/         ▸ ex `contracts/`, renommé pour cesser d'être « les » contrats
├── endpoints/             messages d'erreur HTTP, partagé
├── shopify-admin/         transport Admin Shopify, framework-free
├── catalog-sync/  storage/  mailer/  ops-contract/
└── ui :  fold-ng (npm)  ·  b2b-ui  ·  catalog-ui
```

Le renommage `contracts` → `b2b-contracts` n'est pas cosmétique : tant qu'un
package s'appelle « les contrats », tout finit dedans, et la frontière disparaît
du côté où elle se voyait le mieux. Trois contextes, trois paquets de contrats,
et l'import dit à qui l'on parle.

### Ce que devient `b2b/catalog/`

Aujourd'hui il porte l'ingestion, la parité, les décisions d'ingestion, la
projection de catégories et l'historique du prix canonique — une vingtaine de
fichiers qui n'existent que parce que le référentiel est de l'autre côté d'un
réseau.

Après : il ne garde que **la lecture** (`ProductCatalogReader` sur le port) et,
si on le veut, le **contrôle de parité** — qui cesse d'être un protocole pour
devenir un garde-fou explicite. Le reste fond.

Ce n'est pas un gain gratuit : c'est le vrai bénéfice de la fusion, et c'est
aussi ce qui la rend irréversible.

## L'arborescence cible — le front

Le front se visualise moins bien que le backend, et ce n'est pas un défaut de
description : **un front ne possède rien**. Le backend a des tables, des schémas,
des transactions — sa frontière est un objet. Le front n'a que des routes et des
dossiers ; sa frontière est une convention, donc elle doit être écrite pour
exister.

```
apps/lfd-admin/                        ← ex lfc-B2B-admin-frontend
└── src/app/
    ├── auth/                          UN bootstrap Auth0 (celui de l'admin)
    ├── api/                           client HTTP, UNE base d'URL
    ├── shared/                        composants transverses, notify, nav-counts
    │
    ├── catalogue/                     ▸ du PIM — produits, catégories, collections, TVA
    ├── publication/                   ▸ du PIM
    ├── canaux/                        ▸ du PIM (ex `channels/` + `integration/`) — Shopify
    ├── emplacements/                  ▸ du PIM
    │
    ├── comptes-clients/  fiche-client/
    ├── commandes/  commercial/  production/  retrait/
    ├── reglages/                      ← dont Utilisateurs : le point unique
    │
    └── app.routes.ts                  UN routeur, UNE nav
```

Le `data/` du PIM (client d'API, modèles) fusionne dans `api/` ; sa page
`documentation/` devient une route comme une autre.

### Ce qui disparaît

|                                 |                                   |
| ------------------------------- | --------------------------------- |
| `apps/lfc-suite-shell/`         | l'app hôte entière                |
| `suite-embed` dans chaque front | le client d'embed                 |
| `packages/suite-embed/`         | le contrat de bridge              |
| le second bootstrap Auth0       | le PIM hérite de celui de l'admin |
| l'audience `pim` côté front     | une de moins                      |

Environ **24 fichiers** de plomberie, et deux bundles Angular + fold qui n'en
font plus qu'un.

### La règle d'import, côté front

Elle est plus courte que celle du backend, parce qu'il n'y a rien à posséder :

- **une feature n'importe jamais une autre feature.** `commercial/` ne connaît pas
  `catalogue/`. Ce qu'elles partagent monte dans `shared/`, ou passe par
  l'URL — un `routerLink` est un couplage assumé, un import croisé ne l'est pas ;
- **`api/` est le seul à parler HTTP.** Une feature appelle un service, jamais
  `HttpClient` ;
- **`shared/` ne connaît aucune feature.** S'il en connaît une, ce n'est pas du
  partagé, c'est de la feature mal rangée.

C'est la même matrice que le backend, en plus pauvre — et c'est normal : la
frontière qui compte, celle des données, est déjà tenue côté serveur.

### Les packages du front

```
fold-ng      (npm)   le design system — inchangé
b2b-ui               présentation partagée admin ↔ client   ▸ DEUX consommateurs, il reste
catalog-ui           écrans de catalogue                    ▸ UN seul consommateur
```

`catalog-ui` n'est utilisé que par l'admin — pas même par le front PIM. Après la
fusion il en aura toujours **un**. Un package à un seul consommateur est un
dossier qui paie un build : il ne mérite son extraction que le jour où le front
client s'en sert. Sinon il redescend dans `shared/`.

C'est la question symétrique du renommage `contracts` → `b2b-contracts` : d'un
côté un paquet trop large qui efface une frontière, de l'autre un paquet trop
étroit qui en invente une.

### Le lanceur, plus tard

Il revient dès qu'il y a **deux fronts internes** — `ops`, ou `terrain`. Ce sera
une page avec des tuiles et des `href`, alimentée par le registre
(`SUITE_APPS` + `requiredPermission`) qui survit à la casse. Deux fichiers.

Un lanceur **navigue**. Il n'héberge pas, il ne relaie pas de jeton, il ne
surveille pas la santé de ce qu'il ouvre.
