# Les outils agent de l'exploitation

> **État : bâti, éprouvé par des tests unitaires** (2026-10-11). Pas encore
> éprouvé dans un navigateur contre l'API locale.

Une troisième trousse WebMCP, déclarée par l'écran **`/outils-agent`** à côté
du référentiel ([`../pim/outils-webmcp-pim.md`](../pim/outils-webmcp-pim.md)) et
de la médiathèque ([`../mediatheque/outils-agent.md`](../mediatheque/outils-agent.md)),
et selon les mêmes règles : l'écran est l'interrupteur, les outils n'existent
que tant qu'il est ouvert, et ils sont inertes tant qu'aucun agent ne pose
`document.modelContext`.

Elle rend en texte ce que la carte de santé (`/sante`) montre, pour un agent
qui diagnostique.

## Qui les voit

La page ne déclare cette trousse **que si le compte a `ops_health:read`** — le
droit que toutes ses routes opposent (`@AdminSurface("ops_health")`). Sans lui,
la page le dit à la place de la liste.

La route `/outils-agent` et son entrée de menu (rail et tuiles) s'ouvrent à
l'un des quatre droits : `pim_catalog:write`, `media_library:write`,
`ops_health:read` ou, depuis le 2026-10-12, `b2b_companies:read`
([`../b2b/comptes-client/outils-agent-comptes.md`](../b2b/comptes-client/outils-agent-comptes.md)). Un compte qui n'a que la carte de santé y entre et ne voit
que cette trousse.

Depuis le 2026-10-15, l'écran porte aussi la trousse **des droits** — lire
rôles, annuaire et droits effectifs, accorder ou retirer un droit à un rôle,
changer le rôle d'une personne — et la route s'ouvre à `staff_access:read`
([`../droits-et-permissions/outils-agent-droits.md`](../droits-et-permissions/outils-agent-droits.md)).

## Les cinq outils

Code : [`agent/ops-agent-tools.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/ops-agent-tools.ts),
textes dans `ops-agent-text.ts`, client HTTP `ops/ops.service.ts` (celui de
l'écran de santé), refus dans `agent-tool-text.ts`.

| Outil                  | Route                               | Ce qu'il rend                                                                                                   |
| ---------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ops_health`           | `GET /admin/ops/health`             | chaque brique, statut, raison en français, détail ; en panne puis dégradées d'abord                             |
| `ops_traffic`          | `GET /admin/ops/traffic?minutes=`   | par nœud : requêtes, % d'erreurs serveur, p95, rejets du limiteur, cinq surfaces les plus appelées              |
| `ops_capabilities`     | `GET /admin/ops/capabilities/staff` | les capacités éteintes, bloquantes d'abord, avec la conséquence et le **nom** de la variable (jamais sa valeur) |
| `ops_media_thresholds` | `GET /admin/ops/media`              | les seuils de la médiathèque, dépassés d'abord                                                                  |
| `ops_dead_letters`     | `GET /admin/outbox/dead-letters`    | les messages durables non livrés : fait, abonné qui bloque, essais, dernière erreur ; « liste coupée »          |

`ops_traffic` prend une fenêtre de 1 à 1 440 minutes (les bornes du serveur),
5 par défaut comme l'écran ; la fenêtre est bornée côté outil pour que le texte
dise celle qui a été lue. Sa première ligne dit si les chiffres sont une
**répétition** (Analytics Engine non configuré).

Un refus HTTP (403, 5xx) rend le message de l'enveloppe d'erreur de l'API et
son statut, jamais une exception.

## Ce qui n'y est pas, délibérément

**Aucun outil n'écrit.**

- **rejouer un message mort** (`POST /admin/outbox/replay`) relance un abonné
  qui a échoué jusqu'au bout. Décider que la cause est levée est un jugement
  humain, et un agent qui rejoue en boucle multiplie l'effet qu'on cherche à
  comprendre. Le rejeu reste à l'écran de santé ;
- **recalculer** une carte, un seuil ou une fenêtre n'existe pas côté serveur :
  OPS observe, il n'agit pas.

## Ce qui reste

- Éprouver la trousse dans un navigateur, devant un agent réel.
