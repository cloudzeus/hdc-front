import { Link } from "@/i18n/navigation";

/**
 * A home section's head (mockup `.sechead`): the display title on the left, a
 * red "ALL …" link on the right.
 */
export function HomeSectionHead({
  title,
  link,
}: {
  title: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="hdc-sechead">
      <h2 className="hdc-disp">{title}</h2>
      {link && (
        <Link href={link.href} prefetch={false}>
          {link.label}
        </Link>
      )}
    </div>
  );
}
