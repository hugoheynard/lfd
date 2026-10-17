# Plan — `lfc_catalog` remplace `b2b_catalog`

> 🔨 **L2 bâti le 2026-10-16** (non commité à l'écriture de ce bandeau).
> **Décision de Hugo (2026-10-16), option (a)** : la fenêtre sans catalogue
> est acceptée — il retire `b2b_catalog` à l'écran, puis déploie L2 dans la
> foulée (runbook, « Transférer le droit du catalogue », étape 5).
>
> - **Gardes** : les quatre `@AdminSurface` de `b2b/catalog/http/` sur
>   `lfc_catalog` ; front : `permissionGuard` de `/b2b/reception`, rail
>   (`workspaces.ts`), les deux `*appCan`, et leurs specs. Commentaires
>   porteurs redatés.
> - **`RETIRED_STAFF_RESOURCES`** (`packages/contracts/src/staff-access.ts`,
>   avec `isRetiredStaffResource` et `GRANTABLE_STAFF_RESOURCES`) :
>   `b2b_catalog` reste dans `staffResourceSchema`. Ignoré à la résolution
>   **dans `resolvePermissionsFromGrants`** — la fonction pure que le résolveur
>   appelle par `resolveHeldRole` — plutôt que dans
>   `prisma-staff-access.resolver.ts` même : l'écran des rôles, la fiche staff
>   et le guard rendent ainsi la même réponse. Exclu de
>   `ALL_STAFF_PERMISSIONS` : le sommet ne le tient plus non plus.
> - **Jamais accordé** : `StaffRoleDefinition` (création et redéfinition) et
>   la charge d'une fiche staff refusent une ligne retirée NOUVELLE ou au
>   niveau/effet changé (400 `staff.resource_retired`,
>   `apps/lfd-api/src/staff/permissions/domain/retired-resources.ts`) ; une ligne gardée à
>   l'identique passe — la fiche ou le rôle renvoyé entier reste
>   enregistrable. À l'écran (grille des rôles, grille des dérogations), la
>   ressource retirée n'apparaît que si elle est portée, badge « Retiré — à
>   enlever », et ne propose que son niveau actuel ou l'absence. Les outils
>   agent ne la connaissent plus.
> - **Graine** : `ROLE_GRANTS` ne donne plus `b2b_catalog`. Libellé
>   « Catalogue vendu (retiré) » ; portées réécrites (plus de prix).
> - **Notifications** : aucun émetteur n'adressait `b2b_catalog:*` (vérifié
>   le 2026-10-16) ; le port `StaffNotice.audience` le dit.
> - **L'aperçu L1 reste.**
>
> Écart : le type `StaffNotice.audience` n'exclut pas la ressource retirée —
> essayé, il remonte dans tous les émetteurs qui construisent leur audience
> par `staffPermission()` (dont `src/delivery/`, hors périmètre).

> 🔨 **L1 bâti le 2026-10-16** (non commité à l'écriture de ce bandeau) :
> migration `20261016100000_le_droit_du_catalogue_publie` (l'`ALTER TYPE`
> seul) ; `lfc_catalog` dans `staffResourceSchema`, libellé « Catalogue
> publié », portées ; graine `ROLE_GRANTS` (admin et commercial en écriture,
> comptabilité en lecture, `b2b_catalog` gardé) ; l'aperçu
> `GET /admin/staff-access/catalog-right-transfer`
> (`src/staff/permissions/`, contrat `packages/contracts/src/catalog-right-transfer.ts`) et sa carte
> sur Admin › Rôles ; la section du runbook. Les gardes n'ont pas bougé.
> **Écarts au plan, à trancher avant L2** :
>
> - **Une fenêtre sans catalogue.** La condition de L2 (vitruve) exige que
>   `b2b_catalog` soit RETIRÉ avant de basculer les gardes, qui sont encore sur
>   lui : entre ce retrait et le déploiement de L2, les écrans du catalogue
>   sont fermés à ceux qui l'ont perdu. Le runbook le dit ; le plan ne le
>   disait pas.
> - `RETIRED_STAFF_RESOURCES` n'est pas créée : rien ne la lit en L1.
> - **Points « non vérifiés », ouverts le 2026-10-16** : le front ne parse
>   aucune fiche staff par Zod ; le serveur parse la charge d'édition d'une
>   fiche (`staffUserPayloadSchema` → `staffOverrideSchema`) — en L2, une
>   fiche qui porte encore une dérogation `b2b_catalog` et qu'on renvoie
>   entière doit rester acceptée, ou l'écran ne pourra plus la retirer ;
>   `audience` n'est jamais parsée (chaîne comparée par `IN`) ;
>   `roles.seed.ts` écrit `legacyRoleSeeds()` sans relire, rien à craindre ;
>   la porte `lint:no-role-grants-in-migrations` ne lit que les noms des deux
>   tables hors commentaires — l'`ALTER TYPE` seul passe ; le cache d'accès
>   vit dans `prisma-staff-access.resolver.ts` (TTL 30 s), pas à
>   `staff-access.policy.ts:153`, qui compare des dérogations.
>
> 📐 Rédigé le 2026-10-16 en doc-first. Déplace un
> **périmètre de permissions** : `vitruve` d'office avant Hugo (CLAUDE.md
> §9 bis). Contredit le même jour ; ses corrections, en fin de document,
> priment sur C1–C5.

## 0. La demande (Hugo, 2026-10-16)

> « On pourrait plutôt faire un `lfc_catalog`, vu que c'est une gestion
> b2b b2c maintenant ? »

Le déclencheur : l'écran des opérations au commerce (lot 3 bis,
[`../operations-datees/plan-l-operation-passe-au-commerce.md`](../operations-datees/plan-l-operation-passe-au-commerce.md))
choisit sa sélection dans `GET /admin/catalog`, gardé par `b2b_catalog`.

## 1. Ce qui existe (ouvert le 2026-10-16)

- **La ressource** est une valeur de l'enum Postgres `StaffResource`
  (`prisma/schema/public/staff.prisma:74`) et de `staffResourceSchema`
  (`packages/contracts/src/staff-access.ts:167`). Libellé « Catalogue
  vendu » (l. 653), portées dans `staff-resource-scopes.ts:89`. Son JSDoc
  dit « le catalogue **vendu** : prix négocié, masquage, mise en avant,
  parité » — le prix négocié n'y est plus depuis le lot D.
- **Les droits accordés** vivent en base, en JSON
  (`staff_role_definitions`) et en lignes (`staff_permission_overrides.resource`,
  typée par l'enum). Les graines `ROLE_GRANTS` la donnent en écriture au
  commercial et à deux autres rôles (`staff-access.ts:772`, `:866`, `:935` en
  lecture).
- **Les gardes serveur** : `@AdminSurface("b2b_catalog")` sur quatre
  contrôleurs de `b2b/catalog/http/` (`admin-catalog`, `admin-catalog-parity`,
  `admin-catalog-operations`, `admin-catalog-delivery`). D'autres fichiers ne
  la citent qu'en commentaire (`ops-catalog-health`, `admin-storefront`,
  `check-catalog-parity.service`, `admin-operations`).
- **Le front** : `permissionGuard('b2b_catalog:read')` (`b2b.routes.ts:181`),
  l'entrée du rail (`workspaces.ts:676`), deux `*appCan` (`b2b-page.html`,
  received-operations.html:29 (retiré en X2)), et des commentaires.
- **Le précédent** : `lfc_legal` et `lfc_operations` ont été ajoutés
  (migrations `20261015500000_le_droit_du_legal`,
  `20261015800000_le_droit_des_operations`) par un `ALTER TYPE … ADD VALUE`,
  seul dans sa migration, sans aucun droit accordé.
- **La règle** : une migration n'écrit jamais `staff_role_definitions` ni
  `staff_permission_overrides` (`lint:no-role-grants-in-migrations`). Réécrire
  `b2b_catalog` en `lfc_catalog` dans les droits accordés serait exactement
  ça.

## 2. Décisions proposées

### C1 — Une ressource neuve, pas un renommage

`lfc_catalog` s'ajoute à l'enum par sa propre migration, sur le modèle de
`lfc_operations`. Libellé « Catalogue publié » (le nom de l'écran depuis le
lot 3 du catalogue synchronisé). JSDoc : ce qu'on vend, à qui (pro et
public) et comment ça s'affiche — masquage, mise en avant, validation des
arrivées, parité, réception. Pas le prix : il se décide au référentiel
depuis le lot D.

### C2 — Le transfert des droits, à l'écran

Aucune migration ne recopie les droits. Hugo accorde `lfc_catalog` à
l'écran (`/admin/staff-roles`) aux rôles et dérogations qui tiennent
`b2b_catalog`, **au même niveau** (lecture ou écriture). Pour que le geste
soit sûr :

- un **aperçu** en lecture seule, `GET /admin/staff-access/catalog-right-transfer`
  sous `staff_access:read`, liste chaque rôle et chaque dérogation qui tient
  `b2b_catalog` avec son niveau, et dit s'il tient déjà `lfc_catalog` au même
  niveau ; il rend aussi les notifications dont l'audience porte
  `b2b_catalog:*` ;
- le runbook dit l'ordre : déployer → accorder à l'écran en suivant l'aperçu
  → l'aperçu ne liste plus aucun écart → seulement alors, le déploiement qui
  bascule les gardes (C3).

Pas de geste « tout recopier » : un bouton qui écrit des droits en masse est
un raccourci que la règle refuse aux migrations pour une bonne raison.

### C3 — La bascule des gardes, un seul déploiement

Pré-release (§0) : les gardes passent de `b2b_catalog` à `lfc_catalog` dans
le même déploiement, serveur et front, sans période où les deux sont admis.
Accepter les deux à la fois ferait d'un droit retiré un droit encore tenu.

- les quatre `@AdminSurface`, et les commentaires qui la citent ;
- le front : garde de route, rail, `*appCan`, commentaires ;
- `ROLE_GRANTS` (graine) donne `lfc_catalog` là où il donnait `b2b_catalog` ;
- les portées (`staff-resource-scopes.ts`) et le libellé.

### C4 — L'ancienne valeur

`b2b_catalog` reste dans l'enum Postgres (Postgres n'ôte pas une valeur
d'enum ; §0 : rien ne se supprime en production sans ordre). Elle sort de
`staffResourceSchema` et de l'écran des rôles. Une ligne de droit qui la
porte encore est **ignorée à la résolution**, et le nombre de ces lignes
est rendu par l'aperçu de C2. Leur effacement est une ligne du grand ménage,
sur ordre de Hugo.

### C5 — Les opérations

`lfc_catalog:read` est ce qu'il faut à un gestionnaire d'opérations pour
choisir ses articles. Il s'accorde à l'écran, comme le reste : aucune route
du catalogue sous `lfc_operations`.

## 3. Lots

| Lot | Contenu                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Migration de l'enum ; `lfc_catalog` dans les contrats (schéma, libellé, portées) ; l'aperçu de C2 ; la graine ; le runbook. Les gardes restent sur `b2b_catalog`. |
| —   | Geste de Hugo : accorder `lfc_catalog` à l'écran jusqu'à un aperçu sans écart.                                                                                    |
| L2  | La bascule des gardes (C3) et la sortie de `b2b_catalog` du schéma (C4).                                                                                          |

## 4. Risques

- **Un accès perdu** : un rôle oublié dans le transfert perd le catalogue au
  déploiement de L2. L'aperçu sans écart est la condition de L2.
- **Un accès gagné** : aucun, si le transfert se fait au même niveau.
- **Les notifications** adressées par droit (`audience`) : une notification
  passée sous `b2b_catalog:*` deviendrait invisible après L2.
- **Les outils agent** des droits lisent la liste des ressources : la
  nouvelle y entre d'elle-même ; l'ancienne en sort.

## 5. Questions à Hugo — tranchées le 2026-10-16

1. **Libellé « Catalogue publié »** : oui.
2. **Pas de transfert en masse** : oui, l'aperçu et l'écran.
3. **Les notifications non lues sous `b2b_catalog:*`** à la bascule :
   perdues, sans réadressage.

## Contradiction de `vitruve` (2026-10-16), qui prime sur C1–C5

Les deux BLOQUANT ont été rouverts dans le code avant d'être intégrés.

- **Retirer `b2b_catalog` du schéma viderait des rôles entiers** (BLOQUANT).
  Les droits d'un rôle sont relus en bloc par `roleGrantsSchema`
  (`packages/contracts/src/staff-role.ts:118`, ressource typée par
  `staffResourceSchema`) : une valeur inconnue fait échouer le tableau
  entier, et `heldRoleGrants` rend alors **aucun droit**
  (`staff/permissions/infrastructure/held-role.ts:99-103`). Le commercial
  perdrait tout au déploiement de L2, et l'aperçu « sans écart » de C2 était
  atteint précisément dans cet état. **Correction de C4** : `b2b_catalog`
  **ne sort jamais** de `staffResourceSchema`. Il entre dans une liste
  `RETIRED_STAFF_RESOURCES` : lu sans erreur, ignoré à la résolution, jamais
  proposé à l'accord, montré à l'écran des rôles comme « retiré » avec le
  seul geste de le retirer.
- **L'écran des rôles tomberait en 500** (BLOQUANT) :
  `prisma-staff-role.repository.ts:134` fait un `parse` qui lève. Même
  correction : la valeur reste lisible, donc l'écran reste le chemin de
  sortie, sans SQL.
- **La condition de L2 change** : l'aperçu n'est « sans écart » que lorsque
  **aucun** rôle ni dérogation ne porte plus `b2b_catalog`, et que chacun
  tient `lfc_catalog` au même niveau **et au même effet**. Le geste de Hugo
  est donc : accorder `lfc_catalog`, puis retirer `b2b_catalog`, rôle par
  rôle.
- **Les dérogations** (SÉRIEUX) ne passent pas par Zod : le résolveur
  recopie la ressource telle quelle (`prisma-staff-access.resolver.ts:47`,
  `:133`), et la fiche staff la renvoie
  (`prisma-staff-user.repository.ts:88`). Le filtre des ressources retirées
  vit dans le résolveur ; la fiche les rend marquées « retirée », et le
  contrat front les accepte (à vérifier au lot : son schéma Zod).
- **Les retraits** (SÉRIEUX) : une dérogation qui retire `b2b_catalog` à une
  personne, non recopiée sur `lfc_catalog`, lui **donnerait** l'accès dès
  que son rôle le reçoit. L'aperçu liste l'effet de chaque dérogation, et un
  retrait non recopié compte comme un écart. Le §4 « aucun accès gagné »
  n'était vrai qu'à cette condition.
- **L'inventaire de L2** (SÉRIEUX) s'ajoute :
  packages/contracts/src/catalog-operations.ts:10 (retiré en X2),
  received-operations.service.ts:13 (retiré en X2), `storefront.service.ts:25`
  (commentaires porteurs, à redater) ; trois e2e qui sèment le droit
  (`catalog-delivery-review`, `storefront-catalog`,
  `operations-at-commerce-closed`) ; les specs front `resource-tools`,
  `workspace-counter`, `b2b-page`, `app.routes`.
- **Les notifications par audience** (SÉRIEUX) : L2 adresse les nouvelles
  sous `lfc_catalog:*`. Les anciennes sous `b2b_catalog:*` ne sont plus
  visibles ; l'aperçu compte celles qui restent **non lues** — question à
  Hugo (§5, Q3).
- **Irréversible, sans gravité** : la valeur d'enum de L1 reste. L2 se
  défait en redéployant, tant que les rôles n'ont pas perdu `b2b_catalog`
  à l'écran ; après, le retour passe par l'écran.
- **Mineurs** : `staffResourceSchema` commence à `staff-access.ts:61` ; un
  rôle `admin` (non calculé) reçoit aussi `lfc_catalog` à l'écran, la fiche
  racine résout toujours superadmin ; aucun outil agent ne lit la liste
  côté serveur hors `staff-role-facts.ts` (§4 corrigé par cette ligne).

**Non vérifié, à ouvrir au premier jour du lot** : le schéma Zod de la
fiche staff côté front, le parse de `audience`, `roles.seed.ts` face à une
ressource retirée, la porte `lint:no-role-grants-in-migrations` sur un
`ALTER TYPE` seul, et le cache d'accès (`staff-access.policy.ts:153`).
