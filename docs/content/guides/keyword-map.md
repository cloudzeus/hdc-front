# Keyword map — Greek buying guides

Built on 2026-09-30 for the general buying guides in this folder (Greek only in this round).
Goal: cover the Greek search space for power tools, accessories and PPE with one guide per
search-intent cluster, so that each guide can answer its cluster in Google (featured
snippets, People Also Ask) and in AI answers (ChatGPT, Gemini, Perplexity, AI Overviews).

## How it was built

1. **Real Greek queries.** Google autocomplete, `hl=el`, `gl=gr`, sampled for ~120 seed
   terms (product types, accessories, PPE, "τι είναι / πώς / ποιο / διαφορά" questions).
   Autocomplete shows what people actually type; it does not give volumes.
2. **Catalogue taxonomy.** The hdc-front category tree (SoftOne category → group →
   subgroup, with product counts), read-only. A cluster ranks higher when the shop has a
   deep category behind it, because the guide can then send the reader somewhere useful.
3. **Priority** is an estimate (H / M / L) from (a) how rich the autocomplete tail is,
   (b) how generic the head term is, and (c) the size of the matching catalogue category.
   It is not a measured search volume; check it against Search Console after go-live.

## What the autocomplete data says

- **Power source is the #1 modifier.** Almost every tool term is followed by
  «μπαταρίας» or «ρεύματος» (δράπανο μπαταρίας, σέγα μπαταρίας, γωνιακός τροχός
  μπαταρίας, σκαπτικό πιστολέτο ρεύματος). → a dedicated «Μπαταρία ή ρεύμα;» guide and a
  «μπαταρίας» variant in every guide's keywords.
- **Material and size are the #2 modifier.** «δισκοπρίονο ξύλου / μετάλλου / σιδήρου»,
  «τρυπάνια μπετού / μετάλλου / ξύλου / για πλακάκια», «τροχός 125 / 230»,
  «φαλτσοπρίονο ξύλου / σιδήρου», «λάμες σπαθόσεγας ξύλου / μετάλλου / για κλάδεμα».
- **Brand modifiers dominate the tail** (other brands, DIY chains, discounters). We do not
  target competitor names or make claims about them; we win the generic and the
  "Milwaukee" variants instead («τροχός 125 milwaukee», «μπουλονόκλειδο milwaukee»,
  «γυαλιά προστασίας milwaukee», «κοφτης καλωδιων milwaukee», «μετροταινία milwaukee»,
  «milwaukee packout», «milwaukee m12» all appear in autocomplete).
- **Explicit "how to choose" questions are rare in autocomplete** («πώς διαλέγω δράπανο»
  returns nothing), but they are exactly the questions people ask AI assistants. The guides
  therefore target the commercial head term in title/H1 and answer the implied question.
- **Technical-term questions exist:** «brushless motor τι είναι», «brushless
  δραπανοκατσαβιδο τι είναι», «ροπή στρέψης», «γαλλικό κλειδί τι είναι»,
  «μετρητής αποστάσεων laser πώς λειτουργεί».
- **Accent and final-sigma noise.** People type without accents and often with «σ» for
  «ς» (the suggest API lower-cases), and in Greeklish (drapano, troxos, spathosega). Every
  guide lists unaccented and Greeklish variants in `keywords`.

## Clusters → guides

Intent: **I** informational, **C** commercial investigation, **T** transactional.

| # | Cluster (primary query) | Secondary queries seen / implied | Unaccented · Greeklish | Intent | Pri. | Catalogue target |
|---|---|---|---|---|---|---|
| 01 | δράπανο | δράπανο μπαταρίας, δράπανο ρεύματος, κρουστικό δράπανο, ποιο δράπανο να αγοράσω, δράπανο για μπετό | drapano, krousiko drapano | C | H | ergaleia-batarias → drapana… |
| 02 | δραπανοκατσάβιδο μπαταρίας | κρουστικό δραπανοκατσάβιδο, δραπανοκατσάβιδο 18v, brushless δραπανοκατσάβιδο | drapanokatsavido | C | H | kroustika-drapana-2, katsavidieres |
| 03 | πιστολέτο | πιστολέτο μπαταρίας, πιστολέτο sds-plus, σκαπτικό πιστολέτο, κατεδαφιστικό πιστολέτο, sds max | pistoleto, skaptiko pistoleto | C | H | peristrofika-skaptika-pistoleta |
| 04 | παλμικό κατσαβίδι | παλμικό κατσαβίδι μπαταρίας, διαφορά παλμικού και δραπανοκατσάβιδου | palmiko katsavidi | C | H | palmika-katsavidia |
| 05 | μπουλονόκλειδο | μπουλονόκλειδο μπαταρίας, ηλεκτρικό, αυτοκινήτου, φορτηγού, 1/2, 3/4, 1" | mpoulonokleido, boulonokleido | C | H | boulonokleida-1-2-3, -3-4-2, -1 |
| 06 | σέγα | σέγα μπαταρίας, σέγα χειρός, σέγα για ξύλα, λάμες σέγας | sega | C | H | seges-3 |
| 07 | σπαθόσεγα | σπαθόσεγα μπαταρίας, σπαθόσεγα ρεύματος, λάμες σπαθόσεγας | spathosega | C | H | spathoseges-3 |
| 08 | δισκοπρίονο | δισκοπρίονο χειρός, μπαταρίας, ξύλου, μετάλλου/σιδήρου, πάγκου, βυθιζόμενο | diskoprono, diskopriono | C | H | diskopriona-cheiros-2 |
| 09 | φαλτσοπρίονο | φαλτσοπρίονο ξύλου, πάγκου, συρόμενο, σιδήρου | faltsoprono, faltsopriono | C | M | stathera-michanimata-2 |
| 10 | αλυσοπρίονο μπαταρίας | κλαδευτικό μπαταρίας, κονταροαλυσοπρίονο, αλυσίδα | alysoprono mpatarias | C | M | ergaleia-kipou-batarias |
| 11 | γωνιακός τροχός | τροχός 125, τροχός 230, τροχός 115, γωνιακός τροχός μπαταρίας | troxos 125, goniakos troxos | C | H | goniakoi-trochoi-f125-2 / -f230-2 |
| 12 | τριβείο | έκκεντρο τριβείο, τριβείο ξύλου, λειαντήρας, ταινιολειαντήρας, τριβείο μπαταρίας | trivio, ekkentro trivio | C | M | triveia-tainioleiantires-2 |
| 13 | πολυεργαλείο μπαταρίας | παλμικό πολυεργαλείο, multi tool, λάμες πολυεργαλείου | polyergaleio, multitool | C | M | polyergaleia-2, palmika-polyergaleia |
| 14 | καρφωτικό | καρφωτικό μπαταρίας, καρφωτικό φινιρίσματος, καρφωτικό πλαισίων, καρφωτικό χειρός | karfotiko | C | M | karfotika |
| 15 | πιστόλι σιλικόνης | πιστόλι σιλικόνης μπαταρίας, ηλεκτρικό, κλειστού τύπου 600ml, χημικά αγκύρια | pistoli silikonis | C | M | loipa-michanimata-batarias |
| 16 | σκούπα μπαταρίας / υγρών-στερεών | σκούπα εργοταξίου, σκούπα αναρρόφησης σκόνης, κλάση L/M/H | skoupa mpatarias | C | M | skoupes |
| 17 | προβολέας μπαταρίας / φακός | φακός κεφαλής, φακός επαναφορτιζόμενος, προβολέας εργοταξίου | provoleas, fakos kefalis | C | M | fakoi-epanafortizomenoi |
| 18 | αλφάδι laser | laser σταυρού, περιστροφικό laser, πράσινο laser, laser 360 | alfadi laser, laser stavrou | C | H | grammika-peristrofika-laser-dektes-laser |
| 19 | μετρητής αποστάσεων laser | αποστασιόμετρο, πώς λειτουργεί, μετροταινία laser | metritis apostaseon | C | M | metrites-apostaseon-anichneytes-metallon |
| 20 | ανιχνευτής | ανιχνευτής τάσης, ανιχνευτής μετάλλων/καλωδίων τοίχου, δέκτης laser | anixneutis | I/C | L | elegktes-tasis…, dektes laser |
| 21 | κατσαβίδια σετ | κατσαβίδια ηλεκτρολόγου, μύτες κατσαβιδιού, μαγνητικές μύτες, pozidriv/phillips/torx | katsavidia set | C | M | katsavidia, mytes-vidomatos… |
| 22 | πένσα | πένσα ηλεκτρολόγου, πένσα γκριπ, γκαζοτανάλια, πλαγιοκόφτης, κόφτης καλωδίων | pensa | C | M | pensika-tsibidika |
| 23 | γερμανοπολύγωνα / καρυδάκια | γερμανοπολύγωνα καστάνιας, καρυδάκια σετ, καρυδάκια αέρος (impact), δυναμόκλειδο, γαλλικό κλειδί | germanopolygona, karydakia | C | M | kleidia-germanopolygona, seira-me-kare-* |
| 24 | εργαλειοθήκη | εργαλειοθήκη τροχήλατη, με συρτάρια, πλάτης, milwaukee packout | ergaleiothiki | C | H | ergaleiothikes-skafakia-koutia-apothikeysis |
| 25 | τρυπάνια | τρυπάνια μπετού, μετάλλου, ξύλου, κοβαλτίου, sds plus, για πλακάκια, ποτηροτρύπανο | trypania, trupania | C | H | diatrisi, ypodochi-sds-plus |
| 26 | δίσκοι κοπής | δίσκοι κοπής σιδήρου/μετάλλου, inox, πέτρας, διαμαντιού, δίσκοι λείανσης, φτερωτοί | diskoi kopis | C | M | leiansi-kopi |
| 27 | λάμες σπαθόσεγας / σέγας | λάμες ξύλου, μετάλλου, για κλάδεμα, TPI, T-shank | lames spathosegas | C | M | spathoseges, seges (accessories) |
| 28 | ΜΑΠ: γάντια, γυαλιά, ωτοασπίδες, κράνος | γάντια εργασίας νιτριλίου/δερμάτινα, γυαλιά προστασίας en 166, κράνος εργασίας, μάσκα σκόνης ffp2 | gantia ergasias, gyalia prostasias | C | H | mesa-atomikis-prostasias-odopoiia |
| 29 | παπούτσια ασφαλείας | παπούτσια ασφαλείας s3, αθλητικά, ελαφριά, μποτάκια ασφαλείας | papoutsia asfaleias | C | H | prostasia-kato-akron |
| 30 | μπαταρία ή ρεύμα | εργαλεία μπαταρίας, δράπανο ρεύματος ή μπαταρίας | mpataria i revma | I | M | ergaleia-batarias / ilektrika-ergaleia |
| 31 | brushless | brushless τι είναι, brushless μοτέρ, καρβουνάκια | brushless, karvounakia | I | M | (explainer) |
| 32 | πόσα Ah | μπαταρία 18v, μπαταρία 5ah ή 2ah, φορτιστής | posa ah, mpataria 18v | I/C | M | bataries-2, fortistes |
| 33 | Nm, rpm, bpm, J | ροπή στρέψης, τι σημαίνει Nm, ενέργεια κρούσης | ropi strepsis | I | M | (explainer) |
| 34 | συντήρηση εργαλείων μπαταρίας | συντήρηση μπαταρίας λιθίου, αποθήκευση μπαταρίας | syntirisi mpatarias | I | M | (how-to) |
| 35 | εργαλεία για αρχάριους / επαγγελματίες | βασικά εργαλεία, σετ εργαλείων μπαταρίας, ερασιτεχνικά ή επαγγελματικά | vasika ergaleia | I/C | M | set-combo-ergaleion-18v / -12v |

## Seen in the data but not written in this round

| Cluster | Why it is left for later |
|---|---|
| πιστόλι θερμού αέρα, φυσητήρας μπαταρίας | Real demand, small catalogue (a few products). Good next-round guide. |
| εργαλεία ηλεκτρολόγου / εργαλεία υδραυλικού / εργαλεία συνεργείου | Trade "kit list" guides; better written after the tool guides exist so they can link to them. |
| κόφτης σωλήνων, πρέσα υδραυλικών, κόφτης καλωδίων μπαταρίας | Specialist; catalogue exists (preses-syndesis, koftes-kalodion-domikon-ylikon). Candidate next round. |
| πλάνη, ρούτερ ξύλου | Autocomplete is noisy («πλάνη» also means "delusion"); small catalogue. |
| θερμοκάμερα, ενδοσκοπική κάμερα | Small catalogue (3–5 products); most demand is for phone accessories. |
| χλοοκοπτικό / θαμνοκοπτικό / φυσητήρας μπαταρίας (κήπος) | Garden intent; catalogue is mostly chainsaw-type tools. The chainsaw guide covers the core. |
| εκκινητής μπαταρίας, γεννήτρια | Automotive/consumer intent; one product each. |
| μετροταινία, αλφάδι (χειρός), φαλτσέτα/κοπίδι, σφυρί | Could form one "εργαλεία μέτρησης και χάραξης χειρός" guide next round. |

## Keyword conventions used in the guides

- `keywords[0]` is the primary query of the cluster, as people type it (with accents).
- Then: the «μπαταρίας» variant, material/size variants, the question form
  («πώς διαλέγω …», «ποιο … να πάρω»), then an unaccented variant and a Greeklish variant,
  then «… milwaukee» where it appeared in autocomplete, then «… Πειραιάς» for the local
  intent.
- No competitor brand names in `keywords`, titles or body.
