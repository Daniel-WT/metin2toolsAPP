// ── Expiry Calendar ───────────────────────────────────────────────────────
var _ecYear   = null;
var _ecMonth  = null;
var _ecSelDay = null;

var _EC_MONTHS = [
  'Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie',
  'Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'
];
var _EC_MONTHS_SHORT = [
  'Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'
];
var _EC_WEEKDAYS = ['Lu','Ma','Mi','Jo','Vi','Sa','Du'];

var _EC_CAT_COLOR = {
  'skin-arma':  'var(--blue)',
  'costum':     'var(--purple)',
  'frizura':    'var(--teal)',
  'atac-auto':  'var(--gold-light)',
  'manusa':     'var(--orange)',
  'insotitor':  '#6bbf8a',
  'sase-sapte': '#e07b5a'
};

var _EC_CAT_LABELS = {
  'skin-arma':  'Skin Arma',
  'costum':     'Costum',
  'frizura':    'Frizura',
  'atac-auto':  'Atac Auto',
  'manusa':     'Manusa',
  'insotitor':  'Insotitor',
  'sase-sapte': '6/7'
};

function openExpiryCalendar() {
  var now   = new Date();
  _ecYear   = now.getFullYear();
  _ecMonth  = now.getMonth();
  _ecSelDay = null;
  _ecRenderCalendar();
  openModal('expiryCalModal');
}

function _ecRenderCalendar() {
  var modal = document.getElementById('expiryCalModal');
  if (!modal) return;

  // Month label
  var lbl = modal.querySelector('.ec-month-label');
  if (lbl) lbl.textContent = _EC_MONTHS[_ecMonth] + ' ' + _ecYear;

  // Build day → items map for the viewed month
  var monthStart = new Date(_ecYear, _ecMonth, 1).getTime();
  var monthEnd   = new Date(_ecYear, _ecMonth + 1, 0, 23, 59, 59, 999).getTime();

  var _EC_SHOW_CATS = ['skin-arma', 'costum', 'frizura', 'insotitor'];
  var monthItems = (typeof items !== 'undefined' ? items : []).filter(function(it) {
    if (!it.expiresAt) return false;
    if (_EC_SHOW_CATS.indexOf(it.category) < 0) return false;
    return it.expiresAt >= monthStart && it.expiresAt <= monthEnd;
  });

  var dayMap = {};
  monthItems.forEach(function(it) {
    var d = new Date(it.expiresAt).getDate();
    if (!dayMap[d]) dayMap[d] = [];
    dayMap[d].push(it);
  });

  // Calendar grid — week starts Monday
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var firstDay     = new Date(_ecYear, _ecMonth, 1).getDay(); // 0=Sun
  var startOffset  = (firstDay === 0 ? 6 : firstDay - 1);    // Mon=0 offset
  var daysInMonth  = new Date(_ecYear, _ecMonth + 1, 0).getDate();
  var totalCells   = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  var cells = '';
  for (var i = 0; i < totalCells; i++) {
    var dayNum = i - startOffset + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells += '<div class="ec-cell ec-cell--empty"></div>';
      continue;
    }

    var cellDate = new Date(_ecYear, _ecMonth, dayNum);
    cellDate.setHours(0, 0, 0, 0);
    var isToday  = cellDate.getTime() === today.getTime();
    var isSel    = _ecSelDay === dayNum;
    var dayItems = dayMap[dayNum] || [];
    var hasItems = dayItems.length > 0;

    // Collect unique categories for dots (max 4)
    var seen = [];
    dayItems.forEach(function(it) {
      if (seen.indexOf(it.category) < 0) seen.push(it.category);
    });
    var dotHtml = seen.slice(0, 4).map(function(cat) {
      return '<span class="ec-dot" style="background:' + (_EC_CAT_COLOR[cat] || 'var(--text-dim)') + '"></span>';
    }).join('') + (seen.length > 4 ? '<span class="ec-dot-more">+' + (seen.length - 4) + '</span>' : '');

    var cls = 'ec-cell';
    if (isToday)  cls += ' ec-cell--today';
    if (isSel)    cls += ' ec-cell--selected';
    if (hasItems) cls += ' ec-cell--has-items';

    cells += '<div class="' + cls + '" data-ec-day="' + dayNum + '">' +
      '<span class="ec-day-num">' + dayNum + '</span>' +
      (hasItems
        ? '<div class="ec-dots">' + dotHtml + '</div>' +
          '<span class="ec-count">' + dayItems.length + '</span>'
        : '') +
    '</div>';
  }

  var gridEl = modal.querySelector('.ec-grid');
  if (gridEl) gridEl.innerHTML = cells;

  // Reattach day click handlers
  modal.querySelectorAll('.ec-cell[data-ec-day]').forEach(function(cell) {
    cell.addEventListener('click', function() {
      var day = Number(this.dataset.ecDay);
      _ecSelDay = (_ecSelDay === day) ? null : day;
      _ecRenderCalendar();
    });
  });

  // Day detail panel
  _ecRenderDayPanel(dayMap);
}

function _ecRenderDayPanel(dayMap) {
  var panel = document.getElementById('ecDayPanel');
  if (!panel) return;

  function _buildContent() {
    if (!_ecSelDay) {
      return '<div class="ec-day-empty">Selecteaza o zi pentru a vedea detaliile</div>';
    }

    var dayItems = (dayMap && dayMap[_ecSelDay]) ? dayMap[_ecSelDay] : [];
    var dateLabel = _ecSelDay + ' ' + _EC_MONTHS[_ecMonth] + ' ' + _ecYear;
    var offset    = typeof _clockOffsetMs !== 'undefined' ? _clockOffsetMs : 0;

    var titleHtml = '<div class="ec-day-panel-title">' + dateLabel +
      (dayItems.length ? ' &mdash; <strong>' + dayItems.length + ' item' + (dayItems.length !== 1 ? 'e' : '') + '</strong>' : '') +
      '</div>';

    if (!dayItems.length) {
      return titleHtml + '<div class="ec-day-empty">Niciun item nu expira in aceasta zi</div>';
    }

    dayItems.sort(function(a, b) { return a.expiresAt - b.expiresAt; });

    var rows = dayItems.map(function(it) {
      var color    = _EC_CAT_COLOR[it.category] || 'var(--text-muted)';
      var catLabel = _EC_CAT_LABELS[it.category] || it.category;
      var ms       = it.expiresAt - (Date.now() + offset);
      var timeStr  = ms <= 0 ? 'Expirat' : formatTimer(ms);
      var timeColor = ms <= 0 ? 'var(--red)' : ms < 86400000 ? 'var(--orange)' : 'var(--text-dim)';
      return '<div class="ec-day-item">' +
        '<span class="ec-day-item-dot" style="background:' + color + '"></span>' +
        '<div class="ec-day-item-info">' +
          '<div class="ec-day-item-name">' + escHtml(it.name) + '</div>' +
          '<div class="ec-day-item-sub">' + escHtml(it.account) + ' &middot; ' + catLabel + '</div>' +
        '</div>' +
        '<div class="ec-day-item-time" style="color:' + timeColor + '">' + timeStr + '</div>' +
      '</div>';
    }).join('');

    return titleHtml + '<div class="ec-day-items">' + rows + '</div>';
  }

  var isEmpty = panel.innerHTML.trim() === '';
  if (isEmpty) {
    panel.innerHTML = _buildContent();
    return;
  }

  // Fade out → swap content → fade in
  panel.style.opacity = '0';
  panel.style.transform = 'translateY(6px)';
  setTimeout(function() {
    panel.innerHTML = _buildContent();
    panel.offsetHeight; // force reflow
    panel.style.opacity = '';
    panel.style.transform = '';
  }, 220);
}

// Wire up once DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Open calendar button(s)
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="open-expiry-cal"]');
    if (!btn) return;
    openExpiryCalendar();
  });

  // Month navigation
  var prevBtn = document.getElementById('ecPrevMonth');
  var nextBtn = document.getElementById('ecNextMonth');
  if (prevBtn) {
    prevBtn.addEventListener('click', function() {
      _ecMonth--;
      if (_ecMonth < 0) { _ecMonth = 11; _ecYear--; }
      _ecSelDay = null;
      _ecRenderCalendar();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function() {
      _ecMonth++;
      if (_ecMonth > 11) { _ecMonth = 0; _ecYear++; }
      _ecSelDay = null;
      _ecRenderCalendar();
    });
  }

  // Close button
  var closeBtn = document.getElementById('ecClose');
  if (closeBtn) closeBtn.addEventListener('click', function() { closeModal('expiryCalModal'); });

  // Click outside to close
  var overlay = document.getElementById('expiryCalModal');
  if (overlay) overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeModal('expiryCalModal');
  });
});
