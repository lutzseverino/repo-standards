// The Repo Standards plate that leads home. The docs' header shows it as its
// title (docs/SiteTitle.astro) and the site's nav on every page but the
// homepage (site-nav.tsx), so the two are one plate.
import "@/styles/plate.css";

export function Plate({ href, name }: { href: string; name: string }) {
  return (
    <a href={href} className="site-plate" translate="no">
      {name}
    </a>
  );
}
