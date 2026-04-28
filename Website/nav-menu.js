/**
 * Close the mobile / compact nav dropdown when clicking outside it.
 * The fixed header uses z-index 1000, so clicks on the page often hit layers *under*
 * the nav in the stacking order and never reach a clean “outside nav” target.
 * We add body.nav-menu-open + a full-viewport ::before (z-index 999) so outside taps
 * always register; nav + dropdown stay above at 1000.
 */
(function () {
  // Microsoft Clarity (global). Loaded async, safe to run on every page.
  (function (c, l, a, r, i, t, y) {
    if (c[a]) return;
    c[a] = function () {
      (c[a].q = c[a].q || []).push(arguments);
    };
    t = l.createElement(r);
    t.async = 1;
    t.src = 'https://www.clarity.ms/tag/' + i;
    y = l.getElementsByTagName(r)[0];
    if (y && y.parentNode) y.parentNode.insertBefore(t, y);
  })(window, document, 'clarity', 'script', 'wifrjpxrbv');

  function navLinksEl() {
    return document.getElementById('navLinks');
  }

  function normalizeHomepageLinks() {
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href');
      if (!href) continue;

      // Keep hash-only and special schemes intact.
      if (href[0] === '#') continue;
      if (/^(mailto:|tel:|sms:|javascript:)/i.test(href)) continue;

      // Normalize absolute homepage variants.
      if (/^https?:\/\/screenarmors\.com\/?$/i.test(href)) {
        a.setAttribute('href', 'https://www.screenarmors.com/');
        continue;
      }
      if (/^https?:\/\/www\.screenarmors\.com\/?$/i.test(href)) {
        a.setAttribute('href', '/');
        continue;
      }
      if (/^https?:\/\/www\.screenarmors\.com\/index(\.html)?\/?$/i.test(href)) {
        a.setAttribute('href', '/');
        continue;
      }

      // Normalize common relative homepage variants.
      if (href === 'index.html' || href === './index.html' || href === '/index' || href === '/index.html') {
        a.setAttribute('href', '/');
        continue;
      }
    }

    // Ensure brand/logo always points to root.
    var logos = document.querySelectorAll('a.logo');
    for (var j = 0; j < logos.length; j++) {
      logos[j].setAttribute('href', '/');
    }
  }

  function normalizePhoneLinks() {
    var desiredE164 = '+19414049699';
    var desiredDigits = '19414049699';
    var localDigits = '9414049699';

    var links = document.querySelectorAll('a[href^="tel:"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href') || '';
      // Strip scheme + punctuation to compare digits only.
      var digits = href.replace(/^tel:/i, '').replace(/[^\d]/g, '');
      if (!digits) continue;

      // If it matches our known number in any common format, normalize to E.164.
      if (digits === localDigits || digits === desiredDigits || digits.slice(-10) === localDigits) {
        a.setAttribute('href', 'tel:' + desiredE164);
      }
    }
  }

  function ensureBackToTopButton() {
    if (!document.body) return;
    if (document.getElementById('backToTopBtn')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'backToTopBtn';
    btn.className = 'back-to-top-btn';
    btn.setAttribute('aria-label', 'Back to top');
    btn.setAttribute('title', 'Back to top');
    btn.innerHTML = '<span aria-hidden="true">↑</span><span class="back-to-top-btn__text">Top</span>';
    btn.hidden = true;

    btn.addEventListener('click', function () {
      var prefersReduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
    });

    function syncVisibility() {
      var doc = document.documentElement;
      var scrollTop = window.scrollY || doc.scrollTop || 0;
      var viewportH = window.innerHeight || doc.clientHeight || 0;
      var docH = Math.max(doc.scrollHeight || 0, doc.offsetHeight || 0, doc.clientHeight || 0);
      var maxScroll = Math.max(0, docH - viewportH);
      if (maxScroll <= 0) {
        btn.hidden = true;
        return;
      }

      // Only show when user is near the bottom (last ~15% of the page).
      var progress = scrollTop / maxScroll; // 0..1
      btn.hidden = progress < 0.85;
    }

    window.addEventListener('scroll', syncVisibility, { passive: true });
    window.addEventListener('resize', syncVisibility, { passive: true });
    syncVisibility();

    document.body.appendChild(btn);
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
      normalizeHomepageLinks();
      normalizePhoneLinks();
      ensureBlogNavItem();
      ensureFooterSocialLinks();
      ensureBackToTopButton();
      syncBodyOpenClass();
    });
  } else {
    normalizeHomepageLinks();
    normalizePhoneLinks();
    ensureBlogNavItem();
    ensureFooterSocialLinks();
    ensureBackToTopButton();
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
