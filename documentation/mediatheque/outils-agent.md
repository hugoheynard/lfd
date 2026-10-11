# Les outils agent de la médiathèque

> **État : bâti, éprouvé par des tests unitaires** (2026-10-11). Pas encore
> éprouvé dans un navigateur contre l'API locale, contrairement à la trousse du
> référentiel ([`../pim/outils-webmcp-pim.md`](../pim/outils-webmcp-pim.md)).

Une seconde trousse WebMCP, déclarée par le même écran **`/outils-agent`** que
celle du référentiel, et selon les mêmes règles : l'écran est l'interrupteur,
les outils n'existent que tant qu'il est ouvert, et ils sont inertes tant
qu'aucun agent ne pose `document.modelContext`.

## Qui les voit

La page ne déclare cette trousse **que si le compte a `media_library:write`** —
le droit que les routes d'écriture de la médiathèque opposent
(`@AdminSurface("media_library")`). Sans lui, la page le dit à la place de la
liste.

La route est gardée par « l'un OU l'autre » de `pim_catalog:write` et
`media_library:write` (2026-10-11), et l'entrée de menu suit la même règle :
un compte qui n'a que la médiathèque y entre et ne voit que sa trousse ; la
page dit laquelle manque.

## Les onze outils

Code : [`agent/media-agent-tools.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/media-agent-tools.ts)
et [`agent/media-agent-vocabulary-tools.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/media-agent-vocabulary-tools.ts),
textes dans `media-agent-text.ts`, refus dans `agent-tool-text.ts` (partagé
avec le référentiel).

| Outil                 | Route                      | Ce qu'il fait                                                    |
| --------------------- | -------------------------- | ---------------------------------------------------------------- |
| `media_search`        | `GET /media`               | le fil filtré et trié, une ligne par image, `next` pour la suite |
| `media_read`          | `GET /media` + `/carriers` | une image en détail et ses porteurs                              |
| `media_describe`      | `PUT /media`               | étiquette, texte alternatif par langue, point focal              |
| `media_colors`        | `GET /media/palette-strip` | la frise du filtre, en texte : période, nombre, dominantes       |
| `media_tags_list`     | `GET /media/tags`          | le vocabulaire et ses comptes                                    |
| `media_tag_add`       | `PUT /media`               | des mots sur une ou plusieurs images                             |
| `media_tag_remove`    | `PUT /media`               | des mots retirés d'images **désignées**                          |
| `media_tag_rename`    | `PUT /media/tags/rename`   | renommer partout — fusionne si le mot existe                     |
| `media_series_list`   | `GET /media/series`        | les séries                                                       |
| `media_series_create` | `POST /media/series`       | ouvrir une série                                                 |
| `media_series_assign` | `PUT /media`               | ranger des images dans une série, ou les en détacher             |

L'identifiant d'une image est son **URL**. Les outils qui écrivent relisent
l'image d'abord par **`GET /media/one?url=`** (même vue qu'une ligne du fil,
404 `media.not_in_library` si elle n'est pas au fonds) : `PUT /media`
remplace étiquette, texte alternatif, tags et point focal ensemble. Un refus HTTP rend le message de
l'enveloppe d'erreur de l'API et son statut, pas « Http failure response ».

## Ce qui n'y est pas, délibérément

- **retirer une image du fonds** — ses octets ne reviennent pas ;
- **retirer un mot-clé de tout le fonds** — on ne retire un mot que des images
  désignées, ce qui se défait image par image ;
- **remplacer A par B** — c'est changer ce qu'affichent la vitrine, les fiches
  et les familles ;
- **déposer** — un agent n'a pas de fichier, seulement des adresses.

## Ce qui reste

- Éprouver la trousse dans un navigateur, pont posé à la main, comme celle du
  référentiel.
