/* Water refraction for the Sustainability crossing. The original film remains
   visible if WebGL is unavailable or motion is disabled. */
(() => {
  const video = document.getElementById('dive');
  const canvas = document.getElementById('water-ripple');
  const section = document.getElementById('sustainability');
  const heading = section?.querySelector('h2');
  if (!video || !canvas || !section || !heading) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
  if (!gl) return;

  const vertexSource = `attribute vec2 a_pos; varying vec2 v_uv;
    void main(){ v_uv=(a_pos+1.0)*0.5; gl_Position=vec4(a_pos,0.0,1.0); }`;
  const fragmentSource = `precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_film;
    uniform vec2 u_size;
    uniform vec2 u_film_size;
    uniform vec2 u_center;
    uniform float u_time;
    uniform float u_mobile;
    void main(){
      float aspect=u_size.x/u_size.y;
      vec2 metric=vec2((v_uv.x-u_center.x)*aspect,v_uv.y-u_center.y);
      float angle=atan(metric.y,metric.x);
      float radius=length(metric)+sin(angle*7.0+u_time*1.1)*0.0025+sin(angle*11.0-u_time*0.7)*0.0015;
      float cycle=u_time;
      float front=cycle*0.105;
      float wave=0.0;
      float crest=0.0;
      float trough=0.0;
      float coverage=0.0;
      for(int i=0;i<2;i++){
        float edge=radius-(front-float(i)*0.048);
        float weight=1.0-float(i)*0.35;
        float band=exp(-pow(edge/0.019,2.0));
        wave+=sin(edge*175.0)*band*weight;
        coverage+=band*weight;
        float glint=0.30+0.70*pow(max(0.0,sin(angle*9.0+u_time*0.7)+0.35*sin(angle*17.0-u_time*0.4)),2.0);
        crest+=exp(-pow((edge-0.004)/0.006,2.0))*weight*glint;
        trough+=exp(-pow((edge+0.008)/0.008,2.0))*weight;
      }
      float fade=smoothstep(0.0,0.42,cycle)*(1.0-smoothstep(3.55,4.2,cycle));
      if(u_mobile>0.5){
        float shade=(crest*0.11+trough*0.065)*fade;
        gl_FragColor=vec4(0.0,0.0,0.0,clamp(shade,0.0,0.11));
        return;
      }
      vec2 direction=normalize(metric+vec2(0.0001));
      vec2 uv=v_uv+vec2(direction.x/aspect,direction.y)*wave*0.0112*fade;
      float filmAspect=u_film_size.x/u_film_size.y;
      if(aspect>filmAspect) uv.y=(uv.y-0.5)*(filmAspect/aspect)+0.5;
      else uv.x=(uv.x-0.5)*(aspect/filmAspect)+0.5;
      vec3 color=texture2D(u_film,clamp(uv,0.0,1.0)).rgb;
      color+=vec3(0.22,0.29,0.28)*crest*0.8*fade;
      color-=vec3(0.07,0.09,0.08)*trough*0.8*fade;
      gl_FragColor=vec4(color,clamp(coverage*1.15*fade,0.0,1.0));
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (_) {
    return;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.uniform1i(gl.getUniformLocation(program, 'u_film'), 0);
  const size = gl.getUniformLocation(program, 'u_size');
  const filmSize = gl.getUniformLocation(program, 'u_film_size');
  const centerLocation = gl.getUniformLocation(program, 'u_center');
  const time = gl.getUniformLocation(program, 'u_time');
  const mobileLocation = gl.getUniformLocation(program, 'u_mobile');
  let frame = 0, active = false, played = false, started = 0, lastDraw = 0, lastFilmTime = -1;
  let textureReady = false;
  let center = [0.5, 0.5];

  function allowed() {
    return !reducedMotion.matches && !document.body.classList.contains('motion-paused') &&
      !document.hidden && (innerWidth < 768 || textureReady);
  }
  function uploadFrame() {
    if (innerWidth < 768 || video.readyState < 2 || !video.videoWidth) return;
    try {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      lastFilmTime = video.currentTime;
      textureReady = true;
    } catch (_) {
      // Keep the last decoded frame while the video is seeking.
    }
  }
  function inScene() {
    const sectionRect = section.getBoundingClientRect();
    const rect = heading.getBoundingClientRect();
    const middle = (rect.top + rect.bottom) / 2;
    return sectionRect.bottom > innerHeight * 0.45 &&
      middle <= innerHeight * 0.72 && middle >= innerHeight * 0.28;
  }
  function nearScene() {
    const rect = section.getBoundingClientRect();
    return rect.top < innerHeight * 1.5 && rect.bottom > 0;
  }
  function headingCenter() {
    const title = heading.getBoundingClientRect();
    const film = canvas.getBoundingClientRect();
    return [
      (title.left + title.width / 2 - film.left) / film.width,
      1 - (title.top + title.height / 2 - film.top) / film.height
    ];
  }
  function stop() {
    active = false;
    canvas.classList.remove('is-active');
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function draw(now) {
    frame = 0;
    if (!active) return;
    if (!allowed()) { played = false; stop(); return; }
    if (started && now - started >= 4200) { stop(); return; }
    if (now - lastDraw >= 32) {
      lastDraw = now;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (innerWidth >= 768 && video.currentTime !== lastFilmTime && !video.seeking) uploadFrame();
      if (!started) started = now;
      gl.uniform2f(size, width, height);
      gl.uniform2f(filmSize, Math.max(1, video.videoWidth), Math.max(1, video.videoHeight));
      gl.uniform1f(mobileLocation, innerWidth < 768 ? 1 : 0);
      center = headingCenter();
      gl.uniform2f(centerLocation, center[0], center[1]);
      gl.uniform1f(time, (now - started) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      canvas.classList.add('is-active');
    }
    frame = requestAnimationFrame(draw);
  }
  function update() {
    if (!inScene()) { played = false; stop(); return; }
    if (!allowed()) { played = false; stop(); return; }
    if (active || played) return;
    active = true;
    played = true;
    center = headingCenter();
    started = 0;
    frame = requestAnimationFrame(draw);
  }
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', () => { uploadFrame(); update(); }, { passive: true });
  video.addEventListener('loadeddata', () => { uploadFrame(); update(); });
  video.addEventListener('seeked', () => { if (nearScene()) uploadFrame(); update(); });
  document.addEventListener('visibilitychange', update);
  reducedMotion.addEventListener('change', update);
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); });
  uploadFrame();
  update();
})();
