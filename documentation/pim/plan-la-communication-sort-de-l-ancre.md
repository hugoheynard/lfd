# Plan — la communication sort de l'ancre

> **État : 📐 conception, à contredire.** Rien n'est bâti.
>
> 🔴 Il touche l'**ancre de révision** et la **frontière `b2b → pim`**. Le
> `CLAUDE.md` §9 bis demande `vitruve` d'office : c'est une bascule d'empreintes.

---

## 1. La décision, et d'où elle vient

Hugo, 2026-09-23 :

> « Contenu et visuels sont des opérations fluides avec un cycle de vie
> indépendant. Ça vit dans le PIM pour des questions de rassemblement de l'info
> produit, mais la lecture devrait se faire par port par le B2B — ou via du
> cache avec la clé produit. Le changement de contenu doit être fluide. »

Et le déclencheur, concret : dire « parmi tous mes thumbnails de croissant, on
affiche celui-là » change aujourd'hui l'**empreinte** de l'article **et** périme
la **signature de publiabilité**. Un geste de présentation déclenche une
conséquence réglementaire.

## 2. Le principe qui tranche

> **L'ancre porte ce qu'il faut pour DÉFENDRE une commande.**

Le prix, le taux, le nom, les allergènes : on devra les produire un jour, devant
un client ou un contrôle. Quelle photo était en vitrine : personne ne le
demandera jamais.

C'est ce principe qui manque au dépôt, et son absence explique que les deux
soient dans le même sac.

## 3. Ce qui sort, et ce que ça vaut

`RevisionItemInput` porte **dix-sept champs**. Deux seulement relèvent de la
présentation, et ce sont exactement ceux de la famille « Communication » de
l'écran :

```ts
readonly editorial: Readonly<Record<string, unknown>> | null;
readonly media: readonly RevisionMedia[];
```

Les quinze autres se répartissent entre identité, commerce et réglementaire —
les trois familles qui restent ancrées.

➡️ **L'ancre perd la famille Communication.** La correspondance entre le
découpage de l'écran et celui du modèle n'est pas une coïncidence : c'est la
même ligne de fracture, vue de deux endroits.

### 🔴 L'argument que je n'avais pas vu d'abord

L'URL d'un visuel est **adressée par contenu** — `products/{SHA-256}.{ext}` —
donc **immuable**. Figer une URL immuable dans un instantané n'achète rien :
l'image qu'elle désigne ne peut pas changer.

Ce qui bouge n'est pas le contenu, c'est **l'affectation** — le rôle, la
position. C'est-à-dire précisément ce qu'on veut rendre fluide.

## 3 bis. 🟢 Le journal garde tout — c'est ce qui rend le retrait possible

Hugo, 2026-09-23 : « mais on journalise quand même les changements visuels et
contenu ».

Oui, et c'est la pièce qui manquait à ce plan. Le dépôt sépare déjà les deux
mécanismes, et `attribution.ts` le dit en tête :

> Une révision sait **QUI l'a posée** ; elle ne sait pas qui a écrit chacune de
> ses lignes. Cette réponse-là vit dans **le journal**, un fait à la fois.

|             | Ce que c'est                               | Ce qu'on en fait               |
| ----------- | ------------------------------------------ | ------------------------------ |
| **Journal** | l'historique des gestes — qui, quand, quoi | on remonte le fil              |
| **Ancre**   | l'état défendable à un instant             | on le produit devant quelqu'un |

➡️ Retirer la communication de l'**ancre** ne retire rien du **journal**.
`product.media_saved` et le fait éditorial continuent d'être écrits, datés et
attribués à une personne. On perd la capacité de **rejouer** une présentation
passée, pas celle de **savoir** qu'elle a changé et par qui.

### ⚠️ Le piège que ça ouvre, et il est nommé dans le code

`attribution.ts` fait le pont entre les deux vocabulaires, et son JSDoc
avertit :

> …un événement neuf n'attribuerait plus rien, en silence — et le silence, ici,
> ressemble exactement à « personne n'a touché à ce champ ».

Les deux faits pointent aujourd'hui vers des champs d'ancre (`["media"]`, et son
équivalent éditorial). Ces champs disparaissant, **leur entrée doit rester, à
`[]`, avec sa raison écrite** : « ce fait ne touche aucun champ ancré, et c'est
voulu ».

La supprimer ferait échouer la garde d'exhaustivité ; la laisser vide sans
raison ferait lire « personne n'a rien touché » là où quelqu'un a changé une
photo. C'est exactement la faute que la séparation des allergènes et de la
nutrition a évitée hier, pour la même raison.

## 4. Ce qui remplace — un port, pas un instantané

La frontière autorise déjà la lecture : la matrice du `CLAUDE.md` §3 dit
`b2b → pim` **« port uniquement »**, par `pim/channels/b2b-platform/`. Et le
motif est **déjà en service**, pas à inventer :

```
b2b/catalog/infrastructure/in-process-delivery-facts.reader.ts
b2b/catalog/infrastructure/in-process-catalog.driver.ts
```

Le préfixe `in-process-` est un aveu utile : ces adaptateurs sont nommés pour le
jour où ils cesseront de l'être.

Le port ne transporte qu'une **correspondance** `produit → { rôle, url, alt }` :

- **minuscule** — quelques centaines d'octets par produit ;
- **cachable par clé produit**, comme Hugo le propose ;
- et **les octets ne passent pas par là** : les images sortent du domaine public
  `media.lafoliecoffee.info`. Le PIM ne sert jamais une image, il sert un
  pointeur.

## 5. 🔴 Ce qu'on accepte, dit une fois

**Rejouer une révision de mars montrera la présentation d'AUJOURD'HUI**, pas
celle de mars. Le jour où quelqu'un demande « à quoi ressemblait le catalogue le
12 mars », les visuels et le texte éditorial seront faux.

C'est le prix de la fluidité, et il se décide maintenant plutôt qu'en le
découvrant. Ce qui le rend acceptable : une ancre sert à défendre une
transaction, pas à reconstituer une vitrine.

⚠️ **Si cette hypothèse tombe** — un litige sur une description trompeuse, une
obligation de conserver la présentation — l'ancre devra les reprendre, et ce
sera une seconde bascule d'empreintes.

## 6. Le coût, mesuré

La production porte **un seul produit** (Hugo, 2026-09-23). Une bascule
d'empreintes y coûte donc au plus une ligne de faux diff, quel que soit le
nombre d'ancres posées.

⚠️ **À ne pas généraliser** : le coût se compte en `ancres × articles`, pas en
produits. La fenêtre est ouverte parce que le catalogue est vide, pas parce que
les empreintes seraient bon marché.

🔵 **À recompter avant de bâtir**, parce que ce plan repose dessus :

```sql
SELECT count(*) FROM "pim"."catalog_revision";
SELECT count(*) FROM "pim"."catalog_revision_item";
```

## 7. Ce qu'il faut trancher

| #      | Question                                                                                                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | `productMediaSaved` et le fait éditorial cessent-ils de périmer la **signature de publiabilité** ? C'est le pendant logique, et ça se décide séparément.                                                                    |
| **D2** | Le port est-il **lu à chaud** à chaque affichage, ou **rafraîchi au push** dans un cache côté commerce ? Le premier est fluide et crée une dépendance d'exécution ; le second garde l'indépendance et réintroduit un délai. |
| **D3** | Les **rôles gagnent-ils une spécification** (proportion attendue, taille minimale) ? Hugo le veut ; c'est additif et indépendant de ce plan.                                                                                |

🔵 **D2 est la vraie question.** Aujourd'hui le commerce ne dépend de rien au
moment d'afficher : tout est snapshoté. Une lecture à chaud change ça — PIM
indisponible, plus d'images. Le cache par clé produit est la réponse d'Hugo, et
elle tient à condition de dire **ce qui l'invalide**.

## 8. Ce que ce plan n'ouvre PAS

| ❌                                      | Pourquoi                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Les quinze autres champs de l'article   | Identité, commerce, réglementaire — ils défendent une commande                                                 |
| Le geste « visuel principal » à l'écran | Manquant, réel, mais indépendant : `DEFAULT_MEDIA_ROLE = 'gallery'` fait qu'aucun produit n'a jamais de `hero` |
| Une jointure `b2b → pim`                | Interdite. Le port reste la seule traversée                                                                    |
| Le stockage, le bucket, le ramassage    | Décrits ailleurs, inchangés                                                                                    |
