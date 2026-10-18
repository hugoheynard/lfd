# Les outils agent des suggestions décidées

> **État : bâti, éprouvé par des tests unitaires** (2026-10-18, lot RS1 de
> [`plan-suggestions-du-staff.md`](plan-suggestions-du-staff.md)). Pas encore
> éprouvé dans un navigateur contre l'API locale, comme la trousse de la flotte
> ([`../livraisons/chargement/outils-agent-vehicules.md`](../livraisons/chargement/outils-agent-vehicules.md)).

Une septième trousse WebMCP, déclarée par l'écran **`/outils-agent`** selon les
mêmes règles que les autres : l'écran est l'interrupteur, les outils n'existent
que tant qu'il est ouvert, et ils sont inertes tant qu'aucun agent ne pose
`document.modelContext`. Demande de Hugo (2026-10-18) : « on peut faire tout
l'admin recommandation staff ».

## Qui les voit

| Droit                   | Ce qui est déclaré                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `lfc_suggestions:read`  | `suggestion_list`, `suggestion_order_get`, `suggestion_preview`, `suggestion_results` — les lectures de l'écran |
| `lfc_suggestions:write` | en plus, les cinq outils d'écriture — le droit que `POST`/`PUT` opposent                                        |

La route `/outils-agent` et son entrée de menu s'ouvrent désormais à l'un des
**sept** droits (`lfc_suggestions:read` ajouté). Aucun droit n'est écrit à un
rôle : `lfc_suggestions` s'accorde à l'écran des rôles.

## Les neuf outils

Code : [`agent/suggestion-agent-tools.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/suggestion-agent-tools.ts),
textes dans [`agent/suggestion-agent-text.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/suggestion-agent-text.ts),
refus par `said` (`agent-tool-text.ts`, partagé). Client : `StaffSuggestionsService`,
celui de l'écran Gestion Boutique › Suggestions.

| Outil                   | Route                                  | Ce qu'il fait                                                                                |
| ----------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `suggestion_list`       | `GET admin/suggestions` (+ `choices`)  | chaque règle (id, état, phrase, déclencheur, articles…), puis le catalogue servi             |
| `suggestion_order_get`  | `GET admin/suggestions/order`          | l'ordre entre règles concurrentes : `recent` ou `priority`                                   |
| `suggestion_preview`    | `POST admin/suggestions/preview`       | l'aperçu (RS5) : la carte que verrait le client, puis chaque règle « Affichée » ou sa raison |
| `suggestion_results`    | `GET admin/suggestions/results`        | les chiffres (RS6) sur 7, 30 ou 90 jours : comptés, taux d'ajout, commandées et CA estimés   |
| `suggestion_create`     | `POST admin/suggestions`               | crée une règle, née active, et la rend relue                                                 |
| `suggestion_update`     | `GET` puis `PUT admin/suggestions/:id` | réécrit par `id` : un champ omis garde sa valeur                                             |
| `suggestion_set_active` | `PUT admin/suggestions/:id/active`     | coupe ou rallume, sans rien supprimer                                                        |
| `suggestion_archive`    | `PUT admin/suggestions/:id/archive`    | retire pour toujours ; une archivée ne se modifie plus                                       |
| `suggestion_order_set`  | `PUT admin/suggestions/order`          | règle l'ordre, journalisé                                                                    |

Les refus sont ceux de l'agrégat `StaffSuggestionRule`, rendus mot pour mot :
déclencheur suggéré, emplacement où le déclencheur ne peut pas être vrai, fin
déjà passée à la création, article ou famille hors du catalogue servi.

`suggestion_preview` (RS5, 2026-10-18) prend un emplacement (`cart` avec
`cartSkus`, ou `product` avec `viewedSku`), une clientèle (`public` ou `pro`)
et un jour ; il rend la carte exacte (titre, articles, prix HT au pro, TTC au
particulier — au pro, la vitrine sans tarif de société), puis une ligne par
règle non archivée avec son statut en code (`[ended]`, `[outranked_by]`…) et
en clair. Code : [`agent/suggestion-preview-agent-tool.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/suggestion-preview-agent-tool.ts).

`suggestion_results` (RS6, 2026-10-18) prend `days` (7, 30 ou 90 ; 30 par
défaut) et rend la période, l'aide qui explique l'estimation, puis une ligne
par règle : affichée, cliquée, ajoutée, taux d'ajout, **commandées (estimé)**
et **CA HT apporté (estimé)** en euros. L'estimation est celle de l'écran,
décrite au bandeau RS6 de [`plan-suggestions-du-staff.md`](plan-suggestions-du-staff.md) :
les compteurs ne nomment personne, une commande ne se relie pas à un clic.
Code : [`agent/suggestion-results-agent-tool.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/suggestion-results-agent-tool.ts).
