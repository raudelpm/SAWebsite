/**
 * Track clicks on phone (tel:) and email (mailto:) links for Google Ads.
 * Phone uses gtag_report_call_conversion / gtag_report_conversion.
 * Email uses Mail click: AW-17482456160/LJTiCOf53O0cEOC4pJBB
 */
function gtag_report_mail_conversion(url) {
  var callback = function () {
    if (typeof url != "undefined") {
      window.location = url;
    }
  };
  if (typeof gtag === "function") {
    gtag("event", "conversion", {
      send_to: "AW-17482456160/LJTiCOf53O0cEOC4pJBB",
      event_callback: callback,
    });
  }
  return false;
}

(function () {
  function trackCallClick() {
    var report =
      typeof gtag_report_call_conversion === "function"
        ? gtag_report_call_conversion
        : gtag_report_conversion;
    if (typeof report === "function") {
      report();
    }
  }
  function trackMailClick() {
    gtag_report_mail_conversion();
  }
  function init() {
    var callLinks = document.querySelectorAll('a[href^="tel:"]');
    for (var i = 0; i < callLinks.length; i++) {
      callLinks[i].addEventListener("click", trackCallClick);
    }
    var mailLinks = document.querySelectorAll('a[href^="mailto:"]');
    for (var j = 0; j < mailLinks.length; j++) {
      mailLinks[j].addEventListener("click", trackMailClick);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
