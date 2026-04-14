/**
 * Close the mobile / compact nav dropdown when clicking outside it.
 * The fixed header uses z-index 1000, so clicks on the page often hit layers *under*
 * the nav in the stacking order and never reach a clean “outside nav” target.
 * We add body.nav-menu-open + a full-viewport ::before (z-index 999) so outside taps
 * always register; nav + dropdown stay above at 1000.
 */
(function () {
  function navLinksEl() {
    return document.getElementById('navLinks');
  }

  function ensureBlogNavItem() {
    var links = navLinksEl();
    if (!links) return;

    var already = links.querySelector('a[href="blog.html"], a[href="./blog.html"], a[href="/blog.html"]');
    if (already) return;

    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = 'blog.html';
    a.textContent = 'Blog';
    li.appendChild(a);

    var ctaLi = links.querySelector('a.nav-cta-btn');
    if (ctaLi && ctaLi.parentElement && ctaLi.parentElement.parentElement === links) {
      links.insertBefore(li, ctaLi.parentElement);
    } else {
      links.appendChild(li);
    }
  }

  function navEl() {
    return document.querySelector('nav');
  }

  function syncBodyOpenClass() {
    var links = navLinksEl();
    if (!document.body || !links) return;
    document.body.classList.toggle('nav-menu-open', links.classList.contains('active'));
  }

  function closeMenuIfOpen() {
    var links = navLinksEl();
    if (links && links.classList.contains('active')) {
      links.classList.remove('active');
      syncBodyOpenClass();
    }
  }

  function eventTargetElement(e) {
    var t = e.target;
    if (!t) return null;
    if (t.nodeType === 3 && t.parentElement) return t.parentElement;
    return t;
  }

  function isInsideNav(e) {
    var nav = navEl();
    if (!nav) return false;
    var el = eventTargetElement(e);
    if (!el) return false;
    if (typeof el.closest === 'function' && el.closest('nav')) return true;
    return nav.contains(el);
  }

  function onOutsideClose(e) {
    var links = navLinksEl();
    if (!links || !links.classList.contains('active')) return;
    if (isInsideNav(e)) return;
    closeMenuIfOpen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      ensureBlogNavItem();
      syncBodyOpenClass();
    });
  } else {
    ensureBlogNavItem();
    syncBodyOpenClass();
  }

  var linksForObserver = navLinksEl();
  if (linksForObserver && typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(syncBodyOpenClass);
    observer.observe(linksForObserver, { attributes: true, attributeFilter: ['class'] });
  }

  document.addEventListener('pointerdown', onOutsideClose, true);
  document.addEventListener('mousedown', onOutsideClose, true);
  document.addEventListener('click', onOutsideClose, true);
})();
