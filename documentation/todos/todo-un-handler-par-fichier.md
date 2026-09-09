# Un seul handler par fichier — 24 à découper

**Ouvert le 2026-09-09**, en posant `lint:handler-per-file`. 🟡 Dette **gelée**,
pas ouverte : la porte refuse un fichier de plus, et refuse aussi qu'un fichier
nettoyé reste inscrit. La liste ne peut que se vider.

## Pourquoi c'est une règle, et pas une préférence

`CLAUDE.md` §4 : « Un handler fait **une** chose. S'il grossit, on extrait un
service de domaine ou un helper pur — on n'y ajoute pas de branche. »

Le fichier qui porte six handlers ne fait pas six fois une chose : il devient
**l'endroit où l'on ajoute la septième**. Parce qu'il est déjà là, parce que
l'import existe, parce que « c'est le même agrégat ». C'est la pente qui a
produit `admin-address.handlers.ts`.

Ce que ça coûte, et ce n'est pas esthétique :

- **la recherche** — « où est traité `CloseVolumeCommitment` ? » ne se répond
  plus par un nom de fichier ;
- **le diff** — deux intentions sans rapport se touchent dans le même fichier,
  donc dans le même conflit de fusion ;
- **le test colocalisé** — la spec voisine éprouve six cas et ne dit plus lequel
  n'est pas couvert. C'est là que le trou se cache.

## Les deux styles restent acceptés

La porte compte des **décorateurs**, elle ne tranche pas entre les
organisations que `CLAUDE.md` §4 décrit et interdit de mélanger :

- **B2B** — `create-company.command.ts` + `create-company.handler.ts` ;
- **PIM** — `create-product.ts`, la commande et son handler colocalisés.

Les deux respectent « un fichier, un handler ». Découper ne veut donc **pas**
dire migrer un contexte vers l'autre style : le PIM garde ses fichiers par cas,
le B2B garde ses fichiers séparés.

## L'inventaire, au 2026-09-09

244 fichiers portent un handler ; **220 n'en portent qu'un**. Les 24 restants,
par nombre décroissant :

| Fichier (sous `apps/lfd-api/src/`)                                | Handlers |
| ----------------------------------------------------------------- | -------- |
| `b2b/account/application/commands/admin-address.handlers.ts`      | 6        |
| `staff/permissions/application/staff-role.handlers.ts`            | 5        |
| `b2b/account/application/commands/admin-contact.handlers.ts`      | 4        |
| `b2b/catalog/application/commands/catalog-decision.handlers.ts`   | 4        |
| `b2b/order-cutoffs/application/order-cutoff.handlers.ts`          | 4        |
| `b2b/payments/application/mandate.handlers.ts`                    | 4        |
| `b2b/pickup-addresses/application/pickup-address.handlers.ts`     | 4        |
| `b2b/pricing/application/commands/pricing.handlers.ts`            | 4        |
| `b2b/pricing/application/commands/rule-lifecycle.handlers.ts`     | 4        |
| `b2b/pricing/application/commands/volume-ladder.handlers.ts`      | 4        |
| `staff/directory/application/staff-user.handlers.ts`              | 4        |
| `b2b/account/application/commands/admin-company.handlers.ts`      | 3        |
| `b2b/delivery-zones/application/delivery-zone.handlers.ts`        | 3        |
| `b2b/order-waivers/application/order-cutoff-waiver.handlers.ts`   | 3        |
| `b2b/order-waivers/application/order-late-fee.handlers.ts`        | 3        |
| `b2b/pricing/application/commands/company-mercuriale.handlers.ts` | 3        |
| `pim/ingredients/application/appellation-handlers.ts`             | 3        |
| `pim/ingredients/application/ingredient-handlers.ts`              | 3        |
| `b2b/account/application/commands/certify-kbis.handler.ts`        | 2        |
| `b2b/growth/application/handlers/on-support-activity.handler.ts`  | 2        |
| `b2b/pricing/application/commands/price-template.handlers.ts`     | 2        |
| `b2b/pricing/application/commands/volume-commitment.handlers.ts`  | 2        |
| `production/application/queries/get-production-paper.handler.ts`  | 2        |
| `staff/invitations/pending-staff-access.ts`                       | 2        |

## Par où commencer, et par où NE PAS commencer

**Les `*.handlers.ts` au pluriel se découpent seuls** : le nom annonce déjà le
défaut, et chaque handler y est indépendant. Un fichier par cas, le test
colocalisé suit, et le module ne change que sa liste de providers.

⚠️ **Les quatre fichiers au singulier ne sont PAS le même sujet.**
`certify-kbis.handler.ts`, `on-support-activity.handler.ts`,
`get-production-paper.handler.ts` et `pending-staff-access.ts` portent deux
handlers qui **partagent quelque chose** — une garde, un état, une projection.
Les séparer sans regarder ce qu'ils partagent déplacerait le couplage dans un
import au lieu de le retirer. Les lire avant de les couper.

## Ce que ce TODO ne demande pas

**Aucun découpage en urgence.** Rien de tout ça ne produit un prix faux ni une
faille : c'est une dette de lisibilité, et la porte suffit à l'empêcher de
grandir. Le bon moment pour couper un de ces fichiers est **le jour où on
l'ouvre pour autre chose**.
