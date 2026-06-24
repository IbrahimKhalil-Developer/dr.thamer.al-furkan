const UI = {
  esc(s){
    return String(s ?? '').replace(/[&<>"']/g, c => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
    ));
  },
  attr(s){ return String(s ?? '').replace(/['"\\]/g, '\\$&'); },

  toast(msg, type='info', ms=3200){
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = `toast ${type==='ok'?'success':type==='err'?'error':''}`;
    t.innerHTML = `${icon(type==='ok'?'check':type==='err'?'alert':'star',18)}<span>${UI.esc(msg)}</span>`;
    root.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),250); }, ms);
  },

  async copy(text){
    try{ await navigator.clipboard.writeText(text); UI.toast('تم النسخ', 'ok', 1400); }
    catch{
      const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta);
      ta.select();
      try{ document.execCommand('copy'); UI.toast('تم النسخ','ok',1400); }catch{ UI.toast('تعذّر النسخ','err'); }
      ta.remove();
    }
  },

  copyField(value){
    const v = value==null || value==='' ? '—' : String(value);
    const cp = v !== '—' ? `<button class="icon-btn" style="width:26px;height:26px" title="نسخ" onclick="UI.copy('${UI.attr(v)}')">${icon('copy',14)}</button>` : '';
    return `<span class="copy-row"><span>${UI.esc(v)}</span>${cp}</span>`;
  },

  pwField(value){
    const v = value==null || value==='' ? '' : String(value);
    if(!v) return '<span>—</span>';
    const id = 'pw'+Math.random().toString(36).slice(2,8);
    return `<span class="copy-row" data-pw="${UI.attr(v)}" data-shown="0" id="${id}">
      <span class="val">${'•'.repeat(8)}</span>
      <button class="icon-btn" style="width:26px;height:26px" title="عرض" onclick="UI.togglePw('${id}')">${icon('eye',14)}</button>
      <button class="icon-btn" style="width:26px;height:26px" title="نسخ" onclick="UI.copy('${UI.attr(v)}')">${icon('copy',14)}</button>
    </span>`;
  },
  togglePw(id){
    const el = document.getElementById(id); if(!el) return;
    const val = el.getAttribute('data-pw'); const shown = el.getAttribute('data-shown')==='1';
    const span = el.querySelector('.val'); const btn = el.querySelector('.icon-btn');
    if(shown){ span.textContent = '•'.repeat(8); btn.innerHTML = icon('eye',14); el.setAttribute('data-shown','0'); }
    else{ span.textContent = val; btn.innerHTML = icon('eyeoff',14); el.setAttribute('data-shown','1'); }
  },

  badge(kind, text, ic){
    return `<span class="badge badge-${kind}">${ic?icon(ic,13):''}${UI.esc(text)}</span>`;
  },

  gradeBadge(kind, text){
    const map = { perfect:'green', very_good:'teal', good:'gold', reject:'red', absent:'gray', holiday:'blue', waiting:'purple', neutral:'gray' };
    return UI.badge(map[kind] || 'gray', text);
  },

  initials(name){
    const parts = String(name||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return '؟';
    return (parts[0][0] + (parts[1]?parts[1][0]:'')).slice(0,2);
  },

  fmtDate(s){
    if(!s) return '—';
    const d = new Date(s); if(isNaN(d)) return String(s);
    return d.toLocaleString('ar-EG', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  },
  fmtDateShort(s){
    if(!s) return '—';
    const d = new Date(s); if(isNaN(d)) return String(s);
    return d.toLocaleDateString('ar-EG', { year:'numeric', month:'2-digit', day:'2-digit' });
  },

  modal(title, bodyHtml, footHtml){
    const root = document.getElementById('modal-root');
    const bg = document.createElement('div'); bg.className = 'modal-back';
    bg.innerHTML = `<div class="modal">
      <div class="modal-head"><h3>${UI.esc(title)}</h3><button class="icon-btn modal-x">${icon('close',16)}</button></div>
      <div class="modal-body">${bodyHtml}</div>
      ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ''}
    </div>`;
    root.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('.modal-x').onclick = close;
    bg.addEventListener('mousedown', e => { if(e.target===bg) close(); });
    return { el: bg, close };
  },

  confirm(title, msg, okLabel='تأكيد'){
    return new Promise(resolve => {
      const m = UI.modal(title, `<p>${UI.esc(msg)}</p>`,
        `<button class="btn btn-ghost" id="cf-no">إلغاء</button><button class="btn btn-danger" id="cf-yes">${UI.esc(okLabel)}</button>`);
      m.el.querySelector('#cf-no').onclick = () => { m.close(); resolve(false); };
      m.el.querySelector('#cf-yes').onclick = () => { m.close(); resolve(true); };
    });
  },

  viewPhoto(url, downloadName){
    const root = document.getElementById('viewer-root');
    const bg = document.createElement('div'); bg.className = 'viewer-back';
    bg.innerHTML = `<div class="viewer-actions">
        <a class="icon-btn" href="${UI.attr(url)}" download="${UI.attr(downloadName||'photo.jpg')}" target="_blank">${icon('download',18)}</a>
        <button class="icon-btn viewer-x">${icon('close',18)}</button>
      </div>
      <img class="viewer-img" src="${UI.attr(url)}">`;
    root.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('.viewer-x').onclick = close;
    bg.addEventListener('mousedown', e => { if(e.target===bg) close(); });
  },

  imageViewer(src){
    if(!src) return;
    const root = document.getElementById('viewer-root') || document.body;
    const bg = document.createElement('div'); bg.className = 'img-viewer';
    bg.innerHTML = `<button class="img-viewer-x" title="إغلاق">${icon('close',18)}</button>
      <img src="${UI.attr(src)}" alt="">`;
    root.appendChild(bg);
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if(e.key === 'Escape') close(); };
    bg.querySelector('.img-viewer-x').onclick = close;
    bg.addEventListener('mousedown', e => { if(e.target === bg) close(); });
    document.addEventListener('keydown', onKey);
  },

  empty(text, ic='page'){
    return `<div class="empty-state">${icon(ic,40)}<div>${UI.esc(text)}</div></div>`;
  },
  errorBox(msg){
    return `<div class="empty-state">${icon('alert',40)}<div style="color:var(--red);font-weight:700">${UI.esc(msg)}</div></div>`;
  },
};
