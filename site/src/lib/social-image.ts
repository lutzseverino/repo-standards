// The image a link to a page unfurls with. `public/social.png` is drawn by
// `scripts/social-image.mjs`; a page that passes no image of its own uses it.
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
    src: "/social.png",
    alt: format(locale, "common.social-image.alt"),
    width: 1200,
    height: 630,
  };
}
