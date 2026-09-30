/*
 * The blog index keeps the generic skeleton. It sits in `(index)` so that
 * this boundary does not wrap `blog/[slug]`: an unknown post must answer a
 * real 404 status, which a streamed loading state rules out.
 */
export { default } from "../../(site)/loading";
