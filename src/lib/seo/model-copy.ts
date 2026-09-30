import type { Availability } from "@/lib/catalog/availability";
import type { FaqPair } from "@/lib/seo/product-faq";
import type { KeySpec } from "@/lib/seo/product-seo";
import { cutAtWord } from "@/lib/seo/size-variant";

/**
 * The automatic Greek copy of a model page (/montelo/m18-fpd3): the H1, the
 * <title>, the description, the 40–60-word answer that opens the page and the
 * FAQ — every sentence built from the catalogue (versions, article numbers,
 * what each kit holds, the manufacturer's key figure). Nothing invented; a
 * MODEL SeoOverride replaces any of it field by field.
 *
 * Greek only: SEO targets the Greek market (owner decision, 30/9/2026).
 */

export type ModelVersion = {
  /** «M18 FPD3-502X» */
  code: string;
  /** Milwaukee article number. */
  code2: string;
  content: "bare" | "kit" | null;
  /** What a kit holds, as the product page words it, or null. */
  contents: string | null;
  availability: Availability;
};

export type ModelCopyInput = {
  /** «M18 FPD3» */
  root: string;
  /** «Κρουστικό δραπανοκατσάβιδο» — possibly in ERP capitals. */
  kind: string;
  platform: "M12" | "M18" | "MX";
  fuel: boolean;
  versions: ModelVersion[];
  keySpec: KeySpec | null;
};

const PLATFORM: Record<ModelCopyInput["platform"], string> = { M12: "M12 (12 V)", M18: "M18 (18 V)", MX: "MX FUEL" };
const BATTERY: Record<ModelCopyInput["platform"], string> = {
  M12: "κάθε μπαταρία Milwaukee M12",
  M18: "κάθε μπαταρία Milwaukee M18",
  MX: "τις μπαταρίες MX FUEL",
};

/** A kind that kept its accents reads as a phrase; ERP capitals are quoted. */
const hasLower = (s: string) => /\p{Ll}/u.test(s);
const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase("el") + s.slice(1);

const SPEC_EL: Record<KeySpec["key"], (v: string) => string> = {
  torque: (v) => `ροπή έως ${v} Nm`,
  speed: (v) => `έως ${v} σ.α.λ. χωρίς φορτίο`,
  impact: (v) => `έως ${v} κρούσεις το λεπτό`,
  energy: (v) => `ενέργεια κρούσης ${v} J`,
  chuck: (v) => `τσοκ ${v} mm`,
  drive: (v) => `υποδοχή ${v}`,
};

const SPEC_Q: Record<KeySpec["key"], string> = {
  torque: "Πόση ροπή έχει",
  speed: "Πόσες στροφές έχει",
  impact: "Πόσες κρούσεις δίνει",
  energy: "Πόση ενέργεια κρούσης έχει",
  chuck: "Τι τσοκ έχει",
  drive: "Τι υποδοχή έχει",
};

export function modelH1(input: Pick<ModelCopyInput, "root" | "kind">): string {
  return input.kind ? `Milwaukee ${input.root} — ${input.kind}` : `Milwaukee ${input.root}`;
}

/** «Milwaukee M18 FPD3 Κρουστικό δραπανοκατσάβιδο: εκδόσεις, κωδικοί», ≤ 65. */
export function modelTitle(input: Pick<ModelCopyInput, "root" | "kind">): string {
  const head = `Milwaukee ${input.root}`;
  const tail = ": εκδόσεις, κωδικοί";
  const room = 65 - head.length - tail.length - 1;
  const kind = input.kind && room >= 4 ? cutAtWord(input.kind, room) : "";
  return `${head}${kind ? ` ${kind}` : ""}${tail}`;
}

export function modelDescription(input: ModelCopyInput): string {
  const n = input.versions.length;
  const end = "Τιμές, διαθεσιμότητα και παραλαβή στον Πειραιά.";
  const build = (withKind: boolean, codes: string[]) => {
    const who = withKind && input.kind ? `${input.kind} Milwaukee ${input.root}` : `Milwaukee ${input.root}`;
    const versions = n === 1 ? `κωδικός ${codes[0]}` : `${n} εκδόσεις, κωδικοί ${codes.join(", ")}${codes.length < n ? " κ.ά." : ""}`;
    return `${who}: ${versions}. ${end}`;
  };
  const all = input.versions.map((v) => v.code2);
  for (const withKind of [true, false]) {
    for (let k = all.length; k >= 1; k--) {
      const text = build(withKind, all.slice(0, k));
      if (text.length <= 155) return text;
    }
  }
  return `${cutAtWord(build(false, all.slice(0, 1)), 154)}…`;
}

/**
 * The answer that opens the page: what it is, which platform, the
 * manufacturer's key figure, which versions the store has — and so who it
 * suits: anyone already on that platform's batteries.
 */
export function modelAnswer(input: ModelCopyInput): string {
  const what = !input.kind
    ? `Το Milwaukee ${input.root} είναι εργαλείο`
    : hasLower(input.kind)
      ? `Το Milwaukee ${input.root} είναι ${lowerFirst(input.kind)}`
      : `Το Milwaukee ${input.root} («${input.kind}») είναι εργαλείο`;
  const series = input.fuel && input.platform !== "MX" ? `, σειρά ${input.platform} FUEL` : "";
  const spec = input.keySpec ? `, με ${SPEC_EL[input.keySpec.key](input.keySpec.value)} σύμφωνα με τη Milwaukee` : "";
  const first = `${what} της πλατφόρμας ${PLATFORM[input.platform]}${series}${spec}.`;

  const bare = input.versions.find((v) => v.content === "bare");
  const kits = input.versions.filter((v) => v.content === "kit");
  const others = input.versions.filter((v) => v.content == null);
  const versions = (withCodes: boolean) => {
    const code = (v: ModelVersion) => (withCodes ? ` (${v.code})` : "");
    const parts: string[] = [];
    if (bare) parts.push(`το σκέτο εργαλείο, χωρίς μπαταρία και φορτιστή${code(bare)}`);
    if (kits.length === 1) parts.push(`ένα κιτ με μπαταρίες και φορτιστή${code(kits[0])}`);
    else if (kits.length > 1)
      parts.push(`${kits.length} κιτ με μπαταρίες και φορτιστή${withCodes ? ` (${kits.map((k) => k.code).join(", ")})` : ""}`);
    if (!bare && kits.length === 0 && others.length) parts.push(others.map((v) => v.code).join(", "));
    return parts.length ? `Στο κατάστημα θα βρείτε ${parts.join(" και ")}.` : "";
  };
  const third = `Δουλεύει με ${BATTERY[input.platform]}, άρα ταιριάζει σε όποιον έχει ήδη μπαταρίες ${input.platform === "MX" ? "MX FUEL" : input.platform}.`;

  const build = (withCodes: boolean) => [first, versions(withCodes), third].filter(Boolean).join(" ");
  const full = build(true);
  // 40–60 words is what a snippet or an assistant quotes whole.
  return full.split(/\s+/).length <= 60 ? full : build(false);
}

/** Questions the data can answer, and only those. */
export function modelFaq(input: ModelCopyInput): FaqPair[] {
  const pairs: FaqPair[] = [];
  const { root } = input;

  if (input.versions.length > 1) {
    pairs.push({
      q: `Ποιες εκδόσεις υπάρχουν του Milwaukee ${root} και ποιοι είναι οι κωδικοί τους;`,
      a: input.versions
        .map((v) => {
          const what =
            v.content === "bare"
              ? "μόνο το εργαλείο, χωρίς μπαταρία και φορτιστή"
              : v.contents
                ? `με ${v.contents.replace(/\.$/, "")}`
                : v.content === "kit"
                  ? "κιτ με μπαταρίες και φορτιστή"
                  : null;
          return `${v.code}, κωδικός ${v.code2}${what ? `: ${what}` : ""}.`;
        })
        .join(" "),
    });
  } else if (input.versions[0]) {
    const v = input.versions[0];
    pairs.push({ q: `Ποιος είναι ο κωδικός του Milwaukee ${v.code};`, a: `Ο κωδικός Milwaukee του ${v.code} είναι ${v.code2}.` });
  }

  const bare = input.versions.find((v) => v.content === "bare");
  const kit = input.versions.find((v) => v.content === "kit");
  if (bare && kit) {
    pairs.push({
      q: `Ποια είναι η διαφορά ανάμεσα στο ${bare.code} και το ${kit.code};`,
      a:
        `Είναι το ίδιο εργαλείο. Το ${bare.code} είναι μόνο το εργαλείο, για όποιον έχει ήδη μπαταρίες και φορτιστή. ` +
        `Το ${kit.code} ${kit.contents ? `έρχεται με ${kit.contents.replace(/\.$/, "")}` : "έρχεται σε κιτ με μπαταρίες και φορτιστή"}.`,
    });
  }

  if (input.keySpec) {
    pairs.push({
      q: `${SPEC_Q[input.keySpec.key]} το Milwaukee ${root};`,
      a: `Σύμφωνα με τα τεχνικά στοιχεία της Milwaukee, ${SPEC_EL[input.keySpec.key](input.keySpec.value)}.`,
    });
  }

  pairs.push({
    q: `Ποιες μπαταρίες ταιριάζουν στο Milwaukee ${root};`,
    a:
      input.platform === "MX"
        ? "Τα εργαλεία MX FUEL δουλεύουν με τις μπαταρίες MX FUEL. Οι μπαταρίες M12 και M18 δεν ταιριάζουν."
        : `Δουλεύει με ${BATTERY[input.platform]}. Οι μπαταρίες ${input.platform === "M18" ? "M12" : "M18"} δεν ταιριάζουν, γιατί κάθε πλατφόρμα έχει τις δικές της.`,
  });

  return pairs;
}
