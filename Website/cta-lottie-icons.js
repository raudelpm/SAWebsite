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

      var anim = lottie.loadAnimation({
        container: el,
        renderer: "svg",
        loop: !reducedMotion,
        autoplay: !reducedMotion,
        path: src,
      });

      if (reducedMotion) {
        anim.goToAndStop(0, true);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCtaLottieIcons);
  } else {
    initCtaLottieIcons();
  }
})();
