# Open the phone nav as a sheet under the header

Amends [ADR 0031](0031-give-every-site-page-one-nav.md).

Below 50rem, the site's nav opened one shadcn Dropdown Menu that floated from
its menu button. It listed the three places, every language as a radio item,
and the theme switch with its whole description as visible text. The owner
found this unconventional: a floating menu, a long theme label and the full
language list
([#453](https://github.com/lutzseverino/repo-standards/issues/453)). The
docs' header already uses the conventional phone pattern, and ADR 0031 makes
the nav and that header the same object.

On a phone, the menu button now opens a sheet under the header and turns into
a close button. The sheet is a solid band in the page's colour, flush under
the header's hairline, with a hairline at its bottom. It lists Documentation,
How it works and GitHub as full-width rows, with the current page's row
pressed. Below them, behind a hairline, one row holds the preferences in ADR
0031's order: the language selector at its start, then the theme toggle at
its end. The selector shows the page's language by its own name, with a
chevron, and opens the language list below it. The theme toggle shows its
icon alone and keeps its description as its accessible name. The page below
the sheet is dimmed, 40% black by day and 60% by night, doesn't scroll, and
closes the sheet when tapped. The motion follows the November 12 amendment
below.

The sheet is a disclosure of plain links and buttons inside the nav, not a
menu, following the APG disclosure navigation pattern. Up and Down Arrow, Home
and End move between its controls without wrapping, and never open the
language list, which only Enter, Space or a tap opens. Escape closes the list
first, then the sheet. Tab moves through it in order, and focus leaving it for
the page closes it. Every control in it and in the list shows the Button's
focus ring.

On a phone this overrides ADR 0031's sentences that the language menu shows
its icon alone and that changing the language or the theme takes two taps:
the selector shows the language's name, and the theme takes two taps while
the language takes three. The wide bar, its order, weight and controls stay
as ADR 0031 records them, and the docs' header is unchanged.

The owner chose this on 2026-10-31, as option A of a clickable prototype of
three phone menus in the real site: "I like A too. Let's go with that." The
others were option B, a pane as tall as the screen like the docs', and option
C, which moved the theme icon into the header row. The floating language list
and the dimmed page are as option A showed them.

Amended for [#463](https://github.com/lutzseverino/repo-standards/issues/463)
by the owner's 2026-11-03 choice: the theme icon now opens a System / Light /
Dark choice menu, named Theme, with the selected preference discernible. Both
preferences take three taps on a phone. Escape dismisses either preference
menu before the sheet and restores its trigger. This replaces the two-way
theme toggle and its description; the remaining disclosure conventions stay
as above.

Amended for [#465](https://github.com/lutzseverino/repo-standards/issues/465)
by the owner's [2026-11-12 decision](https://github.com/lutzseverino/repo-standards/issues/465#issuecomment-6832262010):
"Let's follow your recommendations." The registry's Collapsible supplies the
disclosure lifecycle through ADR 0028's app layer. Opening expands the panel
downward from the header to its content height; closing collapses it back.
The scrim fades concurrently. Both use **200 ms ease-out**, opening and
closing, with the exit visible until it finishes. Under
`prefers-reduced-motion: reduce`, both directions are instant, with no panel
motion or scrim fade. This replaces the original no-animation decision only;
the final layout, non-modal disclosure and nested preference menus remain as
above, with no new public motion setting.
