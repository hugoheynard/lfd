# Plan — les outils agent de la gestion des droits

> 📐 **Doc-first, rien n'est bâti** (rédigé le 2026-10-15). Déplace une
> **frontière de sécurité** (un agent écrit des droits) : `vitruve` est
> obligatoire avant de bâtir (CLAUDE.md §9 bis).

## 0. La demande (Hugo, 2026-10-15)

> « Je veux que tu me fasses des outils agents pour la gestion des droits » —
> puis, à la proposition (lecture, écriture, et une garde sur les droits
> d'administration) : « fais tout ».

## 1. Ce qui existe (ouvert le 2026-10-15)

- Les trousses WebMCP sont déclarées par l'écran `/outils-agent` du
  back-office, une par domaine : référentiel, médiathèque, exploitation,
  comptes, flotte ([`../ops/outils-agent.md`](../ops/outils-agent.md),
  [`../livraisons/chargement/outils-agent-vehicules.md`](../livraisons/chargement/outils-agent-vehicules.md)).
  L'écran est l'interrupteur ; un outil appelle **les mêmes routes** que
  l'écran, avec la session de la personne connectée, sous les mêmes refus.
- Les rôles : `GET|POST admin/staff-roles`, `PUT admin/staff-roles/:key`
  (remplace la définition du rôle, ses droits compris),
  `DELETE …/:key`, `POST …/:key/restore`
  (`staff/permissions/http/admin-staff-roles.controller.ts`,
  `@AdminSurface("staff_access")`).
- Les personnes : `GET|POST admin/staff-users`, `PATCH admin/staff-users/:id`
  (identité et rôle), `PATCH …/:id/status`, invitation, suppression
  (`staff/directory/http/admin-staff-users.controller.ts`, même surface).
- Le superadmin n'a pas de ligne : il est calculé (`held-role.ts`,
  `ALL_STAFF_PERMISSIONS`) et sa clé est refusée à l'écriture
  (`staff-role-support.ts`).

## 2. Décisions

### A1 — La trousse « Droits »

Déclarée par `/outils-agent` **si le compte a `staff_access:read`** ; les
outils d'écriture **si le compte a `staff_access:write`**. La route et
l'entrée de menu de `/outils-agent` s'ouvrent aussi à `staff_access:read`.

### A2 — Lecture

| Outil             | Ce qu'il rend                                                                    |
| ----------------- | -------------------------------------------------------------------------------- |
| `roles_list`      | les rôles (clé, libellé, archivé ou non) et le nombre de droits de chacun        |
| `role_get`        | les droits d'un rôle, rangés par catégorie, avec leurs libellés                  |
| `staff_list`      | les personnes, leur rôle et leur statut                                          |
| `staff_access_of` | les droits **effectifs** d'une personne : son rôle, ses dérogations, le résultat |
| `who_can`         | qui tient un droit donné (ex. `lfc_legal:write`), par rôle et par dérogation     |

`who_can` et `staff_access_of` lisent ce que le serveur résout ; s'il n'existe
pas de route qui rende la résolution, elle est ajoutée (lecture seule, sous
`staff_access:read`) plutôt que recalculée dans le navigateur.

### A3 — Écriture

| Outil                        | Geste                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `role_grant` / `role_revoke` | ajouter ou retirer **un** droit à un rôle — l'outil relit le rôle, change ce droit seul, et renvoie le rôle entier par `PUT …/:key` |
| `staff_assign_role`          | changer le rôle d'une personne                                                                                                      |

Chaque outil d'écriture **relit et rend l'état entier après** (comme
`vehicle_update`), et dit ce qui a changé.

### A4 — La garde : ce que l'agent ne touche pas, même si la personne le peut

- **Aucun droit `staff_access:*`** ne s'accorde ni ne se retire par l'agent :
  ouvrir la gestion des droits à un rôle reste un geste à l'écran.
- **Les rôles `superadmin` et `admin` sont hors de portée de l'agent**
  (Hugo, 2026-10-15 : « sauf superadmin et admin ») : il ne modifie pas leurs
  droits, ne les assigne à personne et ne change le rôle de personne qui les
  tient. Le serveur refuse déjà d'écrire le superadmin ; pour `admin`, c'est
  l'outil qui refuse, avec la raison — l'écran reste le seul chemin.
- **Son propre rôle** : l'agent ne modifie pas le rôle de la personne
  connectée, ni ne la change de rôle — on ne retire pas ses propres droits par
  mégarde, on ne s'en donne pas.
- **Pas d'archivage ni de création** de rôle, pas de suppression ni de
  suspension de personne : ce sont des gestes d'écran.

La garde vit dans l'outil **et** est éprouvée par ses tests ; elle ne
remplace pas les refus du serveur, qui restent la porte.

### A5 — La trace

Les écritures passent par les routes existantes : elles journalisent déjà
(les faits de rôle et d'annuaire). Rien de neuf à journaliser ; le fait dit
qui a agi, c'est-à-dire la personne connectée.

### Corrections après `vitruve` (2026-10-15), qui priment sur A1–A5

- **`staff_assign_role` renvoie la fiche entière à l'identique** (BLOQUANT).
  `PATCH admin/staff-users/:id` exige toute la fiche (`staff-user.ts:40-56`),
  et des `overrides` absents valent « aucune » : le dépôt **effacerait toutes
  les dérogations** de la personne (`prisma-staff-user.repository.ts:125-141`).
  L'outil relit la `StaffUserView`, ne change que `role`, renvoie identité et
  `overrides` tels quels ; un test prouve qu'aucune dérogation n'est perdue.
- **La garde porte sur le pouvoir, pas sur la clé** (BLOQUANT). Le serveur
  reconnaît un gardien de l'annuaire à `staff_access:write` résolu
  (`staff-mutation-target.ts:24-27,69-72`), et l'écran crée des rôles. L'agent
  refuse donc : un rôle cible dont les droits résolus (`StaffRoleView.permissions`)
  contiennent un `staff_access:*` ; une personne dont les droits résolus
  (`StaffUserView.permissions`, rôle **et** dérogations) en contiennent un ;
  la fiche racine (`isRescue`) ; les clés `superadmin` et `admin` ; soi-même.
- **Pas d'écriture sur un état périmé** (SÉRIEUX). Aucune des deux routes n'a
  de version (`update-staff-role.handler.ts:30-44`). Elles gagnent une
  **précondition facultative** : `PUT …/staff-roles/:key` accepte
  `expectedPermissions` (les droits lus), `PATCH …/staff-users/:id` accepte
  `expectedUpdatedAt` ; si l'état a changé depuis, 409 qui le dit. L'écran ne
  les envoie pas (inchangé) ; les outils les envoient toujours.
- **Dire ce que la garde protège** (SÉRIEUX). Elle vit dans les outils : elle
  empêche une **erreur** de l'agent, elle n'arrête pas un agent hostile, qui a
  la même session et peut appeler les routes directement — comme la personne
  pourrait le faire à l'écran. Il n'y a pas de contrôle d'escalade au serveur
  aujourd'hui (`staff-role-definition.ts:121-131` ne vérifie pas que l'auteur
  tient ce qu'il accorde) : c'est une dette du droit, pas de l'agent, inscrite
  à part.
- **Marquer les gestes d'agent** (SÉRIEUX). Les outils posent l'en-tête
  `x-lfd-agent-tool: <nom de l'outil>` ; les deux routes le lisent et le
  rangent dans le fait de journal (`via: { agentTool }`). Falsifiable, comme
  tout ce qui vient du navigateur : c'est une trace, pas une porte.
- **Aucune route nouvelle en lecture** (SÉRIEUX). `GET admin/staff-users`
  rend déjà `permissions` effectives, `overrides` et `isRescue` résolus par le
  serveur (`staff-user.ts:80-108`), `StaffRoleView.permissions` aussi
  (`staff-role.ts:184-192`). `staff_access_of` et `who_can` les filtrent ;
  l'outil ne recombine **jamais** rôle et dérogations lui-même.
- **Le délai du cache** : le cache d'accès ne se vide que sur l'instance qui
  écrit (`update-staff-role.handler.ts:15-19`) ; l'outil d'écriture dit
  « effectif partout sous 30 secondes », pas « retiré ».
- L'ouverture de `/outils-agent` à `staff_access:read` touche
  `app.routes.ts:213-221` (liste et commentaire), `app.ts` (menu) et
  `__tests__/app.routes.spec.ts`. Un `PUT` de rôle renvoie le libellé relu.

## 3. Doc

un document d’état « outils-agent-droits » dans ce dossier (l'état bâti,
sur le modèle de `outils-agent-vehicules.md`), sa ligne d'index, et la
mention de la trousse dans `ops/outils-agent.md`.

## Contradiction de `vitruve`

_À venir._
