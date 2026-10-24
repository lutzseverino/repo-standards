// The image a link to a page unfurls with. `public/social.png` is drawn by
// `scripts/social-image.mjs`; a page that passes no image of its own uses it.
export type SocialImage = {
  /** The image's path on the site, or its absolute URL. */
  src: string;
  alt: string;
  width: number;
  height: number;
};

export const defaultSocialImage: SocialImage = {
  src: "/social.png",
  alt: "A blue road sign reading Repo Standards: Write your setup down once. Your coding agent applies it to every repository.",
  width: 1200,
  height: 630,
};
