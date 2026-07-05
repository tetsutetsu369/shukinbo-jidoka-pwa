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

function makeEditableSpan(value, rowIndex, field, className) {
  var span = document.createElement('span');
  span.className = className;
  span.contentEditable = 'true';
  span.textContent = value || '';
  span.addEventListener('blur', function () {
    extractedRows[rowIndex][field] = span.textContent.trim();
  });
  return span;
}

function renderPreview(rows) {
  var list = document.getElementById('preview-list');
  list.innerHTML = '';

  rows.forEach(function (row, index) {
    var card = document.createElement('div');
    card.className = 'entry-card';

    // 1行目: 日付 + 現場（編集可） + confidenceバッジ
    var row1 = document.createElement('div');
    row1.className = 'entry-row1';

    var dateSpan = document.createElement('span');
    dateSpan.className = 'entry-date';
    dateSpan.textContent = row.date || '';
    row1.appendChild(dateSpan);

    row1.appendChild(makeEditableSpan(row.site, index, 'site', 'entry-site'));

    var badge = document.createElement('span');
    badge.className = 'badge ' + (row.confidence || 'high');
    badge.textContent = row.confidence || '';
    row1.appendChild(badge);

    card.appendChild(row1);

    // 2行目: 始業〜終業（編集可） + notes/元のアイコンボタン
    var row2 = document.createElement('div');
    row2.className = 'entry-row2';

    var timeSpan = document.createElement('span');
    timeSpan.className = 'entry-time';
    timeSpan.appendChild(makeEditableSpan(row.start, index, 'start', 'entry-start'));
    timeSpan.appendChild(document.createTextNode(' 〜 '));
    timeSpan.appendChild(makeEditableSpan(row.end, index, 'end', 'entry-end'));
    row2.appendChild(timeSpan);

    var iconGroup = document.createElement('span');
    iconGroup.className = 'entry-icons';

    var detailBox = null;
    if (row.source) {
      var sourceBtn = document.createElement('button');
      sourceBtn.className = 'icon-btn';
      sourceBtn.title = '判断根拠の元メッセージを見る';
      sourceBtn.textContent = '🔍';
      sourceBtn.addEventListener('click', function () {
        detailBox.classList.toggle('visible');
      });
      iconGroup.appendChild(sourceBtn);
    }
    row2.appendChild(iconGroup);
    card.appendChild(row2);

    // notesは短い文言なので常時表示（あれば）
    if (row.notes) {
      var notesEl = document.createElement('div');
      notesEl.className = 'entry-notes';
      notesEl.textContent = row.notes;
      card.appendChild(notesEl);
    }

    // 元メッセージは長くなりうるので折りたたみ表示
    if (row.source) {
      detailBox = document.createElement('div');
      detailBox.className = 'entry-source';
      var label = document.createElement('span');
      label.className = 'source-label';
      label.textContent = '判断根拠となった元のLINE本文';
      var pre = document.createElement('pre');
      pre.textContent = row.source;
      detailBox.appendChild(label);
      detailBox.appendChild(pre);
      card.appendChild(detailBox);
    }

    list.appendChild(card);
  });

  document.getElementById('preview-section').style.display = 'block';
  document.getElementById('preview-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function handleCommit() {
  if (!extractedRows.length) {
    alert('抽出結果がありません。');
    return;
  }

  callApi('checkSheetExists', { targetMonth: currentTargetMonth })
    .then(function (result) {
      var message = result.exists
        ? currentTargetMonth + ' のシートは既に存在します。上書きされます。よろしいですか？'
        : '出勤簿シートに書き込みます。よろしいですか？';
      return showConfirmModal(message, result.exists);
    })
    .then(function (confirmed) {
      if (!confirmed) return;
      doCommit();
    })
    .catch(function (error) {
      setStatus('エラー: ' + error.message, 'error');
    });
}

function doCommit() {
  document.getElementById('commit-button').disabled = true;
  showLoadingOverlay('出勤簿に書き込んでいます...');

  callApi('commitToSheet', { confirmedRows: extractedRows, targetMonth: currentTargetMonth })
    .then(function (result) {
      document.getElementById('commit-button').disabled = false;
      showOverlaySuccess(result.message);
      setStatus(result.message, 'success');
    })
    .catch(function (error) {
      document.getElementById('commit-button').disabled = false;
      hideLoadingOverlay();
      setStatus('エラー: ' + error.message, 'error');
    });
}

// ===== 確認モーダル（confirm()の代わり） =====
function showConfirmModal(message, isWarning) {
  return new Promise(function (resolve) {
    var modal = document.getElementById('confirm-modal');
    var box = modal.querySelector('.modal-box');
    box.classList.toggle('warning', !!isWarning);
    document.getElementById('confirm-modal-message').textContent = message;
    modal.classList.add('visible');

    var okBtn = document.getElementById('confirm-modal-ok');
    var cancelBtn = document.getElementById('confirm-modal-cancel');

    function cleanup(value) {
      modal.classList.remove('visible');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(value);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

function showLoadingOverlay(message) {
  var overlay = document.getElementById('loading-overlay');
  overlay.classList.remove('success');
  document.getElementById('loading-overlay-icon').innerHTML = '<div class="spinner-large"></div>';
  document.getElementById('loading-overlay-text').textContent = message;
  overlay.classList.add('visible');
}

function showOverlaySuccess(message) {
  var overlay = document.getElementById('loading-overlay');
  overlay.classList.add('success');
  document.getElementById('loading-overlay-icon').innerHTML = '<div class="overlay-checkmark">✓</div>';
  document.getElementById('loading-overlay-text').textContent = message;
  setTimeout(hideLoadingOverlay, 1600);
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
