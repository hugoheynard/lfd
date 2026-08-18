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

1. **Front** — PIM greffé sur l'admin, shell réduit à un registre. Réversible,
   supprime la couture, débloque la navigation entre sujets, et donne au PIM une
   vraie auth au lieu d'un jeton relayé.
2. **T1→T3** — catalogue de permissions, domaine, mur backend.
3. **Les deux gates.**
4. **Backend** — PIM devient un contexte, une image, l'audience PIM disparaît.
5. **C7** — bascule du front client sur l'API, une fois la frontière stable.

`C7` **après**, et pas avant : il câble le front client sur l'API du catalogue et
fige la frontière qu'on est en train de discuter.

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
