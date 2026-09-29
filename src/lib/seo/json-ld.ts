/**
 * JSON-LD for a `<script type="application/ld+json">` body.
 *
 * `JSON.stringify` leaves `<` alone, so a product name or description holding
 * `</script>` would end the script and whatever follows would run as markup.
 * `<` is the same character to a JSON parser and nothing to the HTML one.
 */
export function jsonLdHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
