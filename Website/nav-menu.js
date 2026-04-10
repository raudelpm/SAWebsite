/**
 * Close mobile nav when tapping outside the header (main content / empty page area).
 * Works with existing toggleMenu() on .menu-toggle (click still toggles as before).
 */
(function () {
  function navLinksEl() {
    return document.getElementById('navLinks');
  }

  function navEl() {
    return document.querySelector('nav');
  }

  function closeMenuIfOpen() {
    var links = navLinksEl();
    if (links && links.classList.contains('active')) {
      links.classList.remove('active');
    }
  }

  function isMobileNavLayout() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
  }

  document.addEventListener(
    'pointerdown',
    function (e) {
      if (!isMobileNavLayout()) return;
      var links = navLinksEl();
      var nav = navEl();
      if (!links || !nav || !links.classList.contains('active')) return;
      if (nav.contains(e.target)) return;
      closeMenuIfOpen();
    },
    true
  );
})();
