(() => {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#primary-navigation");
  const compact = window.matchMedia("(max-width: 1000px)");
  if (toggle && nav) {
    toggle.hidden = false;
    const close = () => {
      nav.hidden = compact.matches;
      toggle.setAttribute("aria-expanded", "false");
    };
    close();
    compact.addEventListener("change", close);
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      nav.hidden = !open;
    });
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        toggle.getAttribute("aria-expanded") === "true"
      ) {
        close();
        toggle.focus();
      }
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) close();
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".site-header")) close();
    });
  }
  if (
    new URLSearchParams(location.search).get("enviado") === "1" &&
    location.pathname.endsWith("contact.html")
  ) {
    const form = document.querySelector("form");
    if (form) {
      const message = document.createElement("p");
      message.className = "form-confirmation";
      message.setAttribute("role", "status");
      message.textContent =
        "Gracias por escribirnos. Tu mensaje se ha enviado; te responderemos por correo.";
      form.before(message);
      message.scrollIntoView({ block: "center" });
    }
  }
})();

// Reveal sections once, without hiding content before JavaScript is available.
if (
  "IntersectionObserver" in window &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  const arrivals = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("section-arrived");
          arrivals.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 },
  );
  document
    .querySelectorAll("main > .section-light")
    .forEach((section) => arrivals.observe(section));
}
