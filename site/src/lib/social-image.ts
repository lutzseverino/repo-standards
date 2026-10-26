// The image a link to a page unfurls with. `scripts/social-image.mjs` draws
// one per locale; a page that passes no image of its own uses its locale's.
import { format } from "../i18n/format.ts";
import type { Locale } from "../i18n/locales.ts";

export type SocialImage = {
  /** The image's path on the site, or its absolute URL. */
  src: string;
  alt: string;
  width: number;
  height: number;
};

export function defaultSocialImage(locale: Locale): SocialImage {
  return {
    src:
      locale === "en" || locale === "en-XA"
        ? "/social.png"
        : `/social-${locale}.png`,
    alt: format(locale, "common.social-image.alt"),
    width: 1200,
    height: 630,
  };
}
