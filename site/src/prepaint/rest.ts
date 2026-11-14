// Draw the page at rest before its first paint. Fonts arriving before
// hydration change plate sizes, so settle again until the torch takes over.
import { fitName } from "../components/sign/fit-name";
import { dressPosts, sinkPosts } from "../components/sign/posts";
import { lightRig } from "../components/sign/rig";

const settle = () => {
  document.querySelectorAll<HTMLElement>(".signpost-name").forEach(fitName);
  const assembly = document.querySelector<HTMLElement>(".sign-assembly");
  if (assembly) {
    sinkPosts(assembly);
    dressPosts(assembly);
  }
};
const rig = lightRig();
settle();
rig.rest();
void document.fonts.ready.then(() => {
  if (document.documentElement.hasAttribute("data-torch")) return;
  settle();
  rig.rest();
});
