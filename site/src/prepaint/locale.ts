import { localeChoice } from "../i18n/choice";
import { LOCALES } from "../i18n/locales";

const choice = localeChoice(LOCALES);
const { chosen, search } = choice.query(location.search);
if (chosen !== null) {
  choice.save(chosen);
  history.replaceState(
    history.state,
    "",
    location.pathname + search + location.hash,
  );
}
const to = choice.redirect(
  location.pathname,
  chosen ?? choice.saved(),
  navigator.languages || [navigator.language],
);
if (to !== null) location.replace(to + search + location.hash);
