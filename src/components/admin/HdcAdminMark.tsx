import Image from "next/image";
import { upGreek } from "@/lib/greek";
import { cn } from "@/lib/utils";

/**
 * Το σήμα του διαχειριστικού: το lockup του Milwaukee Heavy Duty Centre και από
 * κάτω «Διαχείριση».
 *
 * Το ίδιο lockup σε σκούρο και ανοιχτό φόντο, όπως στην κεφαλίδα του eshop: τα
 * δύο κουτιά του (κόκκινο, μαύρο) στέκονται και στα δύο. Τα αρχεία
 * `logo-horizontal-white.png` / `logo-symbol-white.png` του `public/brand/`
 * είναι σήματα της Kolleris, όχι του HDC, και δεν χρησιμοποιούνται εδώ.
 * Το `tone` αλλάζει μόνο το χρώμα της λεζάντας.
 */
const LOCKUP = { src: "/brand/hdc-lockup-440.png", width: 440, height: 183 } as const;

export function HdcAdminMark({
  tone,
  width = 160,
  className,
  priority = false,
}: {
  tone: "dark" | "light";
  /** Πλάτος του lockup σε px· το ύψος ακολουθεί την αναλογία του αρχείου. */
  width?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex flex-col items-start gap-1.5", className)}>
      <Image
        src={LOCKUP.src}
        width={width}
        height={Math.round((width * LOCKUP.height) / LOCKUP.width)}
        alt="Milwaukee Heavy Duty Centre"
        priority={priority}
      />
      <span
        className={cn(
          "text-[length:var(--fs-12)] font-medium tracking-[0.14em]",
          tone === "dark" ? "text-k-text-5" : "text-k-text-3",
        )}
      >
        {upGreek("Διαχείριση")}
      </span>
    </span>
  );
}
