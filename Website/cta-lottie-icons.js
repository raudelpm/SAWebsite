(function () {
  function initCtaLottieIcons() {
    if (typeof lottie === "undefined") return;

    var icons = document.querySelectorAll("[data-lottie-src]");
    var reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    icons.forEach(function (el) {
      var src = el.getAttribute("data-lottie-src");
      if (!src) return;

      var trigger = el.closest("a, button");
      var anim = lottie.loadAnimation({
        container: el,
        renderer: "svg",
        loop: reducedMotion,
        autoplay: reducedMotion,
        path: src,
      });

      if (reducedMotion || !trigger) return;

      anim.goToAndStop(0, true);

      function playIcon() {
        anim.goToAndPlay(0, true);
      }

      function resetIcon() {
        anim.goToAndStop(0, true);
      }

      trigger.addEventListener("mouseenter", playIcon);
      trigger.addEventListener("mouseleave", resetIcon);
      trigger.addEventListener("focus", playIcon);
      trigger.addEventListener("blur", resetIcon);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCtaLottieIcons);
  } else {
    initCtaLottieIcons();
  }
})();
