/* ============ طبقة الاتصال بـ Supabase Edge Functions ============ */
const TW = {
  urlKey: 'tw_supabase_url',
  keyKey: 'tw_supabase_key',

  get url(){ return (localStorage.getItem(this.urlKey) || '').replace(/\/+$/,''); },
  get key(){ return localStorage.getItem(this.keyKey) || ''; },
  get configured(){ return !!this.url; },

  save(url, key){
    localStorage.setItem(this.urlKey, url.trim().replace(/\/+$/,''));
    localStorage.setItem(this.keyKey, key.trim());
  },
  clear(){ localStorage.removeItem(this.urlKey); localStorage.removeItem(this.keyKey); },

  fnUrl(name){ return `${this.url}/functions/v1/${name}`; },

  // استدعاء فِكشن: GET إن لم يوجد body، وإلا POST بصيغة JSON
  async call(name, body){
    const headers = { 'Content-Type':'application/json' };
    if(this.key){ headers['apikey'] = this.key; headers['Authorization'] = `Bearer ${this.key}`; }
    const opts = body === undefined
      ? { method:'GET', headers }
      : { method:'POST', headers, body: JSON.stringify(body) };
    let res;
    try{
      res = await fetch(this.fnUrl(name), opts);
    }catch(e){
      throw new Error('تعذّر الاتصال بالخادم — تحقّق من الرابط والإنترنت');
    }
    let data = null;
    const txt = await res.text();
    try{ data = txt ? JSON.parse(txt) : null; }catch{ data = { error:true, errors: txt || ('HTTP '+res.status) }; }
    if(!res.ok || (data && data.error)){
      const msg = (data && (data.errors || data.error)) || ('HTTP '+res.status);
      throw new Error(typeof msg === 'string' ? msg : 'خطأ غير معروف');
    }
    return data;
  },
};
