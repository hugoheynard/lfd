# Le droit des procédures de livraison — `delivery_procedures`

> 📐 **Plan, rien n'est bâti** (2026-10-01). Hugo : « procédure de livraison
> read/write devrait être un droit à part », puis « comptoir en read, c'est
> commercial qui fait les write, seulement commercial ».
>
> Frontière de sécurité qui se déplace : **`vitruve` avant de bâtir**.
> Se bâtit **après** la route photo du livreur
> ([`plan-ma-tournee.md`](plan-ma-tournee.md)), qui touche le même chemin de
> lecture.

## 1. Aujourd'hui (relevé le 2026-10-01)

La procédure d'une adresse (étapes, photos) se lit et s'écrit, côté staff, par
`apps/lfd-api/src/b2b/account/http/admin-company-delivery-procedure.controller.ts`,
sous **`b2b_companies`** — le droit des fiches de sociétés. Côté client,
`company-delivery-procedure.controller.ts` (le client sur ses propres adresses)
n'est pas concerné.

`b2b_companies` dans `ROLE_GRANTS` (contrat ; la base fait foi au runtime) :

| Rôle                         | `b2b_companies` |
| ---------------------------- | --------------- |
| admin                        | write           |
| commercial                   | write           |
| comptabilite                 | read            |
| support                      | read            |
| comptoir, communication, dev | —               |

## 2. Décisions

### DP-D1 — Une ressource `delivery_procedures`

Les routes staff de la procédure (lecture, ajout, modification, réordre,
suppression d'étape, photo) passent de `b2b_companies` à
`delivery_procedures`. Le reste de la fiche société reste sous
`b2b_companies`.

### DP-D2 — Qui l'a (Hugo, 2026-10-01)

| Rôle               | `delivery_procedures` | Changement                                                        |
| ------------------ | --------------------- | ----------------------------------------------------------------- |
| admin              | write                 | invariant « l'admin couvre tout »                                 |
| **commercial**     | **write**             | inchangé dans les faits                                           |
| **comptoir**       | **read**              | **gagne** la lecture (il prépare les départs)                     |
| comptabilite       | —                     | 🔴 **perd** la lecture qu'il tenait par `b2b_companies`           |
| support            | —                     | 🔴 **perd** la lecture qu'il tenait par `b2b_companies`           |
| livreur            | —                     | voit la procédure de **ses** arrêts seulement, par sa route murée |
| communication, dev | —                     | inchangé                                                          |

Les deux pertes sont **voulues** (« seulement commercial ») et se disent dans la
migration. Un rôle créé à l'écran, et les dérogations existantes sur
`b2b_companies`, ne reçoivent rien automatiquement : à relever en production
avant la mise en ligne (`SELECT key, grants FROM staff_role_definitions` et
les dérogations sur `b2b_companies`), pour décider au cas par cas.

### DP-D3 — Migrations

Deux, comme tout ajout de ressource : la valeur `StaffResource.delivery_procedures`
seule ; puis les droits des rôles du tableau, idempotents, au format relu par
`staff-role-grants-parity.e2e-spec.ts`. `ROLE_GRANTS` du contrat suit.

### DP-D4 — Le front

Les écrans qui montrent ou éditent une procédure côté staff (fiche société,
feuille de route) testent `delivery_procedures` au lieu de `b2b_companies`. La
feuille de route du comptoir montrait déjà les procédures par sa propre lecture
(`PrismaDeliveryRunSheetReader`) : à vérifier qu'elle ne dépend pas du droit
retiré.

## 3. Lot

**DP1** — ressource, migrations, routes, contrats, front, e2e : le
commercial écrit ; le comptoir lit et prend 403 à l'écriture ; le support et la
comptabilité prennent 403 ; le livreur prend 403 sur la route staff et lit
toujours ses arrêts.
