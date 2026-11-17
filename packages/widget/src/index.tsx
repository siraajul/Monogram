import { render } from "preact";
import "./personalizer.css";

// Part 05 replaces this placeholder with the real option form.
function mount(root: HTMLElement) {
  render(
    <div class="pz-root">Personalizer widget loaded</div>,
    root,
  );
}

function init() {
  document
    .querySelectorAll<HTMLElement>("[data-personalizer-root]")
    .forEach(mount);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
