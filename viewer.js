// Shared report viewer. window.VIEW_MODE = 'admin' (review allowed) or 'yesac' (read-only + revise).
(function () {
  const MODE = window.VIEW_MODE === 'yesac' ? 'yesac' : 'admin';
  const STORE = MODE === 'admin' ? 'yesac_admin_key' : 'yesac_submit_key';
  let KEY = yesacKey(STORE);
  const $ = id => document.getElementById(id);
  let ROWS = [], CUR = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const msg = (h, c) => { $('topMsg').innerHTML = h ? `<div class="msg ${c}">${h}</div>` : ''; };

  function statusBadge(s) {
    const cls = s === 'Reviewed' ? 'ok' : s === 'Returned' ? 'warn' : 'amber';
    return `<span class="badge ${cls}">${esc(s || 'Submitted')}</span>`;
  }
  function askKey() {
    try { localStorage.removeItem(STORE); } catch (x) {}
    KEY = ''; $('keyBox').classList.remove('hidden');
  }

  /* ---------- list ---------- */
  async function loadList() {
    if (!KEY) { askKey(); return; }
    msg('Loading…', 'ok');
    try {
      const r = await yesacApi({ action: 'list', key: KEY, from: $('fFrom').value, to: $('fTo').value });
      ROWS = r.rows; msg(''); renderList();
    } catch (e) {
      msg('Load failed: ' + esc(e.message), 'err');
      if (/invalid.*key/i.test(e.message)) askKey();
    }
  }
  function renderList() {
    const st = $('fStatus').value, fl = $('fFlag').value;
    const list = ROWS.filter(r => {
      if (st && r.status !== st) return false;
      const ex = r.incident !== 'None' || r.callout === 'Yes' || r.abnormal === 'Yes' || r.material === 'Yes';
      if (fl === 'ex' && !ex) return false;
      if (fl === 'warn' && r.hrsMismatch !== 'Yes' && r.lateCallout !== 'Yes') return false;
      return true;
    });
    const pending = ROWS.filter(r => r.status === 'Submitted').length;
    const returned = ROWS.filter(r => r.status === 'Returned').length;
    $('summary').innerHTML = `${list.length} shown · ${ROWS.length} loaded · ${pending} awaiting review` +
      (returned ? ` · <span class="badge warn">${returned} returned</span>` : '');
    $('tbl').querySelector('tbody').innerHTML = list.map(r => {
      const ex = [];
      if (r.incident && r.incident !== 'None') ex.push(`<span class="badge warn">${esc(r.incident)}</span>`);
      if (r.callout === 'Yes') ex.push(`<span class="badge ${r.lateCallout === 'Yes' ? 'warn' : 'amber'}">Callout${r.lateCallout === 'Yes' ? ' LATE' : ''}</span>`);
      if (r.abnormal === 'Yes') ex.push('<span class="badge amber">Abnormal</span>');
      if (r.material === 'Yes') ex.push('<span class="badge gray">Material</span>');
      const hrs = `${r.crewHrs} / ${r.taskHrs}` + (r.hrsMismatch === 'Yes' ? ' <span class="badge warn">≠</span>' : '');
      return `<tr class="click" data-no="${esc(r.reportNo)}"><td><b>${esc(r.reportNo)}</b>${r.rev > 0 ? ` <span class="hint">rev ${r.rev}</span>` : ''}</td>
        <td>${esc(r.preparedBy)}</td><td>${hrs}</td><td>${ex.join(' ') || '<span class="hint">—</span>'}</td>
        <td>${r.photoCount || 0}</td><td>${statusBadge(r.status)}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="hint">No reports</td></tr>';
    document.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => openReport(tr.dataset.no));
  }

  /* ---------- detail ---------- */
  function table(rows, cols) {
    if (!rows || !rows.length) return '<div class="hint">—</div>';
    return `<div class="tablewrap"><table class="list"><thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>` +
      rows.map(r => `<tr>${cols.map(c => `<td>${esc(c[2] ? c[2](r) : r[c[0]])}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
  }
  const mins = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 60000) : '';
  const dt = s => s ? s.replace('T', ' ') : '';

  async function openReport(no) {
    msg('Loading ' + esc(no) + '…', 'ok');
    try {
      const r = await yesacApi({ action: 'get', key: KEY, reportNo: no });
      CUR = { no, ...r }; msg(''); renderDetail();
      $('listView').classList.add('hidden'); $('detailView').classList.remove('hidden'); window.scrollTo(0, 0);
      loadPhotos(r.photos);
    } catch (e) { msg('Open failed: ' + esc(e.message), 'err'); }
  }
  function renderDetail() {
    const R = CUR.report, M = CUR.meta, S = R.safety || {}, I = R.incidentDetail;
    const target = R.calloutTargetMin || 30;
    if ($('folderLink')) $('folderLink').href = 'https://drive.google.com/drive/folders/' + M.folderId;
    if ($('reviseLink')) $('reviseLink').href = 'index.html?edit=' + encodeURIComponent(CUR.no);
    if ($('rvStatus')) { $('rvStatus').value = M.status === 'Submitted' ? 'Reviewed' : M.status; $('rvNote').value = M.reviewNote || ''; }
    const reviewBlock = M.reviewNote || M.status !== 'Submitted'
      ? `<section class="card" style="border-color:${M.status === 'Returned' ? 'var(--warn)' : 'var(--line)'}"><h2>Qcells Review ${statusBadge(M.status)}</h2>
          <div>${esc(M.reviewNote) || '<span class="hint">No comment</span>'}</div>
          ${MODE === 'yesac' && M.status === 'Returned' ? '<div class="hint" style="margin-top:8px">Use "Revise & resubmit" above to correct this report.</div>' : ''}</section>` : '';
    $('detail').innerHTML = `
    ${MODE === 'yesac' ? reviewBlock : ''}
    <section class="card"><h2>${esc(CUR.no)} ${statusBadge(M.status)}</h2>
      <dl class="kv">
        <dt>Date / shift</dt><dd>${esc(R.reportDate)} · ${esc(R.shift)}</dd>
        <dt>Prepared by</dt><dd>${esc(R.preparedBy)}</dd>
        <dt>Area</dt><dd>${esc(R.area) || '—'}</dd>
        <dt>Submitted</dt><dd>${new Date(M.submittedAt).toLocaleString()} (rev ${M.rev})</dd>
        <dt>Crew / task hrs</dt><dd>${M.crewHrs} / ${M.taskHrs} ${M.hrsMismatch === 'Yes' ? '<span class="badge warn">Mismatch</span>' : '<span class="badge ok">Match</span>'}</dd>
        ${MODE === 'admin' && M.reviewNote ? `<dt>Review note</dt><dd>${esc(M.reviewNote)}</dd>` : ''}
      </dl></section>
    <section class="card"><h2>Crew</h2>${table(R.crew, [['name', 'Name'], ['role', 'Role'], ['regHrs', 'Reg'], ['otHrs', 'OT']])}</section>
    <section class="card"><h2>Safety</h2><dl class="kv">
        <dt>Incident</dt><dd>${S.incident && S.incident !== 'None' ? `<span class="badge warn">${esc(S.incident)}</span>` : 'None'}</dd>
        <dt>PPE / LOTO</dt><dd>${esc(S.ppe)}</dd><dt>Permits</dt><dd>${esc(S.permits) || '—'}</dd>
        <dt>Notes</dt><dd>${esc(S.note) || '—'}</dd></dl></section>
    <section class="card"><h2>Work Performed</h2>${table(R.work, [['workId', 'Work ID'], ['type', 'Type'], ['building', 'Bldg'], ['location', 'Location'], ['action', 'Action / finding'], ['hrs', 'Hrs'], ['status', 'Status']])}</section>
    <section class="card"><h2>Open Items / Next Day</h2>${table(R.open, [['workId', 'Work ID'], ['item', 'Item'], ['plan', 'Next action'], ['need', 'Need from Qcells'], ['due', 'Target']])}</section>
    ${R.callouts && R.callouts.length ? `<section class="card"><h2>A-1 Emergency / Callout (target ${target} min)</h2>${table(R.callouts, [
        ['workId', 'Work ID'], ['callReceived', 'Call', r => dt(r.callReceived)], ['onSite', 'On site', r => dt(r.onSite)],
        ['x', 'Resp min', r => { const m = mins(r.callReceived, r.onSite); return m === '' ? '' : m + (m > target ? ' LATE' : ''); }],
        ['restored', 'Restored', r => dt(r.restored)], ['y', 'Recovery min', r => mins(r.faultStart, r.restored)], ['remarks', 'Remarks']])}</section>` : ''}
    ${I ? `<section class="card"><h2>A-2 Incident / Near Miss</h2><dl class="kv">
        <dt>Occurred</dt><dd>${esc(dt(I.at))}</dd><dt>Location</dt><dd>${esc(I.location)}</dd>
        <dt>Qcells notified</dt><dd>${esc(dt(I.notifiedAt)) || '—'}</dd>
        <dt>Report due</dt><dd>${I.at ? new Date(new Date(I.at).getTime() + 864e5).toLocaleString() : ''}</dd>
        <dt>Description</dt><dd>${esc(I.desc)}</dd></dl></section>` : ''}
    ${R.abnormal && R.abnormal.length ? `<section class="card"><h2>A-3 Abnormal Readings</h2>${table(R.abnormal, [['workId', 'Work ID'], ['asset', 'Asset'], ['param', 'Parameter'], ['value', 'Measured'], ['limit', 'Limit'], ['action', 'Action']])}</section>` : ''}
    ${R.materials && R.materials.length ? `<section class="card"><h2>A-4 Material / Spare / Rental</h2>${table(R.materials, [['workId', 'Work ID'], ['item', 'Item'], ['qty', 'Qty'], ['source', 'Source'], ['note', 'Note']])}</section>` : ''}
    ${R.remarks ? `<section class="card"><h2>Remarks</h2><div>${esc(R.remarks)}</div></section>` : ''}
    <section class="card"><h2>B. Photos (${CUR.photos.length})</h2><div class="photos" id="photoBox">${CUR.photos.length ? '' : '<div class="hint">No photos</div>'}</div></section>`;
  }
  function loadPhotos(list) {
    const box = $('photoBox');
    list.forEach(p => {
      const d = document.createElement('div'); d.className = 'photo';
      d.innerHTML = `<img alt=""><div class="meta"><div><b>${esc(p.workId) || '—'}</b> ${p.tag ? `<span class="badge gray">${esc(p.tag)}</span>` : ''}</div><div class="size">${esc(p.caption)}</div></div>`;
      box.appendChild(d);
      const no = CUR.no;
      yesacApi({ action: 'photo', key: KEY, fileId: p.fileId }).then(r => {
        if (CUR && CUR.no === no) d.querySelector('img').src = `data:${r.mime};base64,${r.data}`;
      }).catch(() => d.querySelector('.size').textContent += ' (load failed)');
    });
  }

  if ($('rvSave')) $('rvSave').onclick = async () => {
    try {
      await yesacApi({ action: 'review', key: KEY, reportNo: CUR.no, status: $('rvStatus').value, note: $('rvNote').value });
      const row = ROWS.find(r => r.reportNo === CUR.no); if (row) row.status = $('rvStatus').value;
      CUR.meta.status = $('rvStatus').value; CUR.meta.reviewNote = $('rvNote').value;
      msg('Review saved.', 'ok'); renderDetail(); loadPhotos(CUR.photos);
    } catch (e) { msg('Save failed: ' + esc(e.message), 'err'); }
  };
  $('backBtn').onclick = () => { $('detailView').classList.add('hidden'); $('listView').classList.remove('hidden'); renderList(); };
  $('printBtn').onclick = () => window.print();
  $('loadBtn').onclick = loadList;
  $('fStatus').onchange = $('fFlag').onchange = renderList;
  $('keySave').onclick = () => {
    const k = $('keyInput').value.trim(); if (!k) return;
    KEY = k; try { localStorage.setItem(STORE, k); } catch (e) {}
    $('keyBox').classList.add('hidden'); loadList();
  };
  if ($('forgetKey')) $('forgetKey').onclick = () => {
    if (!confirm('Remove the saved key from this browser?')) return;
    askKey(); ROWS = []; renderList();
  };

  const t = new Date(); $('fTo').value = t.toLocaleDateString('en-CA');
  t.setDate(t.getDate() - 30); $('fFrom').value = t.toLocaleDateString('en-CA');
  if (KEY) loadList(); else askKey();
})();
