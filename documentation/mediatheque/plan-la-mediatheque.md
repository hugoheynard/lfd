# La médiathèque — le plan, et ce qu'il a coûté

> **Plan EXÉCUTÉ le 2026-09-23.** Ses six lots sont livrés. Ce document n'est
> plus une consigne : c'est le compte rendu de ce que le chantier a appris.
>
> ➡️ L'état du système est décrit dans
> [`la-mediatheque.md`](la-mediatheque.md).
> Ce qui reste : [`../todos/todo-mediatheque.md`](../todos/todo-mediatheque.md).
>
> 🔴 **Ce fichier ne se renomme pas.** La migration
> `20260923120000_les_tags_de_la_mediatheque` le cite, et une migration
> appliquée ne se retouche pas — son empreinte est enregistrée en base.

---

## Ce que les six lots ont livré

| Lot | Ce qui existe                                                     | Commit      |
| --- | ----------------------------------------------------------------- | ----------- |
| 1   | la bibliothèque se lit, groupée par URL, avec le compte d'emplois | `054e9d09b` |
| 2   | l'écran et son entrée de premier niveau                           | `2839b0c65` |
| 3   | le dépôt en lot, qui ne s'arrête pas sur un refus                 | `6566e0684` |
| 4   | la bande de tags, le glisser-déposer, le point focal              | `bb407c7ec` |
| 5   | chercher et attribuer depuis la fiche, les cinq usages            | `ae60a8f4d` |
| 6   | retirer — jamais ce qui sert                                      | `bab64087e` |

---

## 🔴 Ce que le chantier a appris, et qui ne se devinait pas

### Ce qui manquait n'était pas un écran, c'était une IDENTITÉ

`replaceMedia` recréait un `MediaAsset` neuf par visuel à chaque
enregistrement. `media_asset` n'était donc pas une bibliothèque mais un journal
de lignes : rien à rechercher, rien à taguer, rien à réutiliser, parce que rien
ne traversait deux sauvegardes.

L'identité existait pourtant, en creux : l'**URL**, adressée par contenu. La
médiathèque ne l'a pas inventée, elle l'a rendue visible — puis un index UNIQUE
l'a rendue vraie.

### Un commentaire a coûté une fonctionnalité entière

Le JSDoc de `DEFAULT_MEDIA_ROLE` affirmait qu'« aucun canal ne lit le rôle : ni
la projection Shopify ni le B2B ». **Les deux moitiés étaient fausses** —
`showcase.ts` cherche le `hero`, et Shopify est sorti du dépôt le 2026-09-21.

Conséquence mesurée : aucun produit ne portait de `hero`, `heroOf()` rendait
toujours `null`, et **la vitrine B2B n'a jamais montré la moindre image**. Une
phrase qui justifiait de ne rien construire, par l'état d'un fichier que
personne n'a rouvert.

⚠️ La même phrase vivait **en double**, dans le JSDoc de `VisualsForm`.
Corriger l'une n'avait pas corrigé l'autre.

### Un geste d'unicité trop large ne se voit pas tant qu'il n'y a qu'un cas

`setMainVisual` rendait **tous** les autres visuels à `gallery` — parfaitement
inoffensif tant qu'un seul usage avait un écran, destructeur le jour où on a
ouvert les quatre autres.

### Une porte ne lit pas les fichiers que git ne suit pas

`lint:fold-tokens` n'a pas vu cinq variables inexistantes dans un SCSS neuf :
elle ne mord qu'une fois le fichier ajouté à l'index. Trois autres ont suivi le
même chemin (`--fold-color-surface`, la famille `alert` plutôt que `danger`).

---

## Les décisions, et ce qu'elles ont coûté

| Décision                                         | Ce qu'on perd                                       | Ce qu'on gagne                                  |
| ------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------- |
| Vocabulaire de tags **libre et à plat**          | rien ne rapproche « croissant » de « viennoiserie » | un champ que les gens remplissent               |
| Une **bande**, pas un panneau par image          | —                                                   | le mot se fabrique une fois et se pose partout  |
| Le dépôt en lot **ne s'arrête pas** sur un refus | —                                                   | plus besoin de trier à la main ce qui est passé |
| L'écran **ne décide pas** de la suppression      | un aller-retour                                     | une seule source pour la règle                  |

⚠️ Deux avertissements que le chantier a volontairement placés :

- la confirmation de suppression **ne parle pas de réversibilité** — redéposer
  le fichier ramène l'image ; ce qui ne revient pas, ce sont ses mots-clés, son
  étiquette et son point. Avertir de la mauvaise perte forme les gens à ignorer
  l'avertissement ;
- le glisser-déposer est **doublé d'un clic**, parce qu'on ne glisse pas au
  clavier.

---

## Le point focal, et pourquoi il est arrivé par une question de format

Le sujet est né d'une question de Hugo — « quel serait le format de la carte
_je passe la prendre_ ? » — et la réponse mesurée a été : **aucun**.

Ces cartes n'ont pas de forme. Leur hauteur est un plancher que le texte
pousse, leur largeur est fluide, et la photo prend la forme que la carte a
prise. Le `center 42%` du bandeau d'opération en était l'aveu : quelqu'un avait
décalé le cadrage à la main.

➡️ **Un ratio ne se demande qu'à un conteneur qui en a un.** Ce que ces cartes
réclament, c'est « garde ce point » — et `focalX`/`focalY` existaient en base
depuis l'origine, sans un seul lecteur ni écrivain.

🔴 Et ils n'auraient pas survécu : sans report d'une inscription à la suivante,
le point aurait marché à l'écran et disparu à la sauvegarde suivante. Ce report
a été écrit, puis **supprimé avec sa cause** quand le référentiel a cessé de
recréer des actifs — le colmatage était juste, la vraie réponse était plus
profonde.
