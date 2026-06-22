/* ============ أدوات الواجهة المشتركة ============ */
const UI = {
  esc(s){
    return String(s ?? '').replace(/[&<>"']/g, c => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
    ));
  },

  // نص آمن للاستخدام داخل خاصية onclick (مفرد)
  attr(s){ return String(s ?? '').replace(/['"\\]/g, '\\$&'); },

  toast(msg, type='info', ms=3200){
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const ic = type==='ok' ? '✓' : type==='err' ? '✕' : 'ℹ';
    t.innerHTML = `<span>${ic}</span><span>${UI.esc(msg)}</span>`;
    root.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(-20px)'; setTimeout(()=>t.remove(),250); }, ms);
  },

  async copy(text){
    try{
      await navigator.clipboard.writeText(text);
      UI.toast('تم النسخ', 'ok', 1400);
    }catch{
      const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta);
      ta.select(); try{document.execCommand('copy'); UI.toast('تم النسخ','ok',1400);}catch{UI.toast('تعذّر النسخ','err');}
      ta.remove();
    }
  },

  // حقل قابل للنسخ
  copyField(value, opts={}){
    const v = value==null || value==='' ? '—' : String(value);
    const canCopy = v !== '—' && opts.copy !== false;
    const cp = canCopy ? `<button class="cp" title="نسخ" onclick="UI.copy('${UI.attr(v)}')">⧉</button>` : '';
    return `<span class="copy-field"><span class="val">${UI.esc(v)}</span>${cp}</span>`;
  },

  // حقل كلمة مرور: مخفي بنجوم، زر عرض، زر نسخ
  pwField(value){
    const v = value==null || value==='' ? '' : String(value);
    if(!v) return `<span class="copy-field"><span class="val">—</span></span>`;
    const id = 'pw'+Math.random().toString(36).slice(2,8);
    const masked = '•'.repeat(Math.min(10, Math.max(6, v.length)));
    return `<span class="copy-field pw-field" data-pw="${UI.attr(v)}" data-shown="0" id="${id}">
      <span class="val pw-hidden">${masked}</span>
      <button class="eye" title="عرض" onclick="UI.togglePw('${id}')">👁</button>
      <button class="cp" title="نسخ" onclick="UI.copy('${UI.attr(v)}')">⧉</button>
    </span>`;
  },
  togglePw(id){
    const el = document.getElementById(id); if(!el) return;
    const val = el.getAttribute('data-pw'); const shown = el.getAttribute('data-shown')==='1';
    const span = el.querySelector('.val'); const eye = el.querySelector('.eye');
    if(shown){
      span.textContent = '•'.repeat(Math.min(10, Math.max(6, val.length)));
      span.classList.add('pw-hidden'); eye.textContent='👁'; el.setAttribute('data-shown','0');
    }else{
      span.textContent = val; span.classList.remove('pw-hidden'); eye.textContent='🙈'; el.setAttribute('data-shown','1');
    }
  },

  badge(kind, text){ return `<span class="badge ${kind}">${UI.esc(text)}</span>`; },

  progress(pct){
    const p = Math.max(0, Math.min(100, Number(pct)||0));
    return `<div class="progress-row"><div class="progress" style="flex:1"><i data-w="${p}"></i></div><span class="pct">${p}%</span></div>`;
  },

  // تحريك أشرطة التقدّم بعد الإدراج
  animateBars(scope){
    (scope||document).querySelectorAll('.progress > i[data-w]').forEach(i=>{
      const w=i.getAttribute('data-w'); requestAnimationFrame(()=>{ setTimeout(()=>{ i.style.width=w+'%'; },40); });
    });
  },

  // عدّاد متصاعد
  countUp(el, to){
    const dur=700, start=performance.now(), from=0;
    function step(now){
      const t=Math.min(1,(now-start)/dur); const ease=1-Math.pow(1-t,3);
      el.textContent = Math.round(from+(to-from)*ease).toLocaleString('ar-EG');
      if(t<1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
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
  ago(s){
    if(!s) return '—';
    const d=new Date(s); if(isNaN(d)) return '—';
    const sec=Math.floor((Date.now()-d.getTime())/1000);
    if(sec<60) return 'قبل ثوانٍ';
    if(sec<3600) return `قبل ${Math.floor(sec/60)} دقيقة`;
    if(sec<86400) return `قبل ${Math.floor(sec/3600)} ساعة`;
    return `قبل ${Math.floor(sec/86400)} يوم`;
  },

  // نافذة منبثقة
  modal(title, bodyHtml, footHtml, opts={}){
    const root=document.getElementById('modal-root');
    const bg=document.createElement('div'); bg.className='modal-bg';
    bg.innerHTML=`<div class="modal ${opts.wide?'wide':''}">
      <div class="modal-head"><h3>${UI.esc(title)}</h3><button class="modal-x">✕</button></div>
      <div class="modal-body">${bodyHtml}</div>
      ${footHtml?`<div class="modal-foot">${footHtml}</div>`:''}
    </div>`;
    root.appendChild(bg);
    const close=()=>{ bg.style.opacity='0'; setTimeout(()=>bg.remove(),180); };
    bg.querySelector('.modal-x').onclick=close;
    bg.addEventListener('mousedown', e=>{ if(e.target===bg) close(); });
    UI.animateBars(bg);
    return { el:bg, close };
  },

  errorBox(msg){
    return `<div class="empty"><div class="ic">⚠️</div><div style="font-weight:700;color:var(--red)">${UI.esc(msg)}</div></div>`;
  },
  empty(text, ic='📭'){ return `<div class="empty"><div class="ic">${ic}</div><div>${UI.esc(text)}</div></div>`; },
  skeletonCards(n=8){ return `<div class="grid">${Array.from({length:n},()=>'<div class="skeleton sk-card"></div>').join('')}</div>`; },
};
