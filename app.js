// ===== トークン管理 =====
// GAS側の共有トークン（合言葉）。このファイルには値を直接書かず、
// 初回訪問時にユーザーが入力してブラウザのlocalStorageにのみ保存する。
const TOKEN_STORAGE_KEY = 'attendance_app_token';

function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

function ensureToken() {
  let token = getStoredToken();
  while (!token) {
    token = window.prompt('アクセスコードを入力してください（初回のみ）');
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
      token = token.trim();
    }
  }
  return token;
}

function resetToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  location.reload();
}

// ===== API呼び出し =====
// Content-Typeをtext/plainにすることで、CORSプリフライト(OPTIONS)を回避する
// （application/jsonにするとGASのWebアプリでは正しく処理できない）。
async function callApi(action, payload) {
  const token = ensureToken();
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ token: token, action: action }, payload)),
  });
  const json = await response.json();
  if (json.error) {
    if (json._httpStatus === 401) {
      // トークンが間違っている場合は再入力させる
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    throw new Error(json.error);
  }
  return json.result;
}

// ===== UI ロジック =====
var extractedRows = [];
var currentTargetMonth = '';

var fileInput, dropzone, dropzoneLabel, filenameDisplay;

function setStatus(message, kind) {
  var el = document.getElementById('status');
  el.className = kind || '';
  el.innerHTML = '';
  if (kind === 'loading') {
    var spinner = document.createElement('span');
    spinner.className = 'spinner';
    el.appendChild(spinner);
  }
  el.appendChild(document.createTextNode(message));
}

function updateFilenameDisplay() {
  if (fileInput.files.length) {
    filenameDisplay.textContent = '選択中: ' + fileInput.files[0].name;
    dropzoneLabel.style.display = 'none';
  }
}

function handleUpload() {
  var monthInput = document.getElementById('target-month');

  if (!fileInput.files.length) {
    alert('LINEエクスポートテキストファイルを選択してください。');
    return;
  }
  if (!monthInput.value) {
    alert('対象月を選択してください。');
    return;
  }
  currentTargetMonth = monthInput.value; // "YYYY-MM"

  var reader = new FileReader();
  reader.onload = function (e) {
    var text = e.target.result;
    setStatus('抽出中です（Claude APIを呼び出しています。数十秒かかることがあります）...', 'loading');
    document.getElementById('extract-button').disabled = true;

    callApi('extractForPreview', { lineExportText: text, targetMonth: currentTargetMonth })
      .then(function (rows) {
        document.getElementById('extract-button').disabled = false;
        extractedRows = rows;
        renderPreview(rows);
        setStatus('抽出が完了しました（' + rows.length + '件）。内容を確認してください。', 'success');
      })
      .catch(function (error) {
        document.getElementById('extract-button').disabled = false;
        setStatus('エラー: ' + error.message, 'error');
      });
  };
  reader.readAsText(fileInput.files[0], 'utf-8');
}

var FIELD_LABELS = { date: '日付', site: '現場', start: '始業', end: '終業' };

function makeCell(value, editable, rowIndex, field) {
  var td = document.createElement('td');
  td.setAttribute('data-label', FIELD_LABELS[field] || field);
  td.textContent = value || '';
  if (editable) {
    td.contentEditable = 'true';
    td.addEventListener('blur', function () {
      extractedRows[rowIndex][field] = td.textContent.trim();
    });
  }
  return td;
}

function renderPreview(rows) {
  var tbody = document.querySelector('#preview-table tbody');
  tbody.innerHTML = '';

  rows.forEach(function (row, index) {
    var tr = document.createElement('tr');

    tr.appendChild(makeCell(row.date, false, index, 'date'));
    tr.appendChild(makeCell(row.site, true, index, 'site'));
    tr.appendChild(makeCell(row.start, true, index, 'start'));
    tr.appendChild(makeCell(row.end, true, index, 'end'));

    var confTd = document.createElement('td');
    confTd.setAttribute('data-label', 'confidence');
    var badge = document.createElement('span');
    badge.className = 'badge ' + (row.confidence || 'high');
    badge.textContent = row.confidence || '';
    confTd.appendChild(badge);
    tr.appendChild(confTd);

    var notesTd = document.createElement('td');
    notesTd.className = 'notes-cell';
    notesTd.setAttribute('data-label', 'notes');
    notesTd.textContent = row.notes || '';
    tr.appendChild(notesTd);

    var sourceTd = document.createElement('td');
    var sourceRowId = 'source-row-' + index;
    if (row.source) {
      var toggleBtn = document.createElement('button');
      toggleBtn.className = 'source-toggle';
      toggleBtn.textContent = '元を見る';
      toggleBtn.addEventListener('click', function () {
        var el = document.getElementById(sourceRowId);
        var isHidden = el.style.display === 'none' || !el.style.display;
        el.style.display = isHidden ? 'table-row' : 'none';
        toggleBtn.textContent = isHidden ? '閉じる' : '元を見る';
      });
      sourceTd.appendChild(toggleBtn);
    }
    tr.appendChild(sourceTd);

    tbody.appendChild(tr);

    if (row.source) {
      var sourceRow = document.createElement('tr');
      sourceRow.className = 'source-row';
      sourceRow.id = sourceRowId;
      sourceRow.style.display = 'none';
      var sourceCell = document.createElement('td');
      sourceCell.colSpan = 7;
      var label = document.createElement('span');
      label.className = 'source-label';
      label.textContent = '判断根拠となった元のLINE本文';
      var pre = document.createElement('pre');
      pre.textContent = row.source;
      sourceCell.appendChild(label);
      sourceCell.appendChild(pre);
      sourceRow.appendChild(sourceCell);
      tbody.appendChild(sourceRow);
    }
  });

  document.getElementById('preview-section').style.display = 'block';
  document.getElementById('preview-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function handleCommit() {
  if (!extractedRows.length) {
    alert('抽出結果がありません。');
    return;
  }
  if (!confirm('出勤簿シートに書き込みます。よろしいですか？')) {
    return;
  }

  document.getElementById('commit-button').disabled = true;
  showLoadingOverlay('出勤簿に書き込んでいます...');

  callApi('commitToSheet', { confirmedRows: extractedRows, targetMonth: currentTargetMonth })
    .then(function (result) {
      document.getElementById('commit-button').disabled = false;
      hideLoadingOverlay();
      setStatus(result.message, 'success');
    })
    .catch(function (error) {
      document.getElementById('commit-button').disabled = false;
      hideLoadingOverlay();
      setStatus('エラー: ' + error.message, 'error');
    });
}

function showLoadingOverlay(message) {
  document.getElementById('loading-overlay-text').textContent = message;
  document.getElementById('loading-overlay').classList.add('visible');
}

function hideLoadingOverlay() {
  document.getElementById('loading-overlay').classList.remove('visible');
}

// ===== PWAインストール =====
function setupPwaInstall() {
  var installBanner = document.getElementById('install-banner');
  var installBannerText = document.getElementById('install-banner-text');
  var installButton = document.getElementById('install-button');
  var deferredInstallPrompt = null;

  var isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  if (isStandalone) return;

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isIOS) {
    installBannerText.textContent = 'アプリとして使うには: 共有ボタン（□に↑）→「ホーム画面に追加」';
    installButton.style.display = 'none';
    installBanner.classList.add('visible');
  } else {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredInstallPrompt = e;
      installBanner.classList.add('visible');
    });

    installButton.addEventListener('click', function () {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.finally(function () {
        deferredInstallPrompt = null;
        installBanner.classList.remove('visible');
      });
    });

    window.addEventListener('appinstalled', function () {
      installBanner.classList.remove('visible');
    });
  }
}

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', function () {
  fileInput = document.getElementById('file-input');
  dropzone = document.getElementById('dropzone');
  dropzoneLabel = document.getElementById('dropzone-label');
  filenameDisplay = document.getElementById('filename-display');

  fileInput.addEventListener('change', updateFilenameDisplay);
  dropzone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', function () {
    dropzone.classList.remove('dragover');
  });
  dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      updateFilenameDisplay();
    }
  });

  document.getElementById('extract-button').addEventListener('click', handleUpload);
  document.getElementById('commit-button').addEventListener('click', handleCommit);
  document.getElementById('restart-button').addEventListener('click', function () {
    location.reload();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('Service Worker registration failed:', err);
    });
  }

  setupPwaInstall();
});
