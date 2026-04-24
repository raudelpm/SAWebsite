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

  function blogIndexHref() {
    // Root-relative so it always resolves to /blog.html (never /blog/blog.html) from
    // article URLs like /blog/post.html. Assumes the site is served with Web root at host /.
    return '/blog.html';
  }

  function ensureBlogNavItem() {
    var links = navLinksEl();
    if (!links) return;

    var already = links.querySelector(
      'a[href="blog.html"], a[href="./blog.html"], a[href="/blog.html"], a[href="../blog.html"]'
    );
    if (already) {
      // Upgrade legacy relative blog link when we're on a /blog/*.html article (wrong target was /blog/blog.html).
      var path = (window.location.pathname || '').replace(/\\/g, '/');
      if (path.indexOf('/blog/') !== -1 && already.getAttribute('href') === 'blog.html') {
        already.setAttribute('href', '/blog.html');
      }
      return;
    }

    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = blogIndexHref();
    a.textContent = 'Blog';
    li.appendChild(a);

    var quickA = document.getElementById('quickScreenQuoteNav');
    var quickLi = quickA && quickA.closest('li');
    var ctaA = links.querySelector('a.nav-cta-btn');
    var ctaLi = ctaA && ctaA.parentElement;
    var insertBefore =
      quickLi && quickLi.parentElement === links
        ? quickLi
        : ctaLi && ctaLi.parentElement === links
          ? ctaLi
          : null;
    if (insertBefore) {
      links.insertBefore(li, insertBefore);
    } else {
      links.appendChild(li);
    }
  }

  function ensureFooterSocialLinks() {
    var brand = document.querySelector('footer .footer-brand');
    if (!brand) return;
    if (brand.querySelector('.footer-social-links')) return;

    var wrap = document.createElement('div');
    wrap.className = 'footer-social-links';
    wrap.setAttribute('aria-label', 'Social links');

    function addLink(kind, href, label, imgSrc) {
      var a = document.createElement('a');
      a.className = 'footer-social-link footer-social-link--' + kind;
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', label);

      var img = document.createElement('img');
      img.src = imgSrc;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';

      a.appendChild(img);
      wrap.appendChild(a);
    }

    addLink(
      'facebook',
      'https://www.facebook.com/profile.php?id=61579752359204&locale=es_LA',
      'Visit us on Facebook',
      '/public/facebooklogo.png'
    );
    addLink(
      'yelp',
      'https://www.yelp.com/biz/screen-armors-nokomis?osq=screen+armors',
      'Read our Yelp reviews',
      '/public/logoyelp2.png'
    );
    addLink(
      'whatsapp',
      'https://wa.me/19414049699',
      'Chat with us on WhatsApp',
      '/public/%E2%80%94Pngtree%E2%80%94white%20whatsapp%20icon%20png%20vector_3562063.png'
    );

    brand.appendChild(wrap);
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
      ensureFooterSocialLinks();
      syncBodyOpenClass();
    });
  } else {
    ensureBlogNavItem();
    ensureFooterSocialLinks();
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
