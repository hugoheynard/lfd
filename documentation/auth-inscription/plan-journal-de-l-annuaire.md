# Plan — l'annuaire staff se journalise, et ses auteurs sont des fiches

> **Ouvert le 2026-09-18** à la demande de Hugo : « on doit faire 13.2,
> important », puis « granted by ne devrait pas stocker le sub (fuite de
> donnée) mais l'identifiant staff id », puis « il faut que dans le back office
> mes entrées de journal soient lisibles avec des phrases humaines ».
> Point de départ : [`architecture-acces-staff.md`](architecture-acces-staff.md) §13.2.
>
> État : 🟡 **lots 1 à 4 bâtis le 2026-09-18**, non commités, non déployés. Reste
> le second déploiement du lot 2 (suppression de `granted_by`). **Contredit par
> `vitruve` le 2026-09-18** — ce qu'il a changé est au §9 ; ce que la
> construction a tranché est au §10.

## 0. Résumé

Aujourd'hui, personne ne peut répondre à « qui a invité Cécile ? », « qui lui a
retiré l'accès compta ? », « qui a supprimé cette fiche ? ». Ce plan :

1. **écrit au journal chaque geste de l'annuaire et des rôles**, dans la même
   transaction que le geste (lot 3) ;
2. **les affiche en phrases** : « Hugo Heynard a créé Cécile Martin,
   Commercial », avec la date lisible (lot 4) ;
3. **fait désigner l'auteur d'une dérogation par l'id de sa fiche**, plus par
   son `sub` Auth0 (lot 2) ;
4. **cesse de réécrire les dérogations inchangées** à chaque édition (lot 1).

Il **ne** remplace **pas** le `sub` partout où il sert d'auteur : c'est un
chantier plus large, décrit au §8, à ouvrir séparément.

## Avancement — tenu à jour

_Dernière mise à jour : 2026-09-18._ Rien n'est commité ni déployé.

| Lot                                     | État       | Où c'est                                                                                                                                                                                                                                    | Prouvé par                                                                                                                                      |
| --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** — dérogations en diff             | ✅ bâti    | `staff/directory/domain/override-diff.ts` ; `prisma-staff-user.repository.ts` n'écrit que le diff et rend `{ before, after, overrides }`                                                                                                    | `override-diff.spec.ts`, `prisma-staff-user.overrides.spec.ts`, e2e `staff-journal` (dérogation inchangée : même id, même date)                 |
| **2** — auteur = id de fiche, temps 1   | ✅ bâti    | migration `20260918100000_auteur_de_derogation_par_fiche` (colonne + nullable + rétro-remplissage) ; contrôleur de l'annuaire sur `@StaffUserId()` ; `isSelf` par id                                                                        | `prisma-staff-user.repository.spec.ts`, e2e `staff-journal`                                                                                     |
| **2** — temps 2, supprimer `granted_by` | ⏳ à faire | migration séparée, **après** le déploiement du temps 1                                                                                                                                                                                      | —                                                                                                                                               |
| **3** — faits de l'annuaire             | ✅ bâti    | `staff-facts.ts`, `staff-role-facts.ts` ; handlers découpés un par fichier sous `staff/directory/application/` et `staff/permissions/application/` ; `open-staff-access.service.ts`, `pending-staff-access.ts` ; cache vidé après le commit | specs des handlers (doubles de port, `recording-journal.ts`), e2e `staff-journal` (8 cas, dont journal en panne ⇒ geste annulé et aucun e-mail) |
| **3** — porte                           | ✅ bâti    | `journal-tracked.mjs` couvre `staff/` ; `handler-per-file` : dette 24 → 22                                                                                                                                                                  | `pnpm lint:gates`                                                                                                                               |
| **4** — écran Journal                   | ✅ bâti    | `admin/journal/staff-line.ts` (13 types), `journal-line.ts` (libellés de module), filtre « Équipe », badge en libellé                                                                                                                       | `staff-line.spec.ts` (25 tests)                                                                                                                 |
| Contrat                                 | ✅         | `activityModuleSchema` + `equipe` ; préfixes dans `activity-module.ts`                                                                                                                                                                      | typecheck                                                                                                                                       |

**Vérifié le 2026-09-18** : lint racine, typecheck de l'API (source et specs)
et du back-office, build AOT du back-office, tests unitaires de l'API (3 936)
et du back-office (1 808), toutes les e2e `staff-*` — verts. `pnpm test` racine :
les seules suites rouges sont hors de ce chantier (`shop-order`,
`production-*`).

**Reste à faire, dans l'ordre :**

1. **Relire les choix du §10** — surtout la phrase d'une activation manuelle
   (« a rétabli l'accès ») et la fonction de l'auteur absente des lignes de
   l'équipe.
2. **Suivre les nouveaux fichiers dans git** (migration, handlers, specs,
   `staff-line.ts`, ce plan) : `lint:doc-references` échoue tant qu'ils ne le
   sont pas.
3. **Commiter**, par sujet, après `cerberus` ; **déployer** le temps 1 du lot 2.
4. **Le temps 2 du lot 2** : supprimer `granted_by` — et les `sub` qu'elle
   contient — dans un déploiement suivant.
5. **Hors de ce plan, ouverts en TODO** :
   [`todo-le-sub-comme-auteur.md`](todo-le-sub-comme-auteur.md) (§8) et
   [`../todos/todo-doublon-du-journal-dans-une-transaction.md`](../todos/todo-doublon-du-journal-dans-une-transaction.md) (§10).
6. **Mettre à jour la doc d'architecture** quand le temps 2 sera fait :
   [`architecture-acces-staff.md`](architecture-acces-staff.md) mentionne
   encore l'ancienne colonne comme « vouée à disparaître ».

## 1. Ce qui existe (vérifié le 2026-09-18, revérifié par `vitruve`)

| Fait                                                                                                                                            | Où                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Journal.append(fact)` dérive acteur, instant, trace et idempotence (`type:subjectId:traceId`) du contexte de requête                           | `platform/journal/`, `appBootstrap/journal.module.ts`            |
| **`UnitOfWork.run`** met le journal dans la transaction métier ; il interdit d'y envelopper un appel réseau                                     | `platform/database/unit-of-work.ts`                              |
| Les actes staff des comptes clients s'écrivent ainsi : `uow.run(save + publishTraced)`                                                          | `change-company-status.handler.ts:40`                            |
| La porte `journal-tracked` exige `UnitOfWork` pour les actes qu'elle couvre — **pas `staff/`**                                                  | `dev-toolbox/gates/journal-tracked.mjs`                          |
| L'acteur staff du contexte est le **`sub` Auth0** (client : `User.id`) ; nom et fonction sont figés à l'écriture                                | `admin-auth.guard.ts:67`, `prisma-actor-namer.ts`                |
| Un fait se range dans un module par préfixe (`pim`, `commercial`, `commandes`, `comptes`) ; l'écran affiche la **clé brute** du module en badge | `activity-module.ts`, `journal-page.html:45`                     |
| Une ligne de journal = une phrase au passif + « date, par Acteur (Fonction) »                                                                   | `journal-line.ts`, `journal-page.html:44-56`                     |
| **Aucun geste de `staff/` n'écrit au journal**                                                                                                  | `staff/`                                                         |
| `granted_by` (NOT NULL) reçoit le `sub` de l'auteur ; **aucun lecteur** ; chaque édition le réécrit (`deleteMany` + `create`)                   | `staff.prisma:198`, `prisma-staff-user.repository.ts:172,292`    |
| Précédent : `grantedByStaffId` = `StaffUser.id`, **sans clé étrangère**, lu par `request.access.staffUserId` (`@StaffUserId()` existe)          | `orders.prisma:427`, `order-waivers/http/`, `staff.decorator.ts` |
| Le cache d'accès est vidé par le dépôt **à l'intérieur** de l'écriture                                                                          | `prisma-staff-user.repository.ts:179,186,196,235`                |

## 2. Décisions

**D1 — L'auteur d'une dérogation est l'id de la fiche de l'auteur.** Le `sub`
Auth0 est un identifiant du fournisseur ; il n'a rien à faire dans nos données
métier. Même forme que `grantedByStaffId`, et **sans clé étrangère**, pour la
même raison : une fiche se supprime, sa trace doit survivre.

**D2 — Le journal, pas une colonne `invitedBy`.** Une colonne ne garde que le
dernier auteur d'un seul geste ; le journal garde tous les gestes, avant et
après, et fige le nom et la fonction de l'acteur.

**D3 — Dans la transaction, comme les actes staff des comptes clients.** Chaque
geste écrit sa trace dans le même `uow.run` que son écriture : une panne de
journal annule le geste. Les appels réseau (Auth0, e-mail) restent **hors** de la
transaction — le §5 place chacun. `staff/` entre dans la porte
`journal-tracked` : un futur handler de l'annuaire qui oublierait sa trace
échouera en CI.

**D4 — Un module `equipe` au journal**, préfixes `staff_user.` et `staff_role.`.
Une **valeur** de contrat, en français comme `commandes` et `comptes`. Les ranger
sous `comptes` mêlerait l'équipe et les clients dans le même filtre.

**D5 — La trace ne porte ni e-mail ni lien.** Le journal est derrière `activity`,
l'annuaire derrière `staff_access` : quelqu'un qui aurait le premier sans le
second (par dérogation) lirait les adresses de l'équipe. La phrase nomme les
personnes par leur nom ; l'adresse reste dans l'annuaire.

## 3. Lot 1 — les dérogations ne se réécrivent plus

À l'édition, le dépôt compare l'état demandé à l'état stocké, par couple
(ressource, action) :

- les retirées sont **supprimées** ;
- les nouvelles sont **créées** — auteur et date du jour ;
- celles dont l'effet change sont **mises à jour** — auteur et date du jour ;
- les autres **ne sont pas touchées**.

Le dépôt rend ce diff (ajoutées, retirées, modifiées) : c'est la matière de
`staff_user.overrides_changed`.

## 4. Lot 2 — `granted_by` devient un id de fiche

Deux déploiements, pas trois : la colonne n'a aucun lecteur.

1. **Étendre, remplir, basculer.** Migration additive :
   - colonne `granted_by_staff_id` nullable, **sans clé étrangère** ;
   - `granted_by` devient **nullable** ;
   - **rétro-remplissage** par jointure `staff_users.auth0_id = granted_by`
     (décidé par Hugo le 2026-09-18 : aucune fiche n'a été supprimée, donc
     aucun `sub` n'a pu passer d'une fiche à une autre). Les valeurs sans
     correspondance (`test`, un `sub` jamais lié) restent à `NULL` : on ne
     fabrique pas d'auteur.

   Le code n'écrit plus que `granted_by_staff_id`, lu par `@StaffUserId()`.

   ⚠️ **Ce que le remplissage ne répare pas** : avant le lot 1, chaque édition
   de fiche réattribuait toutes les dérogations à son éditeur. La valeur remplie
   désigne donc le **dernier éditeur de la fiche** à la date du déploiement, pas
   forcément la personne qui a accordé l'écart. Vrai à partir du déploiement.

   _Retour arrière_ : l'ancien code écrit `granted_by`, toujours présent ; la
   migration inverse supprime `granted_by_staff_id` et remet `NOT NULL` après
   avoir comblé les nuls de `granted_by`.

2. **Resserrer**, dans un déploiement séparé : suppression de `granted_by` —
   et avec elle des `sub` qu'elle contient.

La politique compare `isSelf` par `auth0Id === actorSub` : elle comparera les
`id`, puisque le contrôleur passe désormais l'id de fiche de l'auteur.

## 5. Lot 3 — les faits de l'annuaire, dans la transaction

Vocabulaire `STAFF_FACTS` dans `staff/directory/domain/`, sur le modèle
d'`ACCOUNT_FACTS` ; `staff_role.*` à côté des rôles. Sujet : `staff_user` / id
de la fiche, ou `staff_role` / sa clé.

| Type                                                          | Transaction                              | Réseau, **après** le commit          |
| ------------------------------------------------------------- | ---------------------------------------- | ------------------------------------ |
| `staff_user.created`                                          | création de la fiche + fait              | ouverture de l'accès (Auth0, e-mail) |
| `staff_user.invited`                                          | `markInvited` + fait — **avant** l'envoi | e-mail                               |
| `staff_user.password_link_issued`                             | fait seul (la file à remettre à la main) | —                                    |
| `staff_user.identity_edited`                                  | écriture locale + fait                   | propagation de l'adresse à Auth0     |
| `staff_user.role_changed`                                     | idem                                     | idem                                 |
| `staff_user.overrides_changed`                                | idem                                     | —                                    |
| `staff_user.suspended` / `.reinstated`                        | changement d'état + fait                 | e-mail à la personne                 |
| `staff_user.deleted`                                          | suppression + fait                       | —                                    |
| `staff_role.created` / `.updated` / `.archived` / `.restored` | écriture + fait                          | —                                    |

Ce que ce placement garantit, geste par geste :

- **Invitation ou renvoi** : Auth0 frappe le lien, puis `markInvited` et la trace
  partent ensemble, **puis** l'e-mail. Si le journal tombe, rien n'est écrit et
  **aucun e-mail ne part** : l'écran dit l'échec, et un nouvel essai frappe un
  lien neuf. Jamais un e-mail envoyé derrière un 500.
- **Création** : la fiche et sa trace partent ensemble. L'ouverture d'accès qui
  suit garde son comportement actuel — son échec est journalisé en log, la fiche
  reste `pending`, « Renvoyer le lien » reprend la main. Son fait `invited`, lui,
  n'est écrit que si l'invitation aboutit.
- **Édition** : la trace décrit l'écriture locale, qui est faite. Une
  propagation d'adresse qui échoue ensuite reste signalée comme aujourd'hui, avec
  les deux adresses.
- **Suspension** : la porte se ferme avec sa trace ; l'e-mail qui suit ne
  conditionne rien, comme aujourd'hui.

Et trois règles :

- **Un fait par changement réel.** Une édition sans changement n'écrit rien. Il
  faut donc l'état d'avant : `loadTarget` ne lit aujourd'hui que l'id, l'e-mail,
  le rôle et le `sub` — il lira la fiche entière et ses dérogations.
- **Le cache d'accès se vide après le commit**, plus dedans : vidé avant, une
  requête concurrente le remplirait avec l'état d'avant, et une suspension
  mettrait 30 s à mordre.
- **La première entrée** (`invited → active`, constatée dans un garde à chaque
  requête) n'est pas journalisée ici.

`staff-user.handlers.ts`, `staff-role.handlers.ts` et `pending-staff-access.ts`
sont dans l'inventaire gelé de `lint:handler-per-file` ; les toucher se fait
dans le respect de la porte (ce lot peut être l'occasion de les découper).

### 5 bis. La charge utile de chaque fait — le contrat entre le back et l'écran

Des **libellés figés**, jamais des clés seules, jamais d'e-mail ni de lien (D5).
`Person = { firstName, lastName }`. `Grant = { resource, resourceLabel, action }`
(`action` : `read` | `write`). `Override = Grant & { effect: "allow" | "deny" }`.

| Type                              | `subjectType` / `subjectId` | Charge utile                                                                                                                                                                             |
| --------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `staff_user.created`              | `staff_user` / id           | `{ person, roleLabel }`                                                                                                                                                                  |
| `staff_user.invited`              | `staff_user` / id           | `{ person, kind: "invitation" \| "password_reset" }`                                                                                                                                     |
| `staff_user.password_link_issued` | `staff_user` / id           | `{ person }`                                                                                                                                                                             |
| `staff_user.identity_edited`      | `staff_user` / id           | `{ person, previous: Person \| null, fields: string[] }` — `fields` en libellés : « prénom », « nom », « e-mail », « téléphone », « fonction » ; `previous` seulement si le nom a changé |
| `staff_user.role_changed`         | `staff_user` / id           | `{ person, fromLabel, toLabel }`                                                                                                                                                         |
| `staff_user.overrides_changed`    | `staff_user` / id           | `{ person, added: Override[], removed: Override[], changed: Override[] }` (`changed` porte le nouvel effet)                                                                              |
| `staff_user.suspended`            | `staff_user` / id           | `{ person }`                                                                                                                                                                             |
| `staff_user.reinstated`           | `staff_user` / id           | `{ person }`                                                                                                                                                                             |
| `staff_user.deleted`              | `staff_user` / id           | `{ person, roleLabel }`                                                                                                                                                                  |
| `staff_role.created`              | `staff_role` / clé          | `{ label, grants: Grant[] }`                                                                                                                                                             |
| `staff_role.updated`              | `staff_role` / clé          | `{ label, previousLabel: string \| null, added: Grant[], removed: Grant[], changed: Grant[] }`                                                                                           |
| `staff_role.archived`             | `staff_role` / clé          | `{ label }`                                                                                                                                                                              |
| `staff_role.restored`             | `staff_role` / clé          | `{ label }`                                                                                                                                                                              |

Une édition de fiche qui change à la fois l'identité, le rôle et les
dérogations écrit **trois** faits, chacun le sien ; la clé d'idempotence
(`type:subjectId:traceId`) les distingue par leur type.

## 6. Lot 4 — l'écran Journal parle en phrases

Exigence de Hugo : chaque entrée se lit comme une phrase humaine, qui nomme
**qui** a agi, **sur qui**, et **quand**. Jamais un type brut, un identifiant ou
un `sub`.

Pour les faits de l'équipe, une ligne devient :

- **un titre** — le geste : « Création d'un membre de l'équipe » ;
- **une phrase à la voix active**, qui nomme l'auteur et la personne ;
- **la date** : « 18 septembre 2026 à 14:32 » (`whenOf`). La méta ne répète pas
  « par … » quand la phrase nomme déjà l'auteur.

| Type                                | Titre                            | Phrase                                                                                         |
| ----------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `staff_user.created`                | Création d'un membre de l'équipe | **Hugo Heynard** a créé **Cécile Martin**, Commercial                                          |
| `staff_user.invited`                | Invitation                       | **Hugo Heynard** a invité **Cécile Martin** à rejoindre le back-office                         |
| — personne déjà active              | Nouveau mot de passe             | **Hugo Heynard** a envoyé à **Cécile Martin** un lien pour choisir un nouveau mot de passe     |
| `staff_user.password_link_issued`   | Lien remis à la main             | **Hugo Heynard** a fabriqué un lien d'accès pour **Cécile Martin**, à lui remettre en personne |
| `staff_user.identity_edited`        | Fiche modifiée                   | **Hugo Heynard** a modifié la fiche de **Cécile Martin** : téléphone, fonction                 |
| `staff_user.role_changed`           | Changement de rôle               | **Hugo Heynard** a fait passer **Cécile Martin** de Commercial à Comptabilité                  |
| `staff_user.overrides_changed`      | Droits individuels               | **Hugo Heynard** a accordé à **Cécile Martin** : Tarification (écriture) — retiré : Prospects  |
| `staff_user.suspended`              | Accès suspendu                   | **Hugo Heynard** a suspendu l'accès de **Cécile Martin**                                       |
| `staff_user.reinstated`             | Accès rétabli                    | **Hugo Heynard** a rétabli l'accès de **Cécile Martin**                                        |
| `staff_user.deleted`                | Suppression d'un membre          | **Hugo Heynard** a supprimé la fiche de **Cécile Martin** (Commercial)                         |
| `staff_role.created`                | Nouveau rôle                     | **Hugo Heynard** a créé le rôle **Logistique**                                                 |
| `staff_role.updated`                | Rôle modifié                     | **Hugo Heynard** a modifié le rôle **Commercial** : + Alertes (écriture)                       |
| `staff_role.archived` / `.restored` | Rôle archivé / restauré          | **Hugo Heynard** a archivé le rôle **Logistique**                                              |

- **La charge utile fige tout ce que la phrase affiche** : prénom, nom, libellés —
  pas des clés. Une fiche supprimée ou un rôle renommé ne change pas la phrase
  d'hier.
- **Les libellés** : pour la fiche, le rôle vient de `STAFF_ROLE_LABELS` (la
  fiche ne porte que les cinq rôles du contrat) ; pour `staff_role.*`, le
  **libellé en base** du rôle — « Logistique » n'existe pas dans le contrat. Les
  ressources viennent de `STAFF_RESOURCE_LABELS`.
- **L'auteur vient de `actorName`**, figé par l'adaptateur ; s'il manque, la
  phrase dit « Un membre de l'équipe a créé … » — jamais un identifiant.
- **Le badge de module affiche un libellé** — « Équipe », « Comptes clients »,
  « Référentiel »… — et plus la clé brute, pour tous les modules.
- Un test par type fige la phrase attendue.

## 7. Ordre et tests

**Ordre** : lot 1 → lot 2 → lot 3 → lot 4. Les deux premiers rendent vrais les
auteurs avant qu'on les écrive au journal.

**Tests** :

- dépôt : les dérogations inchangées gardent auteur et date ; le diff rendu est
  exact ; `granted_by_staff_id` porte l'id de fiche ;
- handlers : un fait par changement réel, aucun pour une édition vide ; une panne
  du journal annule l'écriture **et n'envoie aucun e-mail** (invitation) ;
- e2e : chaque geste produit son fait, avec le nom de l'auteur figé ; le cache
  est vidé après le commit (une suspension mord à la requête suivante) ;
- front : une phrase par type ; le badge affiche un libellé ;
- porte : `journal-tracked` couvre `staff/`.

## 8. Ce que ce plan ne fait pas — le `sub` comme auteur, ailleurs

`vitruve` a mesuré ce que « l'auteur est la fiche, jamais le `sub` » demanderait
**partout** (vérifié le 2026-09-18) :

- l'acteur du journal (`activity_events.actor_id`) est le `sub` pour tout acte
  staff, et `ActivityEventView.actorId` le sert au back-office ;
- plusieurs colonnes le lisent dans le contexte et le stockent : `updatedBy`,
  `readyBy`, `takenBy`, `publishedBy` (PIM), `acceptedBy` (catalogue) — certaines
  s'affichent telles quelles ;
- des colonnes `*_by_sub` : `feature-access.prisma:31,50`, `client-notes.prisma:42`,
  `account.prisma:164,206`, `settings.prisma:95`, `alerts.prisma:103` ;
- une cinquantaine d'appels à `@StaffSub()` ;
- trois e2e qui attendent le `sub` en `actorId`.

Changer l'acteur du contexte pour l'id de fiche changerait **en silence**
l'unité de toutes ces colonnes. C'est un chantier à part, avec sa propre
migration — et la réécriture de l'historique du journal y est risquée : un `sub`
peut passer d'une fiche supprimée à une nouvelle sous la même adresse, et
`actor_name` est nul sur les faits les plus anciens. **À ouvrir en TODO**, pas
dans ce plan.

## 9. Ce que `vitruve` a changé

| Objection                                                                                             | Ce qui a changé                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| BLOQUANT — « le journal ne peut pas être dans la transaction » était faux (`UnitOfWork` existe)       | D3 réécrit : dans la transaction ; porte `journal-tracked` étendue                               |
| BLOQUANT — `granted_by` NOT NULL rendait la bascule impossible                                        | `granted_by` devient nullable dans la même migration                                             |
| BLOQUANT — la réécriture du journal effaçait les faits récents et les identités anciennes             | Plus de réécriture du journal dans ce plan (§8)                                                  |
| SÉRIEUX — le lot 2 changeait l'unité de colonnes d'autres blocs                                       | L'acteur du contexte ne change pas ; chantier séparé (§8)                                        |
| SÉRIEUX — la jointure `auth0_id` peut attribuer à la mauvaise fiche ; `granted_by` est déjà faux      | Rétro-remplissage gardé (aucune fiche supprimée, Hugo) ; limite « dernier éditeur » écrite au §4 |
| SÉRIEUX — clé étrangère non tranchée                                                                  | Pas de clé étrangère (D1), comme `grantedByStaffId`                                              |
| SÉRIEUX — gestes laissés dans un état trompeur par une panne de journal                               | Placement geste par geste (§5) ; aucun e-mail derrière un 500                                    |
| SÉRIEUX — rien n'oblige les futurs handlers à journaliser                                             | `staff/` entre dans `journal-tracked`                                                            |
| SÉRIEUX — le journal (`activity`) exposerait les e-mails de l'équipe hors `staff_access`              | D5 : ni e-mail ni lien dans la trace                                                             |
| SÉRIEUX — libellés de rôles en base absents du contrat                                                | `staff_role.*` fige le libellé en base                                                           |
| SÉRIEUX — le cache vidé dans la transaction                                                           | Vidé après le commit                                                                             |
| MINEUR — badge en clé brute, `loadTarget` incomplet, inventaire `handler-per-file`, « le » de la date | Intégrés au §5 et au §6                                                                          |

**Non vérifié** (relevé par `vitruve`) : si un nouvel essai réutilise le même
`traceparent` — la clé d'idempotence `type:subjectId:traceId` avalerait alors le
second fait `invited` d'un même sujet ; quels rôles ouvrent `activity` en
production ; si `lint:code-language` accepte la valeur `equipe`.

## 10. Ce que la construction a tranché

Là où le plan était muet, voici ce qui a été décidé en bâtissant — à relire.

- **Une fiche `pending` ou `invited` passée à `active` à la main**
  (`PATCH …/status`) écrit `staff_user.reinstated` : l'écran dira « a rétabli
  l'accès ». Juste pour une réintégration, approximatif pour une première
  activation manuelle.
- **Le lien remis à la main** (`password_link_issued`) : Auth0 frappe le lien,
  puis le fait s'écrit en transaction. Si le journal tombe, le lien n'est pas
  rendu — mais Auth0 a déjà invalidé le précédent. Un nouvel essai en frappe un
  autre.
- **La charge utile n'est pas un type partagé** : elle est construite côté API
  (`staff-facts.ts`, `staff-role-facts.ts`) et relue défensivement côté écran
  (`staff-line.ts`). Le §5 bis est le seul contrat écrit.
- **Les mots des dérogations** : effet `allow` → « accordé », `deny` →
  « refusé », dérogation retirée → « rendu au rôle » (et non « retiré », qui se
  lirait comme un refus). Pour un rôle modifié, une action changée s'écrit
  « Tarification → écriture ».
- **Les noms ne sont pas en gras** : la phrase est une chaîne simple. Des noms
  en gras demanderaient une phrase en segments.
- **La fonction de l'auteur n'apparaît plus** sur une ligne de l'équipe : la
  phrase nomme l'auteur, la méta ne répète plus « par Hugo Heynard
  (Administrateur) ». Conforme au §6, mais c'est une information en moins.
- **Les handlers découpés** : `staff-user.handlers.ts` et `staff-role.handlers.ts`
  sont devenus un fichier par handler ; ils sortent de l'inventaire gelé de
  `lint:handler-per-file` (dette 24 → 22).

**Relevé en bâtissant, hors de ce plan** : l'adaptateur du journal traite une
violation d'unicité (`P2002`) comme un doublon idempotent et l'avale. Dans une
`UnitOfWork`, l'`INSERT` qui échoue met la transaction Postgres en état
d'échec : le commit tombe quand même. Un fait rejoué dans une transaction ferait
donc échouer le geste au lieu d'être ignoré — et cela vaut pour tous les
`publishTraced`. Non vérifié par un test ; TODO ouvert :
[`../todos/todo-doublon-du-journal-dans-une-transaction.md`](../todos/todo-doublon-du-journal-dans-une-transaction.md).
