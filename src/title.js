import { ACCENTS, MenuModels } from "./menu3d.js";

// The title screen: a card per place, each with a little live model, and a
// button back to wherever you were.
export class TitleScreen {
  constructor({ places, done, onPick, onResume }) {
    this.places = places;
    this.done = done;
    this.el = document.getElementById("menu");
    this.cards = document.getElementById("scene-cards");
    this.models = new MenuModels(document.getElementById("menu-models"));
    const hover = (e) => { this.models.hover = e.target.closest?.(".scene-card")?.dataset.id ?? null; };
    this.cards.addEventListener("pointerover", hover);
    this.cards.addEventListener("pointerleave", () => (this.models.hover = null));
    this.cards.addEventListener("focusin", hover);
    this.cards.addEventListener("click", (e) => {
      const card = e.target.closest(".scene-card");
      if (card) onPick(places.find((s) => s.id === card.dataset.id));
    });
    document.getElementById("resume").addEventListener("click", onResume);
    this.build();
  }

  get isOpen() {
    return !this.el.hidden;
  }

  build() {
    this.cards.innerHTML = this.places.map((s) => `
      <li><button class="scene-card" data-id="${s.id}" style="--c: ${ACCENTS[s.id] ?? "#9fb4ff"}">
        <div class="stage" data-stage="${s.id}"></div>
        <div class="card-text">
          <h3>${s.title}</h3>
          <span class="tag">${s.tag}${this.done[s.id] ? ' · <span class="done">complete</span>' : ""}</span>
          <p>${s.blurb}</p>
        </div>
      </button></li>`).join("");
  }

  // resumeTitle: the place you can go back to, if any.
  open(resumeTitle) {
    this.build();
    document.getElementById("resume").hidden = !resumeTitle;
    if (resumeTitle) document.getElementById("resume-name").textContent = resumeTitle;
    this.el.hidden = false;
    document.getElementById("hud").hidden = true;
  }

  close() {
    this.el.hidden = true;
    document.getElementById("hud").hidden = false;
  }

  render(dt) {
    this.models.render(dt);
  }
}
