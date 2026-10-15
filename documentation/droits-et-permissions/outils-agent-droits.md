# Les outils agent des droits

> **État : bâti, éprouvé par des tests unitaires et e2e** (2026-10-15). Pas
> encore éprouvé dans un navigateur contre l'API locale, comme les trousses de
> la flotte ([`../livraisons/chargement/outils-agent-vehicules.md`](../livraisons/chargement/outils-agent-vehicules.md))
> et de la médiathèque. Plan et décisions :
> [`plan-outils-agent-droits.md`](plan-outils-agent-droits.md).

Une sixième trousse WebMCP, déclarée par l'écran **`/outils-agent`** selon les
mêmes règles que les autres ([`../ops/outils-agent.md`](../ops/outils-agent.md)) :
l'écran est l'interrupteur, les outils n'existent que tant qu'il est ouvert, et
ils sont inertes tant qu'aucun agent ne pose `document.modelContext`. Demande
de Hugo (2026-10-15) : lire et régler les droits de l'équipe sans le clic.

## Qui les voit

| Droit                | Ce qui est déclaré                                                             |
| -------------------- | ------------------------------------------------------------------------------ |
| `staff_access:read`  | les cinq lectures — le droit de `GET admin/staff-roles` et `admin/staff-users` |
| `staff_access:write` | en plus, les trois écritures — celui que `PUT` et `PATCH` opposent             |

La route `/outils-agent` et son entrée de menu (rail et tuiles) s'ouvrent
désormais à l'un des **six** droits (`staff_access:read` ajouté :
`app.routes.ts`, `app.ts`, `__tests__/app.routes.spec.ts`). Aucun droit n'est
écrit à un rôle.

## Les huit outils

Code : [`agent/access-agent-tools.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/access-agent-tools.ts)
(lectures), [`agent/access-agent-write-tools.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/access-agent-write-tools.ts)
(écritures), la garde dans [`agent/access-agent-guard.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/access-agent-guard.ts),
le calcul d'un droit dans `access-agent-grants.ts`, les textes dans
`access-agent-text.ts`. Clients : `StaffRolesService` et `StaffUsersService`,
ceux des écrans Rôles et Annuaire.

| Outil               | Route                                    | Ce qu'il fait                                                                    |
| ------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `roles_list`        | `GET admin/staff-roles`                  | les rôles : clé, libellé, état, porteurs, nombre de droits résolus               |
| `role_get`          | `GET admin/staff-roles`                  | les droits résolus d'un rôle, rangés par catégorie de l'écran, avec libellés     |
| `staff_list`        | `GET admin/staff-users`                  | les personnes, leur rôle, leur statut, la fiche de secours                       |
| `staff_access_of`   | `GET admin/staff-users`                  | le rôle, les dérogations et les droits **effectifs** servis                      |
| `who_can`           | les deux `GET`                           | les rôles qui donnent un droit, et qui le tient — par son rôle ou par dérogation |
| `role_grant`        | `GET` puis `PUT admin/staff-roles/:key`  | accorde UN droit à un rôle (l'écriture emporte la lecture)                       |
| `role_revoke`       | `GET` puis `PUT admin/staff-roles/:key`  | retire UN droit : l'écriture laisse la lecture, la lecture retire la ressource   |
| `staff_assign_role` | `GET` puis `PATCH admin/staff-users/:id` | change le rôle d'une personne, le reste de sa fiche intact                       |

- **Aucune recombinaison.** Les lectures rendent ce que le serveur a résolu :
  `StaffRoleView.permissions`, `StaffUserView.permissions`, `overrides`,
  `isRescue`. `who_can` compare des vues servies (le rôle le donne-t-il ? la
  personne le tient-elle ?), il ne rejoue jamais la formule rôle + dérogations.
- **L'entité entière, un seul élément changé.** `PUT` remplace la définition du
  rôle : l'outil renvoie son libellé relu et tous ses autres droits. `PATCH`
  exige toute la fiche, et des `overrides` absents y valent « aucune » :
  `staff_assign_role` renvoie identité et dérogations telles que lues — un test
  prouve qu'aucune dérogation n'est perdue.
- **Une précondition, toujours.** Les outils envoient `expectedPermissions`
  (les droits résolus lus) au `PUT` et `expectedUpdatedAt` (la `updatedAt` de
  la fiche lue) au `PATCH`. Si l'état a changé entre la lecture et l'écriture,
  le serveur refuse (409, `staff.role.changed_since_read` /
  `staff_user.changed_since_read`) et l'outil rend ce refus. L'écran ne les
  envoie pas : il écrit comme avant.
- **Le délai dit honnêtement.** Le cache d'accès n'est vidé que sur l'instance
  qui écrit : chaque écriture rend l'état relu et dit « effectif partout sous
  30 secondes ».
- **La trace.** Les outils posent `x-lfd-agent-tool: <nom>` ; les deux routes le
  lisent (forme d'un nom d'outil, sinon ignoré) et le rangent dans leurs faits
  de journal en `via: { agentTool }` — `staff_role.updated`, et les trois faits
  d'édition d'une fiche. La phrase du journal finit par « … via l'outil agent
  role_grant ». La passerelle recopie les en-têtes de la requête vers l'API, et
  le CORS de l'API reflète ceux que le navigateur annonce (lu le 2026-10-15).

## La garde — ce que l'agent ne touche pas

Refusé **avant tout appel d'écriture**, avec la raison :

- tout droit `staff_access:*` à accorder ou retirer ;
- un rôle cible dont les droits résolus contiennent un `staff_access:*` — la
  garde porte sur le **pouvoir**, pas sur la clé, puisque l'écran crée des
  rôles ;
- les clés `superadmin` et `admin` : ni modifiées, ni assignées, et personne
  qui les tient ne change de rôle par l'agent ;
- une personne dont les droits résolus (rôle **et** dérogations) contiennent
  un `staff_access:*`, et la fiche de secours (`isRescue`) ;
- soi-même : le rôle de la personne connectée ne se modifie pas, et elle ne
  change pas de rôle ;
- un rôle archivé ne s'assigne pas.

🔴 **Ce que la garde protège, et ce qu'elle ne protège pas.** Elle vit dans
les outils : elle empêche une **erreur** de l'agent. Elle n'arrête pas un
agent hostile, qui a la même session et peut appeler les routes lui-même —
comme la personne pourrait le faire à l'écran. Le serveur reste la porte. Et
il a une dette qui n'est pas celle de l'agent : il ne vérifie pas qu'un auteur
tient ce qu'il accorde (`StaffRoleDefinition.redefine` ne contrôle pas
l'escalade, lu le 2026-10-15) — qui tient `staff_access:write` peut se donner
n'importe quel droit, à l'écran comme par une route.

## Ce qui n'y est pas, délibérément

- **créer ou archiver un rôle, inviter, suspendre, supprimer** — des gestes
  d'écran ;
- **poser ou retirer une dérogation** — `staff_assign_role` les garde telles
  quelles, aucun outil ne les écrit.

## Ce qui reste

- Éprouver la trousse dans un navigateur, pont posé à la main.
- La précondition de la fiche se lit avant l'écriture sans verrou de ligne :
  deux éditions simultanées au même instant peuvent encore se croiser. Celle
  du rôle est verrouillée (`SELECT … FOR UPDATE` dans la transaction).
- Le contrôle d'escalade au serveur — dette du droit, à inscrire à part.
