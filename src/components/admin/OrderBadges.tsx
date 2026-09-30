import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Σήματα παραγγελίας που μοιράζονται η λίστα και η σελίδα της παραγγελίας.
 *
 * Το χρώμα αναμονής του HDC (--hdc-wait), το ίδιο με το «3–5 εργάσιμες» του
 * eshop: ο διαχειριστής βλέπει την ίδια υπόσχεση που είδε ο πελάτης.
 */
const WAIT = "border-[var(--hdc-wait)] bg-transparent text-[var(--hdc-wait)]";

/** Order.supplierOrder: η παραγγελία πάει ολόκληρη στον προμηθευτή, παγωμένο στην τοποθέτηση. */
export function SupplierOrderBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn(WAIT, "text-[length:var(--fs-11)]", className)}>
      Από προμηθευτή · 3–5 εργάσιμες
    </Badge>
  );
}

/** Γραμμή με xmlCode: προϊόν που υπάρχει μόνο στο XML του προμηθευτή, όχι ακόμα στο SoftOne. */
export function XmlOnlyBadge({ className }: { className?: string }) {
  return (
    <Badge
      className={cn(
        "border-k-line-2 bg-k-surface-2 px-1.5 py-0 text-[length:var(--fs-10)] text-k-text-2",
        className,
      )}
    >
      Μόνο-XML
    </Badge>
  );
}
