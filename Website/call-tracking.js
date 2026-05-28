/**
 * Track clicks on phone (tel:) links using Google Ads Click to call conversion.
 * Calls gtag_report_conversion() so the conversion is recorded in Google Ads.
 */
(function() {
  function trackCallClick() {
    var report =
      typeof gtag_report_call_conversion === "function"
        ? gtag_report_call_conversion
        : gtag_report_conversion;
    if (typeof report === "function") {
      report();
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
