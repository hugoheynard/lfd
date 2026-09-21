# R3 — le bon de commande d'un particulier, en TTC

> **Ouvert le 2026-09-21**, à la suite de R2 (le panier public en TTC). Il touche
> **l'argent** et un **document opposable** : contredit par `vitruve` avant
> d'être bâti (CLAUDE.md § 9 bis). Ses quatre objections BLOQUANT ont toutes
> changé le plan — la principale l'a **retourné**.

## 1. Le fait

`order-sheet-pdf.ts` titre ses colonnes **« PU HT »** et **« Total HT »**
(lignes 333-334). Servi à un particulier, ce document contredit désormais le
rayon (D13) et le panier (R2), qui disent tous deux le TTC.

## 2. Les décisions, toutes prises

| #   | Question                 | Décision (Hugo, 2026-09-21)                           |
| --- | ------------------------ | ----------------------------------------------------- |
| 1   | Sceller ou dériver ?     | **Sceller** (chemin A)                                |
| 2   | Le pied bascule-t-il ?   | **Non** — il reste la ventilation d'une facture       |
| 3   | Le staff lit-il le TTC ? | **Il lit ce que le client a reçu** — un seul document |
| 4   | Et l'écran du bureau ?   | **Il garde le hors taxe**                             |

> « staff lit ce qui a été donné au client […] il faut viser ça dans tous les
> cas » — Hugo, 2026-09-21.

Le principe dépasse ce lot : **le staff regarde la pièce du client, pas une
variante**. C'est déjà ce que fait la route PDF du back-office
(`get-admin-order-sheet-pdf.handler.ts` appelle `clientSheetOf`, sous la même
clé d'archive, sur décision explicite) ; R3 le confirme au lieu de l'éroder.

⚠️ **Conséquence assumée** : le commercial au téléphone lit du TTC sur le PDF
d'un particulier, et du hors taxe sur son **écran** (`order-detail`, qui titre
« PU HT »). Les deux registres sont voulus — l'écran sert à répondre, le papier
est ce que le client tient.

## 3. Pourquoi A, alors que le plan recommandait B

🔴 **L'argument décisif est l'ARCHIVE, et le plan l'ignorait.**

`OrderSheetArchive.pdfOf` fait `readIfPresent(key)` **avant** de rendre, et ne
rend que si la clé manque. La clé est
`orders/{orderId}/bon-de-commande-r{revision}.pdf`, et `revision` vaut
**toujours 0** — les avenants n'existent pas.

Donc **dériver (B) aurait changé le rendu d'une pièce déjà émise** :

- les bons déjà téléchargés restaient hors taxe **pour toujours** ;
- ceux non encore tirés basculaient ;
- deux commandes du même client, **deux doctrines**, et rien sur le papier ne
  dit laquelle ;
- `CustomerDocumentStore` n'a plus de `delete`
  ([`todo-conservation-des-bons-en-r2.md`](todo-conservation-des-bons-en-r2.md)) :
  pas de marche arrière.

Le JSDoc d'`OrderSheetArchive` promet que « deux rendus de la même révision
produisent les mêmes octets » — c'est lui qui justifie l'absence de verrou. B
l'aurait rendu faux à cheval sur le déploiement.

⚠️ **La colonne ✅ « les commandes anciennes en profitent » du plan initial était
exactement à l'envers.** C'est A qui laisse les anciens bons intacts.

### Corollaire : pas de reprise de données

La colonne est **nullable** et **aucun `UPDATE` ne la remplit rétroactivement**.
Un bon ancien se rend donc **à l'octet près** comme aujourd'hui. C'est
précisément ce que A achète sur B, et le perdre par un backfill serait payer le
coût de A pour récolter le défaut de B.

## 4. Ce qui est scellé, et où

Deux colonnes sur `order_lines`, pas une :

| Colonne                | Ce que c'est                                            |
| ---------------------- | ------------------------------------------------------- |
| `unit_price_ttc_cents` | le prix d'UNE pièce, **tel que la vitrine l'affichait** |
| `line_total_ttc_cents` | le total de la ligne, taxe comprise                     |

**Les deux, parce que les deux ont été montrés au client** : le premier sur la
vignette, le second dans son panier (R2). Sceller le total seul obligerait à
dériver le prix unitaire au rendu — c'est-à-dire à refaire sur le document ce
qu'on vient de refuser.

🔴 **Remplies UNIQUEMENT quand `companyId === null`.** L'audience est décidée
**une fois**, à la passation, par le seul endroit qui la connaisse. Un `null`
dit alors deux choses — commande d'un pro, ou commande antérieure à R3 — et les
deux se rendent pareil : en hors taxe. C'est voulu : la seule question que le
document pose est « ai-je un TTC scellé à montrer ? ».

⚠️ **`resolveCompany` rend `null` dans trois cas où la personne A une société** :
espace perso déclaré, plusieurs rattachements sans déclaration, société déclarée
non rattachée. Le bon sortira alors en TTC — **cohérent avec le prix qui lui a
été servi** (en perso, il commande hors de sa mercuriale), mais c'est une
conséquence à écrire, pas à découvrir.

## 5. Ce que le document dit, et ce qu'il ne réconcilie pas

🔴 **Le pied ne s'additionne pas avec la colonne, et l'écart n'est pas un
arrondi : c'est toute la TVA.**

Aujourd'hui `subtotalCents` est **exactement** la somme des `lineTotalCents`
(`order.ts`), et la colonne tombe sur le pied — c'est la propriété d'audit du
document. Avec une colonne TTC et un pied inchangé, un client qui additionne
trouve 105,50 € face à un sous-total de 100,00 €.

**Ce qui le rend honnête plutôt que faux** : le pied dit désormais
**« Sous-total HT »** au lieu de « Sous-total ». Deux registres nommés, comme au
panier — dont le pied dit déjà « Sous-total HT » puis « Total TTC », et que Hugo
a validé à l'écran.

⚠️ **Ce n'est pas la solution finale, c'est la solution honnête.** Un vrai
document de particulier (un ticket) porte une colonne TTC, un total TTC et
« dont TVA » — pas d'échelle hors taxe. Y aller demanderait de sceller aussi la
remise et la livraison en TTC. À rouvrir si le volume public le justifie ; d'ici
là, un document dont chaque ligne est étiquetée ne ment pas.

### La remise ne descend pas dans la ligne

`ttcCentsOf` taxe la ligne **brute**, alors que la TVA scellée retranche la
remise au prorata. Une ligne affichera donc un TTC que le client ne paie pas si
la commande est remisée.

**C'est cohérent et non un défaut** : la colonne hors taxe est déjà brute
aujourd'hui, et la remise est un terme de **pied**, pas de ligne. Le TTC d'une
ligne est le prix de l'article, celui de la vitrine — ce qui est exactement
l'alignement que R2 et R3 cherchent. La mention du pied fait le reste.

## 6. Les surfaces, vérifiées

| Surface                                | Ce qu'elle devient                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `order-sheet-pdf.ts`                   | **bascule** — colonnes et intitulé du sous-total                                                                |
| `clientSheetOf` → `ClientSheetLine`    | **double** le champ, ne le réécrit jamais (geste de R2)                                                         |
| les **courriels**                      | **inchangés** — `mail-templates.ts` ne lit que `sheet.money` et le nombre de pièces, jamais un montant de ligne |
| `order-detail.html` (`@lfd/b2b-ui`)    | **inchangé** — décision 4                                                                                       |
| `renderOrderSheetText` (`@lfd/b2b-ui`) | **à suivre** — même feuille, derrière `FEATURE_PRO_SPACE = false`                                               |
| `staffSheetOf`                         | **aucun appelant de production** — il étend la feuille client et suit                                           |

⚠️ Le plan initial annonçait « quatre gabarits de courriel qui basculent ». Faux,
vérifié : quatre **sites d'appel** pour trois gabarits, et **aucun** ne rend un
montant de ligne. La portée était gonflée là où il n'y a rien.

## 7. Ce qu'un retour arrière coûte

La migration est **additive** — deux colonnes nullables. Le retour arrière est un
`DROP COLUMN`, qui détruit les TTC scellés des commandes passées entre-temps ;
il faudrait les recalculer depuis le hors taxe et le taux, toujours scellés. Rien
n'est perdu de façon irrécupérable, et c'est la propriété qu'on a payée en
choisissant A.
