/**
 * Quick Screen Quote — panel pricing, responsive hit-testing (natural 1008×1024 coords),
 * total + 10% discount when panel count is 5 or more.
 * Native <map> is avoided: iOS does not scale image-map areas reliably when the image is CSS-scaled.
 */
(function () {
  var NATURAL_W = 1008;
  var NATURAL_H = 1024;
  /** Last-listed regions win if overlaps (same idea as drawing order on top). */
  var HIT_REGIONS = [
    { key: 'corner-angle', type: 'poly', coords: [158, 563, 201, 482, 313, 556, 276, 570] },
    { key: 'flat-top', type: 'poly', coords: [196, 287, 275, 242, 483, 293, 395, 327] },
    { key: 'top', type: 'poly', coords: [580, 366, 699, 330, 752, 370, 855, 479, 726, 496, 732, 504] },
    { key: 'lower', type: 'rect', coords: [339, 728, 402, 788] },
    { key: 'mid', type: 'rect', coords: [491, 532, 589, 735] }
  ];

  var PANEL_ORDER = ['lower', 'mid', 'top', 'flat-top', 'corner-angle'];
  var PANELS = {
    lower: { label: 'Lower / kick plate panel', price: 50 },
    mid: { label: 'Mid wall panel', price: 80 },
    top: { label: 'Sloped roof panel', price: 100 },
    'flat-top': { label: 'Flat roof panel', price: 100 },
    'corner-angle': { label: 'Gable / corner angle panel', price: 120 }
  };
  var DISCOUNT_THRESHOLD = 5;
  var DISCOUNT_RATE = 0.1;

  var tool = document.getElementById('screenQuoteTool');
  var diagram = document.getElementById('screenQuoteDiagram');
  var out = document.getElementById('screenQuoteSelection');
  var modal = document.getElementById('screenQuoteModal');
  var modalTitle = document.getElementById('screenQuoteModalTitle');
  var modalPriceLine = document.getElementById('screenQuoteModalPriceLine');
  var qtyInput = document.getElementById('screenQuoteQtyInput');
  var btnConfirm = document.getElementById('screenQuoteModalConfirm');
  var linesEl = document.getElementById('screenQuoteLines');
  var emptyEl = document.getElementById('screenQuoteEmpty');
  var btnTotal = document.getElementById('screenQuoteShowTotal');
  var summary = document.getElementById('screenQuoteSummary');
  var summaryBody = document.getElementById('screenQuoteSummaryBody');
  var sqTotalPanels = document.getElementById('sqTotalPanels');
  var sqSubtotal = document.getElementById('sqSubtotal');
  var sqDiscountRow = document.getElementById('sqDiscountRow');
  var sqDiscount = document.getElementById('sqDiscount');
  var sqGrand = document.getElementById('sqGrand');
  var btnEditMore = document.getElementById('screenQuoteEditMore');
  var stage = document.querySelector('.screen-quote-stage');

  if (!tool || !diagram || !modal) return;

  var quantities = { lower: 0, mid: 0, top: 0, 'flat-top': 0, 'corner-angle': 0 };
  var pendingKey = null;
  var lastFocused = null;
  var ptrDownX = 0;
  var ptrDownY = 0;
  var ptrDownId = null;

  function pointInRect(nx, ny, c) {
    var x1 = c[0];
    var y1 = c[1];
    var x2 = c[2];
    var y2 = c[3];
    var minX = Math.min(x1, x2);
    var maxX = Math.max(x1, x2);
    var minY = Math.min(y1, y2);
    var maxY = Math.max(y1, y2);
    return nx >= minX && nx <= maxX && ny >= minY && ny <= maxY;
  }

  function pointInPoly(nx, ny, flat) {
    var inside = false;
    var n = flat.length / 2;
    var i;
    var j = n - 1;
    for (i = 0; i < n; j = i++) {
      var xi = flat[i * 2];
      var yi = flat[i * 2 + 1];
      var xj = flat[j * 2];
      var yj = flat[j * 2 + 1];
      var denom = yj - yi;
      if (Math.abs(denom) < 1e-9) denom = denom >= 0 ? 1e-9 : -1e-9;
      var intersect =
        yi > ny !== yj > ny && nx < ((xj - xi) * (ny - yi)) / denom + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function hitTestNatural(nx, ny) {
    var i;
    for (i = 0; i < HIT_REGIONS.length; i++) {
      var r = HIT_REGIONS[i];
      if (r.type === 'rect' && pointInRect(nx, ny, r.coords)) return r.key;
      if (r.type === 'poly' && pointInPoly(nx, ny, r.coords)) return r.key;
    }
    return null;
  }

  function clientToNatural(clientX, clientY) {
    var rect = diagram.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    var nw = diagram.naturalWidth || NATURAL_W;
    var nh = diagram.naturalHeight || NATURAL_H;
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      nx: (x / rect.width) * nw,
      ny: (y / rect.height) * nh
    };
  }

  function fmtMoney(n) {
    var v = Math.round(n * 100) / 100;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function panelCount() {
    var sum = 0;
    PANEL_ORDER.forEach(function (k) {
      sum += quantities[k] || 0;
    });
    return sum;
  }

  function subtotal() {
    var s = 0;
    PANEL_ORDER.forEach(function (k) {
      var q = quantities[k] || 0;
      if (q > 0) s += q * PANELS[k].price;
    });
    return s;
  }

  function computeTotals() {
    var count = panelCount();
    var sub = subtotal();
    var discount = 0;
    if (count >= DISCOUNT_THRESHOLD) discount = Math.round(sub * DISCOUNT_RATE * 100) / 100;
    var grand = Math.round((sub - discount) * 100) / 100;
    return { count: count, sub: sub, discount: discount, grand: grand };
  }

  function renderCart() {
    var count = panelCount();
    linesEl.innerHTML = '';
    if (count === 0) {
      emptyEl.hidden = false;
      linesEl.hidden = true;
      btnTotal.disabled = true;
      return;
    }
    emptyEl.hidden = true;
    linesEl.hidden = false;
    btnTotal.disabled = false;
    PANEL_ORDER.forEach(function (k) {
      var q = quantities[k];
      if (!q) return;
      var p = PANELS[k];
      var line = q * p.price;
      var li = document.createElement('li');
      var left = document.createElement('span');
      left.textContent = p.label + ' × ' + q;
      var right = document.createElement('span');
      right.textContent = fmtMoney(p.price) + ' ea · ' + fmtMoney(line);
      li.appendChild(left);
      li.appendChild(right);
      linesEl.appendChild(li);
    });
  }

  function openModal(key) {
    if (!PANELS[key]) return;
    pendingKey = key;
    var p = PANELS[key];
    modalTitle.textContent = p.label;
    modalPriceLine.textContent = 'Price per panel: ' + fmtMoney(p.price);
    var current = quantities[key] || 0;
    qtyInput.value = current > 0 ? String(current) : '1';
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(function () {
      qtyInput.focus();
      qtyInput.select();
    }, 10);
  }

  function closeModal() {
    pendingKey = null;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try {
        lastFocused.focus();
      } catch (e) {}
    }
  }

  function saveModal() {
    if (!pendingKey) return;
    var raw = parseInt(qtyInput.value, 10);
    if (isNaN(raw) || raw < 0) raw = 0;
    if (raw > 500) raw = 500;
    quantities[pendingKey] = raw;
    renderCart();
    if (panelCount() === 0 && summary && !summary.hidden) summary.hidden = true;
    if (out) {
      var p = PANELS[pendingKey];
      out.textContent =
        raw === 0
          ? p.label + ' removed from estimate.'
          : 'Saved: ' + raw + ' × ' + p.label + '.';
    }
    closeModal();
    if (summary && !summary.hidden) fillSummary();
  }

  function fillSummary() {
    var t = computeTotals();
    summaryBody.innerHTML = '';
    PANEL_ORDER.forEach(function (k) {
      var q = quantities[k];
      if (!q) return;
      var p = PANELS[k];
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        escapeHtml(p.label) +
        '</td><td>' +
        q +
        '</td><td>' +
        fmtMoney(p.price) +
        '</td><td>' +
        fmtMoney(q * p.price) +
        '</td>';
      summaryBody.appendChild(tr);
    });
    sqTotalPanels.textContent = String(t.count);
    sqSubtotal.textContent = fmtMoney(t.sub);
    if (t.discount > 0) {
      sqDiscountRow.hidden = false;
      sqDiscount.textContent = '−' + fmtMoney(t.discount);
    } else {
      sqDiscountRow.hidden = true;
      sqDiscount.textContent = '−$0';
    }
    sqGrand.textContent = fmtMoney(t.grand);
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  diagram.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ptrDownX = e.clientX;
    ptrDownY = e.clientY;
    ptrDownId = e.pointerId;
  });

  diagram.addEventListener('pointerup', function (e) {
    if (!modal.hidden) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (ptrDownId !== null && e.pointerId !== ptrDownId) return;
    var move = Math.abs(e.clientX - ptrDownX) + Math.abs(e.clientY - ptrDownY);
    if (move > 18) return;

    var nw = diagram.naturalWidth;
    var nh = diagram.naturalHeight;
    if (!nw || !nh) return;

    var pt = clientToNatural(e.clientX, e.clientY);
    if (!pt) return;
    if (pt.nx < 0 || pt.ny < 0 || pt.nx > nw || pt.ny > nh) return;

    var key = hitTestNatural(pt.nx, pt.ny);
    if (!key) return;
    e.preventDefault();
    openModal(key);
    ptrDownId = null;
  });

  diagram.addEventListener('pointercancel', function () {
    ptrDownId = null;
  });

  modal.addEventListener('click', function (e) {
    if (e.target && e.target.getAttribute('data-close-modal') != null) closeModal();
  });

  btnConfirm.addEventListener('click', saveModal);

  qtyInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveModal();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });

  btnTotal.addEventListener('click', function () {
    if (panelCount() === 0) return;
    fillSummary();
    summary.hidden = false;
    summary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  btnEditMore.addEventListener('click', function () {
    summary.hidden = true;
    if (stage) stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  renderCart();
})();
