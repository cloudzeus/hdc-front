# Ενιαία σύνδεση (SSO) στο /admin των eshop μέσω HDCtool (σχέδιο)

**Ημερομηνία:** 2026-10-27
**Συστήματα:**
- HDCtool (`hdckolleris`, hdctool.wwa.gr): εκδίδει την ταυτότητα
- Milwaukee eshop (`hdc-front`, milwaukeetoolshdc.gr): `/admin`
- Kolleris eshop (`kollerisEshopFront`, kolleris.com): `/admin`

**Κατάσταση:** εγκρίθηκε στη συζήτηση (ενότητες 1–3). Αναμένεται έλεγχος του γραπτού κειμένου.

## 1. Στόχος

Το προσωπικό μπαίνει στο `/admin` και των δύο eshop **με τον λογαριασμό του HDCtool**. Δεν χρειάζεται ξεχωριστός κωδικός ανά eshop. Ο ρόλος σε κάθε eshop ορίζεται **σε ένα σημείο**, στους ρόλους του HDCtool.

**Κριτήριο επιτυχίας:**
- Ένας υπάλληλος με ρόλο «Kolleris — OPS» στο HDCtool πατά «Σύνδεση με HDCtool» στο kolleris.com/admin και μπαίνει ως OPS χωρίς να πληκτρολογήσει κωδικό, εφόσον είναι ήδη συνδεδεμένος στο HDCtool.
- Αν του αφαιρεθεί ο ρόλος, η επόμενη σύνδεσή του απορρίπτεται.
- Αν το HDCtool είναι εκτός λειτουργίας, ένας από τους 1–2 λογαριασμούς έκτακτης ανάγκης μπαίνει με κωδικό.

## 2. Αποφάσεις

| Θέμα | Απόφαση |
|---|---|
| Προσέγγιση | **Β. Υπογεγραμμένο token** (όχι πλήρες OIDC). Το HDCtool υπογράφει ένα βραχύβιο token. Ακολουθούνται οι πρακτικές ασφαλείας του OIDC: `state`, `aud`, `jti`, λήξη και καταχωρημένη διεύθυνση επιστροφής. Το πρόσθετο `oidc-provider` του better-auth έχει καταργηθεί, και ένας πλήρης OIDC provider είναι δυσανάλογα μεγάλος για 2 πελάτες. |
| Υπογραφή | **ES256** (ασύμμετρη). Το ιδιωτικό κλειδί υπάρχει μόνο στο HDCtool. Τα eshop έχουν μόνο το δημόσιο κλειδί, οπότε μια διαρροή από eshop δεν επιτρέπει πλαστά token. |
| Διάρκεια token | **60 δευτερόλεπτα**, μίας χρήσης (`jti`). |
| Διάρκεια σύνδεσης eshop | **12 ώρες** (μία εργάσιμη μέρα). |
| Ανάκληση | **Στην επόμενη σύνδεση.** Μια ενεργή σύνδεση διαρκεί το πολύ 12 ώρες. Αν χρειαστεί άμεσος αποκλεισμός, υπάρχει το `isActive=false` / `sessionsValidFrom` του eshop. |
| Ρόλοι | 6 δικαιώματα `feature:eshop.{kolleris\|milwaukee}.{admin\|editor\|ops}`, που ανατίθενται μέσω `AppRole` του HDCtool. |
| Μεταβατικός ρόλος | Ο ρόλος «Πλήρης πρόσβαση (μεταβατικός)» (ALL) **δεν** δίνει πρόσβαση στα eshop. Χρειάζεται ρητή ανάθεση. |
| Λογαριασμοί eshop | Δημιουργούνται **στην πρώτη σύνδεση**. Η πρώτη σύνδεση συνδέει τον λογαριασμό με βάση το email. Από εκεί και πέρα η αντιστοίχιση γίνεται με το id του HDCtool. |
| Έκτακτη ανάγκη | 1–2 emails στο `ADMIN_EMERGENCY_EMAILS`. Η φόρμα κωδικού βρίσκεται μόνο στο **κρυφό** `/admin/login/emergency`. |
| Αποσύνδεση | Κλείνει μόνο τη σύνδεση στο eshop. Δεν κλείνει τη σύνδεση στο HDCtool. |
| Βάση HDCtool | **Δεν αλλάζει.** Οι ρυθμίσεις είναι μεταβλητές περιβάλλοντος και τα δικαιώματα ορίζονται στον κατάλογο κώδικα. |

## 3. Ροή

```
eshop /admin/login                HDCtool                          eshop
──────────────────                ───────                          ─────
[Σύνδεση με HDCtool]
  → POST /api/admin/sso/start
    cookie sso_state (5′)
  → 302 hdctool.wwa.gr/sso/eshop?client=kolleris&state=…
                                  σύνδεση αν χρειάζεται
                                  έλεγχος: ενεργός + ρόλος eshop
                                  υπογραφή token (60″)
                                  σελίδα auto-POST ──────────────→ POST /api/admin/sso/callback
                                                                   έλεγχος token + state + jti
                                                                   εύρεση/δημιουργία AdminUser
                                                                   σύνδεση 12h → /admin (ή return path)
```

### 3.1 Eshop: έναρξη (`POST /api/admin/sso/start`)
- Δημιουργεί ένα τυχαίο `state` (32 bytes, base64url).
- Γράφει cookie `sso_state` = `state` και το return path (μόνο σχετική διαδρομή που ξεκινά με `/admin`).
  - Ρυθμίσεις: `httpOnly`, `Secure`, **`SameSite=None`**, `Path=/api/admin/sso`, `Max-Age=300`.
  - Γιατί `SameSite=None`: η επιστροφή είναι POST από άλλο domain, και με `Lax` ο browser δεν στέλνει το cookie.
- Ανακατευθύνει (302) στο `${HDCTOOL_SSO_URL}/sso/eshop?client=<ADMIN_SSO_CLIENT_ID>&state=<state>`.

### 3.2 HDCtool: `GET /sso/eshop`
- **Άγνωστο `client`** ή `state` που λείπει → σελίδα 400. Δεν γίνεται ανακατεύθυνση πουθενά.
- **Χρήστης όχι συνδεδεμένος** → σελίδα σύνδεσης του HDCtool με επιστροφή στο ίδιο URL.
- **Ο χρήστης δεν έχει πρόσβαση:** αν είναι ανενεργός ή banned, ή δεν έχει κανένα δικαίωμα `feature:eshop.<client>.*`, εμφανίζεται σελίδα «Δεν έχεις πρόσβαση στο admin του <Kolleris|Milwaukee>» με σύνδεσμο πίσω στο HDCtool.
- **EDITOR + OPS χωρίς ADMIN** → σελίδα «Αντικρουόμενοι ρόλοι για το <eshop>: ζήτα από τον διαχειριστή να κρατήσει έναν».
- **Επιτυχία** → υπογράφει token και επιστρέφει HTML σελίδα που κάνει auto-POST το `token` στο **καταχωρημένο** `callbackUrl` του client.
  - Η σελίδα έχει `<noscript>` κουμπί «Συνέχεια».
  - Το `callbackUrl` δεν διαβάζεται ποτέ από το query.
  - Headers: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`.
- Σε κάθε έκδοση token γράφεται μια γραμμή στο log του server: `eshop_sso_issued user=<id> client=<client> role=<role> jti=<jti>`. Το token δεν γράφεται.

### 3.3 Token (JWS, ES256)
- Header: `{ alg: "ES256", kid: <ESHOP_SSO_KEY_ID>, typ: "JWT" }`
- Claims:

| claim | τιμή |
|---|---|
| `iss` | `https://hdctool.wwa.gr` (`ESHOP_SSO_ISSUER`) |
| `aud` | id του client: `kolleris` ή `milwaukee` |
| `sub` | id χρήστη του HDCtool |
| `email`, `name` | από τον λογαριασμό του HDCtool |
| `role` | `ADMIN` \| `EDITOR` \| `OPS` (έχει ήδη επιλυθεί) |
| `state` | όπως ήρθε |
| `iat`, `exp` | `exp = iat + 60` |
| `jti` | τυχαίο UUID |

### 3.4 Eshop: επιστροφή (`POST /api/admin/sso/callback`, form-encoded `token`)

Ο έλεγχος γίνεται με αυτή τη σειρά. Η πρώτη αποτυχία σταματά τη ροή.

1. Το cookie `sso_state` υπάρχει.
2. Η υπογραφή επαληθεύεται με το δημόσιο κλειδί του `kid`. Επιτρέπεται μόνο `alg=ES256`.
3. `iss` = `ADMIN_SSO_ISSUER` και `aud` = `ADMIN_SSO_CLIENT_ID`.
4. `exp` δεν έχει περάσει. Ανοχή ρολογιού ±30″. Το `iat` δεν είναι στο μέλλον.
5. `state` = cookie, με σύγκριση σταθερού χρόνου.
6. Το `jti` δεν έχει χρησιμοποιηθεί. Καταγράφεται ατομικά: unique insert στο `AdminSsoJti`.
7. `role` ∈ {ADMIN, EDITOR, OPS}.

Μετά τους ελέγχους:
- Το cookie `sso_state` σβήνεται **πάντα**, είτε η σύνδεση πετύχει είτε αποτύχει.
- **Αποτυχία** → redirect στο `/admin/login?error=sso`. Η σελίδα δείχνει γενικό μήνυμα: «Η σύνδεση δεν ολοκληρώθηκε, ξαναδοκίμασε». Η ακριβής αιτία γράφεται στο log ως `admin_sso_rejected reason=<bad_signature|expired|state_mismatch|replay|…>`, χωρίς το token.
- **Επιτυχία** → εύρεση ή δημιουργία `AdminUser` (§4.2), καταγραφή `admin_sso_login` στο audit (όπου υπάρχει `AdminAuditLog`), άνοιγμα σύνδεσης next-auth 12h και redirect στο return path.

### 3.5 Δημόσιο κλειδί
- Το HDCtool δίνει τα δημόσια κλειδιά στο `GET /.well-known/eshop-sso-keys` ως JWKS. Μπορεί να περιέχει 2 κλειδιά κατά την εναλλαγή.
- Το eshop κρατά τα κλειδιά για **1 ώρα**.
- Άγνωστο `kid` → ξαναδιαβάζει τα κλειδιά μία φορά, με όριο το πολύ 1 ανάγνωση ανά λεπτό.
- Αν το HDCtool δεν απαντά, χρησιμοποιείται το τελευταίο αποθηκευμένο κλειδί.

## 4. Ρόλοι και λογαριασμοί

### 4.1 Ρόλοι στο HDCtool
- Στο `src/lib/rbac/catalog.ts` μπαίνουν 6 κλειδιά τύπου feature (το πρόθεμα `feature:` είναι υποχρεωτικό):
  - `feature:eshop.kolleris.admin`, `feature:eshop.kolleris.editor`, `feature:eshop.kolleris.ops`
  - `feature:eshop.milwaukee.admin`, `feature:eshop.milwaukee.editor`, `feature:eshop.milwaukee.ops`
- Τα κλειδιά ανατίθενται σε `AppRole` από την υπάρχουσα οθόνη ρόλων. Η απόφαση για το ποιος ρόλος δίνεται σε ποιον είναι του χρήστη.
- **Επίλυση ρόλου** ανά eshop, από τα ρητά δικαιώματα του χρήστη:
  - έχει `admin` → ADMIN;
  - αλλιώς, μόνο `editor` → EDITOR;
  - αλλιώς, μόνο `ops` → OPS;
  - `editor` + `ops` → «αντικρουόμενοι ρόλοι» (απόρριψη);
  - κανένα → «δεν έχεις πρόσβαση».
- Ο μεταβατικός ρόλος ALL **παραλείπεται** στην επίλυση: ελέγχονται μόνο ρητά `AppRolePermission` με αυτά τα κλειδιά.

### 4.2 `AdminUser` στο eshop
Αλλαγές στο σχήμα και των δύο eshop:
- `hdctoolUserId String? @unique`
- `passwordHash String?`: γίνεται προαιρετικό. Οι νέοι χρήστες SSO δεν έχουν κωδικό.
- Νέο μοντέλο `AdminSsoJti { jti String @id, expiresAt DateTime }`. Οι ληγμένες γραμμές καθαρίζονται σε κάθε επιτυχή σύνδεση (`deleteMany expiresAt < now`).

Αντιστοίχιση στην επιστροφή:
1. Υπάρχει `AdminUser` με `hdctoolUserId = sub` → αυτός ο χρήστης. Αν άλλαξε το email στο HDCtool, ενημερώνεται και εδώ.
2. Αλλιώς, υπάρχει `AdminUser` με `email = email` (πεζά) και κενό `hdctoolUserId` → **σύνδεση**: γράφεται το `hdctoolUserId`. Ο χρήστης κρατά το id του, άρα και το ιστορικό του στο audit.
3. Αλλιώς, υπάρχει `AdminUser` με αυτό το email αλλά **άλλο** `hdctoolUserId` → απόρριψη (`reason=email_bound_to_other`).
4. Αλλιώς → νέος `AdminUser` χωρίς κωδικό.

Σε κάθε επιτυχή σύνδεση ενημερώνονται `role`, `name`, `isActive=true` και `lastLoginAt`.
- Εξαίρεση: αν ένας διαχειριστής του eshop έχει θέσει `isActive=false`, η σύνδεση **απορρίπτεται** (`reason=disabled_locally`) και ο χρήστης **δεν** επανενεργοποιείται.

Οθόνη χρηστών στο eshop:
- Για χρήστες με `hdctoolUserId`, ο ρόλος εμφανίζεται κλειδωμένος με την ένδειξη «ορίζεται στο HDCtool».
- Αλλαγή κωδικού / reset εμφανίζονται μόνο για λογαριασμούς έκτακτης ανάγκης.

### 4.3 Έκτακτη ανάγκη
- `ADMIN_EMERGENCY_EMAILS`: λίστα emails χωρισμένα με κόμμα, 1–2.
- `/admin/login/emergency`:
  - είναι η υπάρχουσα φόρμα Credentials με το υπάρχον rate limit;
  - δέχεται **μόνο** emails της λίστας;
  - δεν συνδέεται από πουθενά και έχει `noindex`.
- Σε `ADMIN_SSO=only`, η Credentials σύνδεση για email εκτός λίστας αποτυγχάνει με το ίδιο γενικό μήνυμα λάθους κωδικού.
- Κάθε σύνδεση έκτακτης ανάγκης γράφει `emergency_login` στο audit / log.
- Το reset κωδικού στέλνει email μόνο σε emails της λίστας.
- Τα emails της λίστας είναι αποκλειστικές διευθύνσεις έκτακτης ανάγκης, **ποτέ** ταυτότητα SSO κανενός. Αν ένα token του HDCtool φέρει email της λίστας, το callback το απορρίπτει με `reason=emergency_account` πριν από κάθε σύνδεση λογαριασμού (μετά τον έλεγχο `jti`). Έτσι ο λογαριασμός έκτακτης ανάγκης δεν συνδέεται ποτέ με το HDCtool, δεν αλλάζει ρόλο από το HDCtool, δεν δημιουργείται ως λογαριασμός χωρίς κωδικό, και κρατά το «Νέος κωδικός» / «Ξέχασα τον κωδικό». Η απόρριψη αυτή δεν μετρά στο rate limit.

## 5. Ρυθμίσεις

**HDCtool (Coolify):**

| Μεταβλητή | Περιεχόμενο |
|---|---|
| `ESHOP_SSO_PRIVATE_KEY` | ιδιωτικό κλειδί ES256 (PEM, PKCS#8) |
| `ESHOP_SSO_KEY_ID` | π.χ. `2026-10` |
| `ESHOP_SSO_PREVIOUS_PUBLIC_KEY`, `ESHOP_SSO_PREVIOUS_KEY_ID` | προαιρετικά, μόνο κατά την εναλλαγή κλειδιού |
| `ESHOP_SSO_ISSUER` | `https://hdctool.wwa.gr` |
| `ESHOP_SSO_CLIENTS` | JSON: `[{"id":"kolleris","name":"Kolleris","callbackUrl":"https://kolleris.com/api/admin/sso/callback"},{"id":"milwaukee","name":"Milwaukee","callbackUrl":"https://milwaukeetoolshdc.gr/api/admin/sso/callback"}]` |

- Τα `callbackUrl` πρέπει να είναι `https://`. Το `http://localhost:*` γίνεται δεκτό μόνο όταν `NODE_ENV !== "production"`.
- Το origin κάθε `callbackUrl` πρέπει να είναι **ακριβώς** το origin όπου το προσωπικό ανοίγει το `/admin` του eshop (= το `NEXT_PUBLIC_SITE_URL` του), χωρίς redirect μπροστά του (π.χ. www↔apex 301). Το cookie `sso_state` είναι host-only, άρα σε άλλο host το callback αποτυγχάνει πάντα με `no_state`, και ένα 301 σε POST χάνει το token. (Kolleris: `https://kolleris.com`· το `web.kolleris.com` κάνει 301 προς αυτό.)
- Το `ESHOP_SSO_ISSUER` πρέπει να είναι ίδιο, χαρακτήρα προς χαρακτήρα, με το `ADMIN_SSO_ISSUER` κάθε eshop (η τελική κάθετος αφαιρείται και στις δύο πλευρές).
- Αν το `ESHOP_SSO_CLIENTS` είναι άκυρο, ή λείπει το ιδιωτικό κλειδί, το `/sso/eshop` απαντά 503 «Το SSO δεν έχει ρυθμιστεί».

**Eshop (Coolify, και στα δύο):**

| Μεταβλητή | Περιεχόμενο |
|---|---|
| `ADMIN_SSO` | `off` (προεπιλογή) \| `both` \| `only` |
| `ADMIN_SSO_CLIENT_ID` | `kolleris` / `milwaukee` |
| `HDCTOOL_SSO_URL` | `https://hdctool.wwa.gr` |
| `ADMIN_SSO_ISSUER` | `https://hdctool.wwa.gr` |
| `ADMIN_EMERGENCY_EMAILS` | 1–2 emails |

Τιμές του `ADMIN_SSO`:
- `off`: όπως σήμερα.
- `both`: κουμπί SSO **και** φόρμα κωδικού για όλους.
- `only`: κουμπί SSO. Η φόρμα κωδικού υπάρχει μόνο στο `/admin/login/emergency`, μόνο για τη λίστα.

Τα secrets δεν μπαίνουν ποτέ στο repo ή στο chat. Το ζεύγος κλειδιών δημιουργείται με script που γράφει απευθείας σε αρχείο, και ο χρήστης το περνά στο Coolify.

## 6. Σφάλματα

| Περίπτωση | Τι βλέπει ο χρήστης | Log |
|---|---|---|
| HDCtool εκτός λειτουργίας (start δεν φτάνει) | Ο browser δείχνει σφάλμα του hdctool. Η σελίδα σύνδεσης του eshop έχει μόνιμα την υπόδειξη «Αν το HDCtool δεν είναι διαθέσιμο, δοκίμασε σε λίγο». Οι λογαριασμοί έκτακτης ανάγκης μπαίνουν από `/admin/login/emergency`. | — |
| Χωρίς ρόλο / ανενεργός στο HDCtool | Σελίδα HDCtool «Δεν έχεις πρόσβαση…» | `eshop_sso_denied` |
| Αντικρουόμενοι ρόλοι | Σελίδα HDCtool «Αντικρουόμενοι ρόλοι…» | `eshop_sso_denied reason=conflict` |
| Token ληγμένο / ξαναχρησιμοποιημένο / λάθος υπογραφή / λάθος `aud` / λάθος ή χαμένο `state` | eshop: «Η σύνδεση δεν ολοκληρώθηκε, ξαναδοκίμασε» | `admin_sso_rejected reason=…` |
| Email δεμένο σε άλλο id HDCtool | ίδιο γενικό μήνυμα | `reason=email_bound_to_other` |
| Χρήστης απενεργοποιημένος τοπικά | ίδιο γενικό μήνυμα | `reason=disabled_locally` |
| Το email είναι στη λίστα έκτακτης ανάγκης (§4.3) | ίδιο γενικό μήνυμα | `reason=emergency_account` |
| Τα κλειδιά δεν φορτώνουν και δεν υπάρχει αποθηκευμένο | ίδιο γενικό μήνυμα | `reason=jwks_unavailable` |

## 7. Ασφάλεια (σύνοψη)
- Ασύμμετρη υπογραφή: το eshop δεν μπορεί να εκδώσει token.
- Επιτρέπεται μόνο `alg=ES256`. Τα `none` και HS* απορρίπτονται.
- Το `aud` εμποδίζει ένα token του Milwaukee να χρησιμοποιηθεί στο Kolleris.
- Το `state` σε cookie, δεμένο στον browser που ξεκίνησε τη ροή, λειτουργεί ως CSRF / login-CSRF.
- Το `jti` (unique insert) εμποδίζει την επανάληψη μέσα στα 60″.
- Η επιστροφή γίνεται μόνο στο καταχωρημένο `callbackUrl` (όχι open redirect). Το return path του eshop είναι μόνο σχετικό, κάτω από `/admin`.
- Το token δεν μπαίνει ποτέ σε URL (μόνο σε POST body), ούτε σε log. Οι σελίδες έχουν `no-store`.
- Rate limit στο `/api/admin/sso/callback`: ο πίνακας και τα όρια του login, ανά IP. Μετρούν μόνο οι αποτυχίες που μπορεί να προκαλέσει σκόπιμα ένας επιτιθέμενος (`bad_signature`, `bad_claims`, `bad_role`), και όσο ισχύει το κλείδωμα δεν γράφεται νέα γραμμή, ώστε ένα γραφείο πίσω από κοινή IP να μην κλειδώνεται από συνηθισμένα σφάλματα (`no_state`, `expired`, `replay`, `jwks_unavailable` κ.λπ.).
- Εναλλαγή κλειδιού:
  1. Το νέο κλειδί μπαίνει ως κύριο και το παλιό ως `PREVIOUS`. Το JWKS δείχνει και τα δύο.
  2. Μετά από 1 ώρα (cache των eshop) το `PREVIOUS` αφαιρείται.

## 8. Δομή κώδικα

**HDCtool**
- `src/lib/eshop-sso/config.ts`: ανάγνωση και επικύρωση των env (clients, κλειδιά).
- `src/lib/eshop-sso/role.ts`: `resolveEshopRole(permissionKeys, client)` → `{ ok, role } | { ok:false, reason:"none"|"conflict" }`.
- `src/lib/eshop-sso/token.ts`: `signEshopToken(claims)` με `jose`.
- `src/app/sso/eshop/route.ts`: η ροή του §3.2, με HTML σελίδες άρνησης και auto-POST.
- `src/app/.well-known/eshop-sso-keys/route.ts`: JWKS.

**Κάθε eshop** (ίδια δομή και στα δύο, προσαρμοσμένη στα υπάρχοντα paths του καθενός):
- `src/lib/admin/sso/config.ts`: `ADMIN_SSO` mode, client id, issuer, λίστα έκτακτης ανάγκης.
- `src/lib/admin/sso/jwks.ts`: ανάγνωση κλειδιών με cache 1h και το όριο ανανέωσης.
- `src/lib/admin/sso/verify.ts`: `verifySsoToken(token, expectedState)` → claims ή `{ reason }` (βήματα 2–5, 7 του §3.4).
- `src/lib/admin/sso/link-user.ts`: η αντιστοίχιση του §4.2.
- `src/app/api/admin/sso/start/route.ts`, `src/app/api/admin/sso/callback/route.ts`.
- Το next-auth δέχεται τη σύνδεση μέσω ενός δεύτερου Credentials provider `hdctool-sso`. Το authorize του δέχεται μόνο ένα **εσωτερικό** μίας χρήσης ticket που δημιουργεί το callback, ώστε να μη χρειάζεται δεύτερη επαλήθευση token από τον client.
- Σελίδες: κουμπί στο `/admin/login` και νέα `/admin/login/emergency`.
- Prisma: οι αλλαγές του §4.2, με migration.

Το ticket είναι τυχαίο. Γράφεται στο `AdminSsoJti` με πρόθεμα `t:` και `expiresAt` = τώρα + 30″, ώστε να δουλεύει και με περισσότερα από ένα instance. Καταναλώνεται μία φορά (delete που πρέπει να βρει γραμμή). Έτσι η σύνδεση next-auth ανοίγει από το δικό μας callback χωρίς να εκτίθεται κάτι στον client.

## 9. Δοκιμές

**HDCtool (unit):**
- `resolveEshopRole`: admin, admin+editor → ADMIN; editor; ops; editor+ops → conflict; κανένα → none; ALL χωρίς ρητό → none; δικαίωμα του άλλου eshop → none.
- `config`: απορρίπτεται `http://` callback σε production; άκυρο JSON → μη ρυθμισμένο.
- `signEshopToken`: τα claims, το `kid` και `exp = iat + 60`.

**Eshop (unit):**
- `verifySsoToken`: σωστό → ok. Απορρίψεις για:
  - λάθος `aud`;
  - λάθος `iss`;
  - ληγμένο;
  - `iat` στο μέλλον;
  - λάθος `state`;
  - υπογραφή με άλλο κλειδί;
  - `alg` HS256 / none;
  - άγνωστος ρόλος.
- `jti`: η δεύτερη χρήση του ίδιου απορρίπτεται ως `replay`.
- `linkUser`:
  - νέος χρήστης;
  - πρώτη σύνδεση με email (κρατά το id);
  - επόμενη με id μετά από αλλαγή email;
  - email δεμένο σε άλλο id → απόρριψη;
  - τοπικά ανενεργός → απόρριψη;
  - ενημέρωση ρόλου.
- Έκτακτη ανάγκη: σε `only`, email εκτός λίστας αποτυγχάνει και email της λίστας περνά. Σε `both`, όλοι περνούν.
- `start`: μόνο σχετικό return path κάτω από `/admin`, και οι ρυθμίσεις του cookie (`SameSite=None; Secure; httpOnly`).

**Από άκρη σε άκρη, τοπικά:**
- HDCtool + Kolleris + Milwaukee, με `localhost` callbacks και τοπικό ζεύγος κλειδιών.
- Σενάρια: σύνδεση; άρνηση χωρίς ρόλο; token του ενός eshop στο άλλο → απόρριψη; έκτακτη ανάγκη.

## 10. Μετάβαση χωρίς να κλειδωθεί κανείς έξω

1. **HDCtool:**
   - Δημιουργία ζεύγους κλειδιών, που περνά στο Coolify ο χρήστης.
   - Deploy του κώδικα.
   - Ο χρήστης αναθέτει τους ρόλους eshop στο προσωπικό.
   - Δεν υπάρχει αλλαγή βάσης.
2. **Eshop (το καθένα χωριστά):**
   - Πρώτα το migration στο prod: `migrate deploy`, ή diff/apply μόνο με προσθήκες, όπως με τις πωλήσεις ΕΕ. Μετά επαλήθευση με νέο diff, που πρέπει να βγει κενό.
   - Μετά το deploy με `ADMIN_SSO=both` και `ADMIN_EMERGENCY_EMAILS`.
3. **Δοκιμή:** κάθε μέλος του προσωπικού μπαίνει μία φορά με «Σύνδεση με HDCtool». Έτσι δένεται ο λογαριασμός του, και ελέγχονται ρόλος και ιστορικό.
4. **`ADMIN_SSO=only`** όταν όλοι μπαίνουν μέσω HDCtool. Η επιστροφή γίνεται με μία μεταβλητή (`both`), χωρίς deploy κώδικα.

Η σειρά υλοποίησης είναι HDCtool → Kolleris → Milwaukee. Το Kolleris πάει πρώτο, όπως και στις πωλήσεις ΕΕ.

## 11. Εκτός εύρους
- Πλήρης OIDC provider, refresh tokens, άμεση ανάκληση ενεργών συνδέσεων από το HDCtool.
- Κοινή αποσύνδεση (single logout).
- Αλλαγές στη βάση του HDCtool.
- Μετάβαση του ίδιου του HDCtool σε άλλο σύστημα ταυτότητας.
