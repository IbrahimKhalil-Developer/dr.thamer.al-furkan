const TW = {
  url: 'https://miyehoqqbyihpwzulgnc.supabase.co',
  tokKey: 'tw_access_token', refKey: 'tw_refresh_token', adminKey: 'tw_admin',

  get accessToken(){ return localStorage.getItem(this.tokKey) || ''; },
  get refreshToken(){ return localStorage.getItem(this.refKey) || ''; },
  get admin(){ try{ return JSON.parse(localStorage.getItem(this.adminKey) || 'null'); }catch{ return null; } },

  setSession(accessToken, refreshToken, admin){
    localStorage.setItem(this.tokKey, accessToken || '');
    localStorage.setItem(this.refKey, refreshToken || '');
    if(admin) localStorage.setItem(this.adminKey, JSON.stringify(admin));
  },
  clearSession(){
    localStorage.removeItem(this.tokKey);
    localStorage.removeItem(this.refKey);
    localStorage.removeItem(this.adminKey);
  },

  fnUrl(name){ return `${this.url}/functions/v1/${name}`; },

  async raw(name, body){
    const headers = { 'Content-Type':'application/json' };
    if(this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
    let res;
    try{
      res = await fetch(this.fnUrl(name), { method:'POST', headers, body: JSON.stringify(body || {}) });
    }catch{
      throw new Error('تعذّر الاتصال بالخادم، تحقّق من الإنترنت');
    }
    let data = null;
    const txt = await res.text();
    try{ data = txt ? JSON.parse(txt) : null; }catch{ data = { error:true, errors: txt || ('HTTP '+res.status) }; }
    return { ok: res.ok && !(data && data.error), status: res.status, data };
  },

  async call(name, body){
    let r = await this.raw(name, body);
    if(!r.ok && r.data && r.data.code === 'AUTH' && this.refreshToken){
      const v = await this.verify();
      if(v && v.error === false) r = await this.raw(name, body);
    }
    if(!r.ok){
      const msg = (r.data && (r.data.errors || r.data.error)) || ('HTTP '+r.status);
      const err = new Error(typeof msg === 'string' ? msg : 'خطأ غير معروف');
      err.code = r.data && r.data.code;
      throw err;
    }
    return r.data;
  },

  async login(email, password){
    const r = await this.raw('testweb_auth', { action:'login', email, password });
    if(!r.ok) throw new Error((r.data && r.data.errors) || 'تعذّر تسجيل الدخول');
    this.setSession(r.data.access_token, r.data.refresh_token, r.data.admin);
    return r.data.admin;
  },

  async verify(){
    const r = await this.raw('testweb_auth', { action:'verify', access_token:this.accessToken, refresh_token:this.refreshToken });
    if(!r.ok){ this.clearSession(); return r.data; }
    this.setSession(r.data.access_token, r.data.refresh_token, r.data.admin);
    return r.data;
  },

  logout(){ this.clearSession(); },
};
