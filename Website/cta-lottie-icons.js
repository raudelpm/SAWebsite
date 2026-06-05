(function () {
  var LOTTIE_SRC =
    "https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js";

  function loadLottie() {
    return new Promise(function (resolve, reject) {
      if (typeof lottie !== "undefined") {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = LOTTIE_SRC;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function initCtaLottieIcons() {
    var icons = document.querySelectorAll("[data-lottie-src]");
    if (!icons.length) return;

    var reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    loadLottie()
      .then(function () {
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
      })
      .catch(function () {});
  }

  function scheduleInit() {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(initCtaLottieIcons, { timeout: 2500 });
    } else {
      window.addEventListener("load", initCtaLottieIcons, { once: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleInit);
  } else {
    scheduleInit();
  }
})();
