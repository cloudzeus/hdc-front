/**
 * Wording that claims to represent a manufacturer. Never in public copy: the
 * HDC sells Milwaukee and is run by ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ; it does not present
 * itself as the manufacturer's dealer, agent or distributor (spec Δ5,
 * src/config/shop.ts). Client-safe: the admin editor checks with it live.
 */
export const DEALER_WORDING =
  /αντιπρ[οό]σωπ|αντιπροσωπε[ίι]|διανομ[εέ]α|επ[ίι]σημη διανομ|εξουσιοδοτημ[εέ]ν|dealer|distribut|authori[sz]ed|official (reseller|partner)|rivenditore autorizzato|concessionari/i;
