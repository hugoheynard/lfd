# Plan — vider les alternatives qui sont des URL

> **Doc-first, NON appliqué** (2026-10-26). Migration de données : à contredire
> par `vitruve` avant Hugo (CLAUDE.md §9 bis). Rien n'a été écrit en base.

## Le constat

Pré-audit RGAA de la boutique (2026-10-26, [grille](../accessibilite/grille-audit-rgaa.md)) :
58 images sur 89 annoncées par leur URL. La cause était à la médiathèque, aux
**deux** bouts :

- **à l'écriture** : le dépôt rangeait `alt = { fr: <url> }` faute d'auteur, et
  une description laissée vide retombait sur l'URL (`mediaAltOrUrl`, contrat
  `@lfd/pim-contracts`) ;
- **à la lecture** : une colonne illisible se repliait aussi sur l'URL
  (`library-rows.ts`, `prisma-image-catalogue.ts`).

Corrigé dans le code le 2026-10-26 : l'absence se range en **source vide**
(`{ "fr": "" }`, la colonne reste obligatoire), une URL, un chemin ou un nom de
fichier sont refusés comme description (`NonDescriptiveAltError`, 400), et la
lecture rend l'absence pour toute ligne héritée de l'ancien repli
(`storedAlt`, `media/domain/value-objects/alt-text.ts`). **Les lecteurs ne
voient donc plus l'URL même sans migration** ; la donnée en base, elle, reste
fausse — c'est l'objet de ce plan.

## Mesure (base de dev, 2026-10-26)

| Table.colonne                                          | Alternative = URL | Lignes |
| ------------------------------------------------------ | ----------------- | ------ |
| `media.media_asset.alt` (`fr` = url)                   | **16**            | 17     |
| `public.catalog_items.image_alt`                       | **12**            | 94     |
| `public.catalog_items.thumbnail_alt`                   | **1**             | 94     |
| `catalog_operations`, `pim.operations`, `storefront_*` | 0                 | —      |

Aucune alternative n'est une AUTRE URL que celle de l'image, ni un nom de
fichier. **La production n'a pas été mesurée** : refaire la requête avant tout.

## La requête de sélection

```sql
select id, url, alt
from media.media_asset
where btrim(alt->>'fr') = url
   or alt->>'fr' ~* '^([a-z][a-z0-9+.-]*:|//)'
   or alt->>'fr' ~* '\.(jpe?g|png|gif|webp|avif|svg|heic|heif|bmp|tiff?)$';
```

## La correction proposée — vider

```sql
update media.media_asset
set alt = '{"fr": ""}'::jsonb
where btrim(alt->>'fr') = url;
```

Restreinte au cas mesuré (source = URL de l'image). Les traductions tombent
avec : une seule ligne de dev en porte, à vérifier qu'elle n'est pas concernée.
Les autres formes (autre URL, nom de fichier) ne se vident pas à l'aveugle :
quelqu'un les a tapées, on les liste et Hugo tranche.

**Les copies chez les porteurs** (`catalog_items.image_alt`,
`thumbnail_alt`) sont des snapshots du commerce, hors du bloc `media/`. Elles
ne se corrigent pas par SQL croisé : elles se rafraîchissent au prochain envoi
du catalogue. À vérifier par `vitruve` : le fait « image décrite » (`MediaAssetDescribedFact`) ne
part que si l'alternative change à l'enregistrement — une migration SQL ne le
publie pas, il faudra donc un push du catalogue après.

## Retour arrière

Recalculable sans sauvegarde : l'ancienne valeur **était** l'URL, qui est
l'identité de la ligne.

```sql
update media.media_asset set alt = jsonb_build_object('fr', url)
where alt = '{"fr": ""}'::jsonb;
```

(Inexact seulement pour une image vidée volontairement entre-temps — sans
importance, puisque l'URL n'a jamais été une alternative.)

## Saisir les vrais textes ensuite

L'écran de la médiathèque le permet déjà : back-office → Médiathèque → une
image → panneau de détails, champ « texte alternatif » en français, anglais et
italien (`mediatheque/state/image-draft.ts`, `PUT /media`). Une image sans
alternative y apparaît avec le champ vide. Les outils agent
([outils-agent.md](outils-agent.md)) savent aussi « décrire ».
