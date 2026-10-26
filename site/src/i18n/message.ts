// The site's one seam to the MessageFormat 2 library: every message is parsed
// and formatted here, and nothing else imports `messageformat`. It knows no
// catalogs, locales or pages, so an island that formats on the client can use
// it without the catalogs, and the translation checks can be lifted out with
// it. Dates, numbers and lists reach a message already formatted through
// `Intl`, so no message uses MF2's Draft functions.
import {
  MessageFormat,
  isVariableRef,
  parseMessage,
  stringifyMessage,
  visit,
  type Model,
} from "messageformat";

export type MessageValues = Record<string, string | number>;

/** Formats `source`, the MF2 message `id`, in `locale`. It throws instead of
 * showing a fallback: on a message that doesn't parse, a variable without a
 * value, or any other formatting error. */
export function formatMessage(
  locale: string,
  id: string,
  source: string,
  values: MessageValues = {},
): string {
  const fail = (error: unknown): never => {
    throw new Error(
      `Message ${id} in ${locale}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  };
  let message: MessageFormat;
  try {
    // placeholders are inserted as they are, without bidi isolation marks
    message = new MessageFormat(locale, source, { bidiIsolation: "none" });
  } catch (error) {
    return fail(error);
  }
  const errors: unknown[] = [];
  const text = message.format(values, (error) => errors.push(error));
  return errors.length > 0 ? fail(errors[0]) : text;
}

/** The variables a message takes from its caller, in every variant: those it
 * references, less those it declares with `.local`. */
export function messageVariables(source: string): Set<string> {
  const message = parseMessage(source);
  const used = new Set<string>();
  const local = new Set<string>();
  for (const declaration of message.declarations)
    if (declaration.type === "local") local.add(declaration.name);
  visit(message, {
    value(value) {
      if (isVariableRef(value)) used.add(value.name);
    },
  });
  for (const name of local) used.delete(name);
  return used;
}

/** Rewrites each pattern of a message, every variant's in a select message,
 * leaving its declarations, selectors, keys and placeholders as they are.
 * `text` is the pattern's own text, without placeholders. */
export function mapPatterns(
  source: string,
  rewrite: (pattern: Model.Pattern, text: string) => Model.Pattern,
): string {
  const message = parseMessage(source);
  const map = (pattern: Model.Pattern) =>
    rewrite(
      pattern,
      pattern.filter((part) => typeof part === "string").join(""),
    );
  const mapped: Model.Message =
    message.type === "message"
      ? { ...message, pattern: map(message.pattern) }
      : {
          ...message,
          variants: message.variants.map((variant) => ({
            ...variant,
            value: map(variant.value),
          })),
        };
  return stringifyMessage(mapped);
}
