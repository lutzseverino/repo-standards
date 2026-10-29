# Give every site page one nav shaped like the docs' header

The homepage, How it works and the source pages each built their own nav, and
they drifted apart in alignment, order, controls and phone layout. Every page
outside the docs now renders one shared nav, `site/src/components/site-nav.tsx`.
A page passes only its locale, its language versions, which item is the
current page, and, on the homepage, what How it works does: it plays the
sign's story there instead of opening its page.

The nav takes the shape of Starlight's header on `/docs/`: a bar across the
whole window, outside every page's column, 4rem high from Starlight's 50rem
breakpoint up, with the same horizontal padding and a hairline below. It
shows the docs' title plate, which leads home, in the same place. The
homepage leaves the plate out, because the large Repo Standards sign directly
below says the same.

Its items run from near to far, left to right:

1. where you are: the plate;
2. where you can go on this site: Documentation, then How it works;
3. where you can go off the site: GitHub;
4. Support;
5. how you see the site: the language menu, then the theme toggle.

Groups 1 and 2 sit on the left, the others on the right. A later item joins
the group its rule names instead of being appended at the end. Places are
words and preferences are icons: the language menu shows its icon alone, and
its accessible name keeps the page's language. Support is the one control
with emphasis, the outlined button; every other control is a ghost button,
and the current page's item reads as pressed. Below 50rem, where the docs'
header collapses too, the bar holds the plate, Support's heart and one menu.
The menu holds the places, the languages and the theme switch, and a later
item goes into it rather than into the row.

The owner chose this on 2026-10-27, as option C of a prototype with three
layouts, and on 2026-10-29 kept the emphasis on Support rather than moving it
to Documentation
([#440](https://github.com/lutzseverino/repo-standards/issues/440)). Only
this layout makes the site's nav and the docs' header the same object, so no
page's column decides where the nav sits, and its phone row has room to
spare at 320 px in every locale. The cost is two taps on a phone to change
the language or the theme. Option A kept every destination visible on a
phone, in a second row that grew to a third at 320 px in Spanish and Catalan.
Option B kept the language and theme in the phone row, beside a plate that
nearly touched them at 320 px.
