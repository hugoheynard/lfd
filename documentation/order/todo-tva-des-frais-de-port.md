# La TVA des frais de port — un choix, pas une constante

> **Ouvert le 2026-09-21**, en répondant à une question de Hugo : « je définis un
> tarif par zone, dois-je ventiler la TVA selon le contenu du panier ? »
>
> **Décision (Hugo, 2026-09-21) : l'admin doit pouvoir choisir** entre la
> ventilation au prorata et le taux normal à 20 %.

## 1. Le fait

`DELIVERY_VAT_RATE = 20` (`packages/money/src/vat.ts`), et **aucun appelant de
production ne passe autre chose** — `deliveryVatRate` existe dans `VatInput`
(`apps/lfd-api/src/b2b/orders/domain/services/vat.ts`) et personne ne le
renseigne. Le coursier est donc **toujours** taxé au taux normal.

🔴 **Le JSDoc de la constante justifie ce choix par une affirmation que la règle
contredit** : « le taux d'une prestation de transport ne se paramètre pas par
boutique ». Le taux d'un port accessoire n'est pas une propriété du transport —
c'est une propriété de **ce qu'on transporte**.

## 2. La règle, et le seul cas où 20 % est juste

Les frais de port sont un **accessoire de la vente** : ils suivent le taux des
produits auxquels ils se rapportent, et sur un panier à taux multiples ils se
ventilent **au prorata de la valeur HT de chaque catégorie**.

Le taux normal ne s'applique que si le transport est une **prestation
distincte** — vente aux conditions « départ », propriété transférée chez le
vendeur, transport facturé à part. **C'est exactement pour ça que le réglage est
la bonne réponse** : les deux situations existent, et c'est le commerçant qui
sait dans laquelle il se trouve.

⚠️ Il existe une **tolérance** administrative — appliquer le taux le plus **bas**
quand tout part ensemble et que la ventilation serait complexe. Elle va vers le
bas : elle ne couvre pas le 20 % actuel.

## 3. Ce que ça change, mesuré

Sur `ventilateVat`, 12,00 € HT de coursier (mesuré le 2026-09-21) :

| Panier                     | Aujourd'hui (20 %)            | En accessoire                 | Écart      |
| -------------------------- | ----------------------------- | ----------------------------- | ---------- |
| 40 € de pâtisserie à 5,5 % | 2,20 € + **2,40 €** → 56,60 € | 2,86 € → **54,86 €**          | **1,74 €** |
| 30 € à 5,5 % + 10 € à 20 % | 1,65 € + **4,40 €** → 58,05 € | 2,15 € + 2,60 € → **56,75 €** | **1,30 €** |

Le client paie plus qu'il ne doit, et la maison déclare plus de TVA qu'elle n'en
doit. L'erreur est **en défaveur des deux**, ce qui est le genre qu'on ne
découvre que lorsqu'un client la calcule.

## 4. Ce qu'il faut trancher AVANT de bâtir

1. **Où vit le réglage ?** Ce n'est pas une propriété de la **zone** : c'est une
   propriété des **conditions de vente**. Un réglage global est donc le plus
   probable — mais une zone servie par un transporteur tiers pourrait
   légitimement diverger. À décider, pas à supposer.
2. 🔴 **Il doit être FIGÉ sur la commande**, comme `deliveryFeeAdjustment` l'est
   déjà. Sans ça, relire une commande ancienne lui applique le réglage
   d'aujourd'hui, et le bon de commande cesse de dire ce qui a été facturé.
   Le dépôt a déjà la leçon et la porte (`lint:dated-decisions`).
3. **Les commandes déjà facturées à 20 % ne se réécrivent pas.** Comme pour le
   TTC scellé (R3), le passé garde ce qu'il a facturé.
4. **L'écran doit DIRE quel mode s'applique.** Un commercial qui ne peut pas
   expliquer un total au téléphone rappellera la comptabilité.
5. **Le devis de la boutique et la caisse doivent répondre pareil** — c'est tout
   l'objet d'un devis, et `CartAdjustments` existe pour ça.

## 5. La surtaxe de retard — laissée ouverte, et c'est bien

`lateFeeVatRate` **n'a aucun défaut** et `computeOrderTotals` le refuse quand il
manque. Son JSDoc dit pourquoi : « personne ne sait encore s'il suit les
marchandises ou la prestation, et inventer une réponse la facturerait
rétroactivement sur toutes les commandes tardives ». **Ne pas y toucher en
réglant le port** : la question est distincte, et elle est en deux temps.

1. **Est-ce seulement dans le champ de la TVA ?** Une vraie indemnité, qui répare
   un préjudice, est **hors champ** — pas de TVA du tout. Un supplément de prix
   pour avoir accepté une commande tardive est une contrepartie, donc dedans.
2. Si c'est un supplément de prix, il suit alors la marchandise — **le même
   prorata que le port**.

## 6. Ce que ce document n'affirme pas

- Qu'il soit une analyse fiscale. Il décrit la règle telle que les sources
  publiques l'énoncent et chiffre l'écart sur le code réel. **La validation est
  celle de l'expert-comptable**, et la question du port se pose avec le tableau
  du §3 sous les yeux, parce qu'elle a une réponse chiffrée.
- Qu'aucune commande n'ait déjà été facturée ainsi. Personne ne l'a compté.

🔴 **`vitruve` est obligatoire** le jour où ceci devient un plan : il touche
l'argent et un système en service (CLAUDE.md § 9 bis).

## 7. Les sources

- [CGI art. 267 — Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042910064)
- [BOI-TVA-BASE-10-10-30 — réductions de prix](https://bofip.impots.gouv.fr/bofip/488-PGP.html/identifiant=BOI-TVA-BASE-10-10-30-20220511)
- [BOI-TVA-DECLA-30-10-20-10 — ventilation par taux](https://bofip.impots.gouv.fr/bofip/1548-PGP.html/identifiant=BOI-TVA-DECLA-30-10-20-10-20141117)
