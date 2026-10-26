// The message IDs, from the default locale's catalogs, and the shapes islands
// receive their text in. Types only, so an island imports no catalog.
import type adoption from "./messages/en/adoption.json";
import type common from "./messages/en/common.json";
import type home from "./messages/en/home.json";
import type howItWorks from "./messages/en/how-it-works.json";
import type sign from "./messages/en/sign.json";
import type sources from "./messages/en/sources.json";

type Ids<Area extends string, Catalog> = `${Area}.${keyof Catalog & string}`;

/** `<area>.<key>`: the catalog file and the key within it. */
export type MessageId =
  | Ids<"adoption", typeof adoption>
  | Ids<"common", typeof common>
  | Ids<"home", typeof home>
  | Ids<"how-it-works", typeof howItWorks>
  | Ids<"sign", typeof sign>
  | Ids<"sources", typeof sources>;

/** Finished text for an island, by message ID. */
export type Strings<Id extends MessageId> = { readonly [K in Id]: string };

/** A formatted message with elements in it: its text at even indexes and,
 * between them, the names of the slots its caller fills with elements. */
export type Rich = string[];
