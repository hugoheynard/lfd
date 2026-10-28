# Les alternatives qui étaient des URL — neutralisées à la lecture

> **État (2026-10-26) : implémenté, sans migration de données.** Ce document a
> été un plan de correction en base ; la décision prise le même jour est de ne
> rien réécrire. Il garde son nom de fichier parce que le code le cite.

## La cause

Pré-audit RGAA de la boutique (2026-10-26, [grille](../accessibilite/grille-audit-rgaa.md)) :
58 images sur 89 annoncées par leur URL. Le contrat de la médiathèque
(`mediaAltOrUrl`, `@lfd/pim-contracts`) repliait une alternative absente sur
l'URL du fichier, au dépôt comme à la lecture, et l'envoi du catalogue a
recopié ce repli dans les copies du commerce.

## Ce qui neutralise, de bout en bout

Rien n'est réécrit en base : **chaque lecture** traite une alternative qui ne
décrit rien — URL, chemin, nom de fichier, règle `isDescriptiveAltText` de
`packages/pim-contracts/src/media-alt.ts` — comme absente.

| Où                                         | Qui lit                                                                                                                   | Ce qui est servi                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `media.media_asset.alt`                    | `storedAlt` (`apps/lfd-api/src/media/domain/value-objects/alt-text.ts`)                                                   | `{ fr: "" }`, l'absence de la médiathèque |
| `catalog_items.image_alt`, `thumbnail_alt` | `servedImageAlt` (`apps/lfd-api/src/b2b/catalog/infrastructure/catalog-image-alt.ts`), par les deux lecteurs du catalogue | `""`, l'absence que le commerce sert déjà |

À l'écriture, une URL ou un nom de fichier est refusé comme description
(`NonDescriptiveAltError`, 400), et l'absence se range en source vide.

## Pourquoi pas de migration

La correction en base (`update … set alt = '{"fr": ""}'`) a été écartée :

- elle remplaçait le `jsonb` entier et aurait écrasé les traductions `en`/`it`
  d'une ligne qui en porte ;
- son retour arrière n'était pas borné : il ne distinguait pas une ligne vidée
  par la migration d'une ligne vidée volontairement depuis ;
- c'était une écriture sans fait journalisé, que ni l'historique de la
  médiathèque ni les copies du commerce n'auraient vue ;
- pour un gain cosmétique : la lecture ne sert déjà plus l'URL.

## Saisir les vrais textes

Back-office → Médiathèque → une image → panneau de détails, champ « texte
alternatif » en français, anglais et italien (`PUT /media`). Une image sans
alternative y apparaît avec le champ vide. Chaque saisie **remplace** la
valeur stockée, URL comprise. Les outils agent ([outils-agent.md](outils-agent.md))
savent aussi « décrire ».

## Rafraîchir les copies du commerce

Une saisie publie le fait « visuels de la fiche » et la copie suit. Pour
réaligner toutes les copies d'un coup, la réémission du catalogue réécrit chaque
article sans comparer d'empreinte (vérifié le 2026-10-26 : aucun saut des
lignes inchangées, ni à l'émission ni à l'ingestion) :

- back-office, Référentiel › Vue d’ensemble (`/pim/catalogue`, la page « Intégrations » est retirée le 2026-10-28) → « Tout réémettre » (ou « Réémettre » depuis une fiche) ;
- ou `POST /pim/channels/b2b/reemit` avec `{}` (une fiche : `{ "productId": "…" }`),
  droit `pim_channels:write`.

## Suivre ce qui reste à décrire

Mesure en dev le 2026-10-26 : 16 images sur 17, 12 `image_alt` et
1 `thumbnail_alt` sur 94 copies. La production n'a pas été mesurée.

```sql
select id, url, alt
from media.media_asset
where btrim(alt->>'fr') = url
   or alt->>'fr' ~* '^([a-z][a-z0-9+.-]*:|//)'
   or alt->>'fr' ~* '\.(jpe?g|png|gif|webp|avif|svg|heic|heif|bmp|tiff?)$';
```

Une ligne de ce résultat est une image à décrire à l'écran, pas une donnée à
corriger en base.
