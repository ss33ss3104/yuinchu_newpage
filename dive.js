/* ══════════════════════════════════════════════════════════════
   潜水映像のスクロール連動（案A・案B 共通）

   ページのスクロール量 0〜100% を、映像の 0秒〜最後 に割り当てる。
   一番上が浜辺、一番下がウミガメ。読み進める速さが、そのまま潜る速さになる。

   ■ なぜ映像を「再生」せずに currentTime を書き換えるのか
     再生すると、スクロールを止めても勝手に進んでしまう。
     指の動きと絵を一致させるには、1コマずつ手で送る必要がある。

   ■ 映像は全コマがキーフレーム（-g 1 で書き出し済み）
     普通の動画は数十コマに1枚しか「完全な絵」を持たないので、
     途中へ飛ぶと近くの完全な絵まで戻って計算し直す。それがカクつきになる。
     全コマを完全な絵にしてあるので、どこへ飛んでも1枚読むだけで表示できる。
     その代わりファイルは大きくなる（6.4MB）。

   ■ 触った人（坂西さん）へ
     動きの重さは SETTINGS.ease で変わる。数字が小さいほど、ぬるっと遅れて追う。
     0.10 前後が基準。0.30 にすると指にぴったり付くが硬い。
   ══════════════════════════════════════════════════════════════ */

function initDive(refs) {
  const SETTINGS = {
    ease: 0.12,        // 映像が指を追う重さ。小さいほど遅れて滑らかに追う
    snap: 0.004,       // これ以下の差は動かさない（無駄なシークを止める）
    minDelta: 0.008,   // これ以下の差ではコマを送らない（秒）
    bgEvery: 3         // 背面のぼかし映像を何フレームに1回そろえるか
  };

  const main = refs.main;
  const ambient = refs.ambient;
  const windowEl = refs.windowEl;
  const tintEl = refs.tintEl;
  const sections = Array.from(document.querySelectorAll('[data-window]'));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 動きを止める設定の人には、最初のコマだけ見せて終わり ── */
  if (reduced) {
    document.body.classList.add('is-static');
    applyWindowState(sections[0] ? sections[0].dataset.window : 'center-lg');
    return;
  }

  let duration = 0;
  let target = 0;
  let current = 0;
  let frame = 0;
  let lastState = '';
  let lastTint = -1;

  /* ── 映像の長さが分かったら、そこからコマ送りを始める ──
     ⚠️ 長さが分かるまで待ってから動き出す作りにしない。
     回線が遅いと映像が届くまで窓が固まったままになり、
     ページが壊れているように見える（2026-09-05 に実装中に判明）。
     窓の動きと文字は映像と関係なく先に動かし、映像は届き次第あとから乗る。 */
  const onMeta = () => { duration = main.duration || 0; };
  if (main.readyState >= 1) onMeta();
  main.addEventListener('loadedmetadata', onMeta);
  main.addEventListener('durationchange', onMeta);

  /* ── iOS 対策 ────────────────────────────────────────
     iOS は一度も再生していない映像のコマを描画しないことがある。
     消音なら操作なしで再生できるので、始めた直後に止めてデコーダだけ起こす。 */
  const wake = (video) => {
    if (!video) return;
    const p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(() => video.pause()).catch(() => {});
    } else {
      video.pause();
    }
  };
  wake(main);
  wake(ambient);

  /* ── セクションの位置を測る ──────────────────────────
     文字の折り返しが変わると高さも変わるので、リサイズのたびに測り直す。 */
  let bounds = [];
  let scrollMax = 1;

  function measure() {
    scrollMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    bounds = sections.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        el: el,
        top: rect.top + window.scrollY,
        height: rect.height,
        state: el.dataset.window || 'center-lg',
        tint: Number(el.dataset.tint || 0)
      };
    });
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 160);
  });

  /* ── 窓の状態を切り替える ────────────────────────────
     位置と大きさは CSS の transform だけで動かす。
     width や left を動かすと、そのたびにページ全体の計算がやり直しになる。 */
  function applyWindowState(state) {
    if (state === lastState) return;
    if (lastState) windowEl.classList.remove('is-' + lastState);
    windowEl.classList.add('is-' + state);
    document.body.dataset.dive = state;
    lastState = state;
  }

  /* ── 水の色の濃さ ────────────────────────────────────
     深くなるほど濃紺がかぶる。セクションの間は少しずつ混ぜる。 */
  function tintAt(scrollY) {
    if (!bounds.length) return 0;
    const y = scrollY + window.innerHeight * 0.5;
    for (let i = 0; i < bounds.length; i++) {
      const b = bounds[i];
      if (y < b.top + b.height) {
        const next = bounds[i + 1];
        const ratio = Math.min(1, Math.max(0, (y - b.top) / Math.max(1, b.height)));
        const to = next ? next.tint : b.tint;
        return b.tint + (to - b.tint) * ratio;
      }
    }
    return bounds[bounds.length - 1].tint;
  }

  /* ── 今、画面の中央にあるセクション ──────────────────── */
  function stateAt(scrollY) {
    const y = scrollY + window.innerHeight * 0.5;
    let state = bounds.length ? bounds[0].state : 'center-lg';
    for (const b of bounds) {
      if (y >= b.top) state = b.state;
    }
    return state;
  }

  /* ── 毎フレームの処理 ────────────────────────────────
     スクロールイベントで直接動かすと、1フレームに何度も走る。
     ここ1箇所にまとめる。 */
  function loop() {
    const y = window.scrollY;
    const progress = Math.min(1, Math.max(0, y / scrollMax));

    if (duration > 0) {
      target = progress * duration;
      current += (target - current) * SETTINGS.ease;
      if (Math.abs(target - current) < SETTINGS.snap) current = target;

      if (main.readyState >= 2 && !main.seeking && Math.abs(main.currentTime - current) > SETTINGS.minDelta) {
        main.currentTime = current;
      }

      frame++;
      if (ambient && frame % SETTINGS.bgEvery === 0 && ambient.readyState >= 2 && !ambient.seeking) {
        if (Math.abs(ambient.currentTime - current) > 0.05) ambient.currentTime = current;
      }
    }

    applyWindowState(stateAt(y));
    updateParallax();
    sweepMotion();

    if (tintEl) {
      const t = Math.round(tintAt(y));
      if (t !== lastTint) {          // 同じ値なら書かない
        tintEl.style.opacity = (t / 100).toFixed(2);
        lastTint = t;
      }
    }

    requestAnimationFrame(loop);
  }

  /* ── 節ごとの動き ────────────────────────────────────
     `data-motion` の値で動きを変える。節が変わるたびに違う動きにする
     （同じ動きが続くと、動いていること自体に気づかれなくなる）。

     ⚠️ 隠す指定は JS 側から `.mo` を付けて当てる。
     CSS に最初から書くと、JS を切ったときに文字が消えたままになる。

     ⚠️ 動かすのは transform / opacity / clip-path / filter だけ。
     幅や高さを動かすと、そのたびにページ全体の計算がやり直しになる。 */
  const motionTargets = document.querySelectorAll('[data-motion]');
  motionTargets.forEach((el) => el.classList.add('mo'));

  /* ⚠️ 出現の判定に IntersectionObserver を使わない。
     監視が発火しないまま通り過ぎると、その節の文字が隠れたまま残る
     （2026-09-05 に実際に起きた。画面のいくつかで文字が消えていた）。
     毎フレームの loop から位置を見て、画面に入った／通り過ぎたものは必ず出す。
     出し終えた要素は pending から外すので、全部出れば何もしなくなる。 */
  let pending = Array.from(motionTargets);

  function show(el) {
    el.classList.add('is-in');
  }

  function sweepMotion() {
    if (!pending.length) return;
    const vh = window.innerHeight;
    pending = pending.filter((el) => {
      const rect = el.getBoundingClientRect();
      const entered = rect.top < vh * 0.92 && rect.bottom > 0;  // 画面に入った
      const passed = rect.bottom <= 0;                           // 上へ通り過ぎた
      if (entered || passed) {
        show(el);
        return false;
      }
      return true;
    });
  }

  sweepMotion();

  /* ── 視差（SD-02）────────────────────────────────────
     画面の中を通り過ぎる間だけ、要素をゆっくり逆方向へ動かす。
     毎フレーム書き込むので、同じ値なら書かない。 */
  const paraTargets = Array.from(document.querySelectorAll('[data-parallax]'));
  const paraLast = new WeakMap();

  function updateParallax() {
    if (!paraTargets.length) return;
    const vh = window.innerHeight;
    paraTargets.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > vh + 200) return;
      const center = rect.top + rect.height / 2;
      const ratio = (center - vh / 2) / vh;           // 画面中央で 0
      const amount = Number(el.dataset.parallax) || 40;
      const y = Math.round(-ratio * amount * 10) / 10;
      if (paraLast.get(el) !== y) {                    // 同じ値なら書かない
        el.style.transform = 'translate3d(0,' + y + 'px,0)';
        paraLast.set(el, y);
      }
    });
  }

  window.addEventListener('load', measure);

  /* ── 開始 ────────────────────────────────────────────
     映像を待たない。窓と文字は先に動く。 */
  measure();
  loop();
}
