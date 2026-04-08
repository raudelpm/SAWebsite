/**
 * Track clicks on phone (tel:) links using Google Ads Click to call conversion.
 * Calls gtag_report_conversion() so the conversion is recorded in Google Ads.
 */
(function() {
  function trackCallClick() {
    if (typeof gtag_report_conversion === 'function') {
      gtag_report_conversion();
    }
  }
  function init() {
    var links = document.querySelectorAll('a[href^="tel:"]');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', trackCallClick);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
