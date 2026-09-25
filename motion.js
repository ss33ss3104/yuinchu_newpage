/* YUINCHU — one render owner for the film and its foreground choreography.
   Native scrolling, cached layout reads, time-based easing; no scroll interception. */
function initDive(refs) {
  const body = document.body;
  const q = (s) => document.querySelector(s);
  const all = (s) => [...document.querySelectorAll(s)];
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduce.matches;
  let userPaused = new URLSearchParams(location.search).get('motion') === 'off';
  const toggle = q('.motion-toggle');
  const sections = all('main > .sc');
  const hero = q('.sc--hero');
  const crossing = q('.sc--break');
  const gallery = q('.gallery-journey');
  const track = q('.beach__track');
  const strip = q('.beach__strip');
  const photos = all('.beach__track figure:not([aria-hidden])');
  const acts = all('.act');
  const ruled = q('.ruled');
  const co = q('.cocreation__head');
  const contact = q('.cta');
  const chapterNumber = q('.journey__number');
  const chapterSections = ['.sc--hero','#philosophy','#sustainability','#beach-clean','#co-creation','.sc--product','#company'].map(q);
  const arrivals = all('.philosophy__body > *, .beach__head h2, .beach__text > *, .act__title, .act__text, .ruled > div, .product__body > *, .company__inner > *');
  arrivals.forEach(el => { el.dataset.arrive = /^H[123]$/.test(el.tagName) ? 'type' : 'body'; });
  // Original data-motion markup is retained for content parity, but original .mo is never added.
  let frameId = null, lastTime = 0, lastY = -1, filmTime = 0, duration = 0;
  let geometry = new Map(), anchors = [], maxY = 1, vh = innerHeight, travel = 0;
  let pending = new Set(arrivals), needsMeasure = true, videosLoaded = false;
  let chapter = -1;
  const values = new WeakMap();
  function set(el, name, value) {
    if (!el) return;
    let map = values.get(el);
    if (!map) values.set(el, map = new Map());
    const v = typeof value === 'number' ? value.toFixed(4) : value;
    if (map.get(name) === v) return;
    map.set(name, v); el.style.setProperty(name, v);
  }
  function request() {
    if (frameId === null && !document.hidden) frameId = requestAnimationFrame(render);
  }
  function invalidate() { needsMeasure = true; request(); }
  function measure() {
    vh = innerHeight;
    maxY = Math.max(1, document.documentElement.scrollHeight - vh);
    const targets = new Set([...sections, ...arrivals, ...acts, gallery, ruled, co, contact]);
    // Read all layout before the animation write phase. Section positions are never transformed.
    targets.forEach(el => {
      if (!el) return;
      let y = 0;
      for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
      geometry.set(el, { y, h: el.offsetHeight });
    });
    travel = Math.max(0, track.scrollWidth - strip.clientWidth);
    const at = (el, fraction = 0) => { const b = geometry.get(el); return b.y + b.h * fraction; };
    // Tie the waterline to the pinned interval; keep the video still throughout the inquiry form.
    anchors = [
      [0,0], [at(q('#philosophy')) - vh*.25,2],
      [at(crossing),4.25], [at(crossing) + Math.max(0,geometry.get(crossing).h-vh)*.8,5.65],
      [at(q('.sc--acts')) - vh*.15,6], [at(q('#beach-clean'))-vh*.2,8.25],
      [at(gallery),8.7], [at(gallery)+Math.max(0,geometry.get(gallery).h-vh),9.15],
      [at(q('#co-creation'))-vh*.15,9.5], [at(q('.sc--product'))-vh*.15,11],
      [at(q('#company'))-vh*.15,12], [at(q('#contact'))-vh*.5,13],
      [Math.max(at(q('#contact')), at(q('#contact'),1)-vh*.45)+1,13], [at(q('.sc--closing'))-vh*.15,14.5], [maxY,15]
    ].map(([y,t]) => [clamp(y,0,maxY),t]).sort((a,b)=>a[0]-b[0])
      .filter((p,i,arr)=>i===arr.length-1 || p[0]<arr[i+1][0]);
    needsMeasure = false;
  }
  function timeAt(y) {
    for (let i=1;i<anchors.length;i++) {
      if (y<=anchors[i][0]) {
        const a=anchors[i-1], b=anchors[i];
        return a[1]+clamp((y-a[0])/(b[0]-a[0]))*(b[1]-a[1]);
      }
    }
    return anchors[anchors.length-1][1];
  }
  const progress = (el,y) => { const b=geometry.get(el); return clamp((y-b.y)/Math.max(1,b.h-vh)); };
  const entering = (el,y) => { const b=geometry.get(el); return clamp((y+vh*.85-b.y)/(vh*.6)); };
  function reveal(y) {
    pending.forEach(el => {
      if (geometry.get(el).y<y+vh*.94) { el.classList.add('arrived'); pending.delete(el); }
    });
  }
  function loadVideos() {
    if (videosLoaded || paused) return;
    videosLoaded = true;
    refs.main.src = innerWidth < 768 ? 'assets/dive/dive-sm.mp4' : 'assets/dive/dive.mp4';
    refs.main.load();
    if (innerWidth >= 768 && refs.ambient) { refs.ambient.src = 'assets/dive/dive-sm.mp4'; refs.ambient.load(); }
  }
  [refs.main, refs.ambient].filter(Boolean).forEach(video => {
    video.addEventListener('loadedmetadata', () => { if(video===refs.main) duration=video.duration; request(); });
    video.addEventListener('loadeddata', () => {
      if (paused) return;
      const play = video.play();
      if(play) play.then(()=>{video.pause();request();}).catch(request);
    });
    video.addEventListener('seeked', request);
    video.addEventListener('error', () => { video.style.visibility='hidden'; request(); });
  });
  function render(now) {
    frameId = null;
    const dt = Math.min(50,lastTime ? now-lastTime : 16.67); lastTime=now;
    const measured = needsMeasure;
    if(needsMeasure) measure();
    const y = scrollY;
    set(body,'--current',clamp(y/maxY));
    let nextChapter=0;
    chapterSections.forEach((el,i)=>{if(geometry.get(el).y<=y+vh*.42) nextChapter=i;});
    if(nextChapter!==chapter) { chapter=nextChapter; chapterNumber.textContent=String(chapter+1).padStart(2,'0'); }
    reveal(y);
    if(paused) { lastY=y; return; }
    const target=Math.min(Math.max(0,duration-.045), timeAt(y));
    filmTime += (target-filmTime)*(1-Math.exp(-dt/100));
    if(Math.abs(target-filmTime)<.006) filmTime=target;
    if(refs.main.readyState>=2 && !refs.main.seeking && Math.abs(refs.main.currentTime-filmTime)>.016) refs.main.currentTime=filmTime;
    if(refs.ambient && refs.ambient.readyState>=2 && !refs.ambient.seeking && Math.abs(refs.ambient.currentTime-filmTime)>.09) refs.ambient.currentTime=filmTime;
    if(y!==lastY || measured) {
      const hp=progress(hero,y);
      const heroEnd=geometry.get(hero).y+geometry.get(hero).h;
      set(hero,'--hero-y',(-hp*12).toFixed(2)+'px');
      set(hero,'--hero-scale',1-hp*.04);
      set(hero,'--hero-alpha',1-smooth((y-(heroEnd-vh*.85))/(vh*.5)));
      const cp=progress(crossing,y);
      const approach=entering(crossing,y);
      set(crossing,'--line-x',((1-smooth(approach))*36).toFixed(2)+'px');
      set(crossing,'--line-y',((1-smooth(approach))*38).toFixed(2)+'px');
      set(crossing,'--break-scale',1+.065*smooth(cp));
      const surface= Math.sin(clamp((y-geometry.get(crossing).y+vh*.6)/(geometry.get(crossing).h+vh*.3))*Math.PI);
      set(body,'--surface',surface*.24);
      set(body,'--ring-scale',.5+cp*1.5);
      set(body,'--light',clamp(timeAt(y)/8)*.55);
      set(body,'--light-x',(-clamp(y/maxY)*45).toFixed(2)+'px');
      set(refs.tintEl,'opacity',.1+clamp(timeAt(y)/15)*.3);
      acts.forEach((el,i)=>{const p=entering(el,y); set(el,'--rule',smooth(p)); set(el,'--act-x',((1-smooth(p))*(i%2 ? -35 : 35)).toFixed(2)+'px');});
      const gp=progress(gallery,y);
      set(gallery,'--gallery-x',(-gp*travel).toFixed(2)+'px'); set(gallery,'--gallery-p',gp);
      photos.forEach((el,i)=>{
        const d=clamp((gp*3-i),-1,1);
        set(el,'--photo-y',(Math.abs(d)*16).toFixed(2)+'px');
        set(el,'--photo-r',(d*-1.7).toFixed(2)+'deg');
      });
      set(ruled,'--thread',clamp((y+vh*.75-geometry.get(ruled).y)/geometry.get(ruled).h));
      set(co,'--co-y',((1-entering(co,y))*40).toFixed(2)+'px');
      const ap=entering(contact,y);
      const contactBox=geometry.get(contact);
      contact.classList.toggle('is-rippling',ap>.35 && y<contactBox.y+contactBox.h+vh*.6);
      lastY=y;
    }
    // Once the seek settles, no background animation loop remains active.
    if(Math.abs(target-filmTime)>.006) request();
  }
  function applyPause() {
    paused = reduce.matches || userPaused;
    body.classList.toggle('motion-paused',paused);
    if (!paused) body.classList.add('motion-ready');
    toggle.setAttribute('aria-pressed',String(paused));
    toggle.setAttribute('aria-label',paused ? '動きを再開する' : '動きを止める');
    toggle.querySelector('span').textContent=paused?'▷':'Ⅱ';
    toggle.disabled=reduce.matches;
    if(reduce.matches) toggle.setAttribute('aria-label','端末の設定により動きを停止中');
    if(paused) { refs.main.pause(); refs.ambient?.pause(); }
    else { strip.scrollLeft=0; loadVideos(); }
    lastY=-1; invalidate();
  }
  toggle.addEventListener('click',()=>{userPaused=!userPaused;applyPause();});
  reduce.addEventListener('change',applyPause);
  addEventListener('scroll',request,{passive:true});
  addEventListener('resize',invalidate,{passive:true});
  addEventListener('pageshow',invalidate);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) { if(frameId!==null) cancelAnimationFrame(frameId); frameId=null; lastTime=0; }
    else { lastY=-1; invalidate(); }
  });
  const resize=new ResizeObserver(invalidate); resize.observe(document.querySelector('main'));
  document.fonts?.ready.then(invalidate);
  all('img').forEach(img=>img.addEventListener('load',invalidate,{once:true}));
  // Escape and tab confinement complete the existing mobile-menu interaction.
  const nav=q('#global-nav'), menu=q('#menu-button');
  document.addEventListener('keydown',e=>{
    if(!nav.classList.contains('is-open')) return;
    if(e.key==='Escape') { menu.click(); menu.focus(); }
    if(e.key==='Tab') {
      const focusables=[...nav.querySelectorAll('a'),menu];
      const index=focusables.indexOf(document.activeElement);
      if(e.shiftKey && index<=0) {e.preventDefault();menu.focus();}
      else if(!e.shiftKey && index===focusables.length-1) {e.preventDefault();focusables[0].focus();}
    }
  });
  applyPause();
}
