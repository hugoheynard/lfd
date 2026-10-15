# Les outils agent de la flotte

> **État : bâti, éprouvé par des tests unitaires** (2026-10-14). Pas encore
> éprouvé dans un navigateur contre l'API locale, comme la trousse de la
> médiathèque ([`../../mediatheque/outils-agent.md`](../../mediatheque/outils-agent.md)).

Une cinquième trousse WebMCP, déclarée par l'écran **`/outils-agent`** selon
les mêmes règles que les autres : l'écran est l'interrupteur, les outils
n'existent que tant qu'il est ouvert, et ils sont inertes tant qu'aucun agent
ne pose `document.modelContext`. Demande de Hugo (2026-10-14) : créer et
corriger les véhicules sans le clic, sur le modèle de la médiathèque.

## Qui les voit

| Droit                     | Ce qui est déclaré                                                     |
| ------------------------- | ---------------------------------------------------------------------- |
| `delivery_settings:read`  | `vehicle_list` — le droit de lecture de `GET admin/delivery/vehicles`  |
| `delivery_settings:write` | en plus, les trois outils d'écriture — celui que `POST`/`PUT` opposent |

Sans la lecture, la page le dit à la place de la liste ; avec la lecture
seule, elle dit que la flotte n'est pas modifiable. La route `/outils-agent`
et son entrée de menu s'ouvrent désormais à l'un des **cinq** droits
(`delivery_settings:read` ajouté). Aucun droit n'est écrit à un rôle.

## Les quatre outils

Code : [`agent/vehicle-agent-tools.ts`](../../../apps/lfd-backoffice-frontend/src/app/agent/vehicle-agent-tools.ts),
textes dans [`agent/vehicle-agent-text.ts`](../../../apps/lfd-backoffice-frontend/src/app/agent/vehicle-agent-text.ts),
refus par `said` (`agent-tool-text.ts`, partagé). Client : `DeliverySettingsService`,
celui de l'écran Réglages → Livraison → Véhicules.

| Outil                 | Route                                        | Ce qu'il fait                                                                   |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| `vehicle_list`        | `GET admin/delivery/vehicles` (+ zones)      | la flotte, actifs puis retirés, et pour chacun ses avertissements (`gaps`)      |
| `vehicle_create`      | `POST admin/delivery/vehicles`               | ajoute un véhicule — seul le nom est obligatoire — et rend la fiche relue       |
| `vehicle_create_many` | `POST`, une fois par véhicule                | plusieurs véhicules, une ligne chacun ; un refus n'arrête pas les autres        |
| `vehicle_update`      | `GET` puis `PUT admin/delivery/vehicles/:id` | corrige par `id` : un champ omis garde sa valeur, `clear` nomme ce qu'on efface |

Les champs sont ceux de `vehiclePayloadSchema` : `name`, `plate`, `cargo`,
`wheelArches`, `refrigeration`, `energy`, `allowedZoneIds`. Les règles (plaque
normalisée et unique, bornes des cotes, passages de roue sans plancher, froid
plus grand que le volume) sont celles du domaine : l'outil n'en revalide
aucune, il rend le message du serveur et son statut.

- **Les avertissements** sont les phrases de `vehicleGaps` (2026-10-14) que le
  serveur range dans la vue : chaque écriture relit la flotte et rend la fiche
  avec eux — ce que l'écran afficherait sous le véhicule.
- ⚠️ **`PUT` remplace la fiche entière**, et un champ absent y vaut `null`
  (contrat). `vehicle_update` relit donc le véhicule, pose ce qui est donné,
  efface ce que `clear` nomme, et renvoie TOUT. Effacer `cargo` efface les
  passages de roue ; des passages donnés sans plancher partent tels quels, et
  le domaine les refuse en nommant le cas.
- Les zones sont nommées par la liste des zones du commerce ; si elle ne se lit
  pas, elles sont comptées sans être nommées (`zonesLine`), et leurs
  identifiants restent dans le texte.

## Ce qui n'y est pas, délibérément

- **retirer ou réactiver un véhicule** — sortir un véhicule de la flotte change
  ce que la composition peut proposer, et reste un geste de l'écran.

## Ce qui reste

- Éprouver la trousse dans un navigateur, pont posé à la main.
