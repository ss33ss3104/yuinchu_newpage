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
    vec2 filmUV(vec2 uv){
      float aspect=u_size.x/u_size.y;
      float filmAspect=u_film_size.x/u_film_size.y;
      if(aspect>filmAspect) uv.y=(uv.y-0.5)*(filmAspect/aspect)+0.5;
      else uv.x=(uv.x-0.5)*(aspect/filmAspect)+0.5;
      return clamp(uv,0.0,1.0);
    }
    void main(){
      float aspect=u_size.x/u_size.y;
      vec2 metric=vec2((v_uv.x-u_center.x)*aspect,v_uv.y-u_center.y);
      float distance=length(metric);
      float front=u_time*0.105;
      if(distance>front+0.065 || distance<max(0.0,front-0.11)){
        gl_FragColor=u_mobile>0.5 ? vec4(texture2D(u_film,filmUV(v_uv)).rgb,1.0) : vec4(0.0);
        return;
      }
      float angle=atan(metric.y,metric.x);
      float radius=distance+sin(angle*7.0+u_time*1.1)*0.0025+sin(angle*11.0-u_time*0.7)*0.0015;
      float cycle=u_time;
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
      vec2 direction=normalize(metric+vec2(0.0001));
      vec2 uv=v_uv+vec2(direction.x/aspect,direction.y)*wave*0.0112*fade;
      vec3 color=texture2D(u_film,filmUV(uv)).rgb;
      if(u_mobile>0.5){
        // Match the approved mock at its default strength (0.8). Render the
        // decoded film once instead of diluting the refraction with another copy.
        color+=vec3(0.22,0.29,0.28)*crest*0.8*fade;
        color-=vec3(0.07,0.09,0.08)*trough*0.8*fade;
        gl_FragColor=vec4(color,1.0);
        return;
      }
      // Neutral lighting keeps the film's hue and stops below channel clipping.
      float light=1.0+(min(crest,1.0)*0.32-trough*0.10)*fade;
      float peak=max(max(color.r,color.g),color.b);
      color*=min(light,max(1.0,0.98/max(peak,0.001)));
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
  let frame = 0, active = false, played = false, started = 0, lastFilmFrame = -1;
  let textureReady = false, near = false, contextLost = false;

  function request() {
    if (!frame && !document.hidden && !contextLost) frame = requestAnimationFrame(render);
  }
  function uploadFrame(mediaTime = video.currentTime) {
    if (!near || video.readyState < 2 || !video.videoWidth || contextLost) return;
    // Both supplied films are 24 fps. Upload only a newly decoded frame.
    const filmFrame = Math.floor(mediaTime * 24 + 0.001);
    if (textureReady && filmFrame === lastFilmFrame) return;
    try {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      lastFilmFrame = filmFrame;
      textureReady = true;
    } catch (_) {
      // Keep the last decoded frame while the video is seeking.
    }
  }
  function stop() {
    if (!active) return;
    active = false;
    canvas.classList.remove('is-active');
    if (!contextLost) gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function render(now) {
    frame = 0;
    if (contextLost) return;
    const sectionRect = section.getBoundingClientRect();
    const title = heading.getBoundingClientRect();
    const middle = title.top + title.height / 2;
    const nextNear = sectionRect.top < innerHeight * 1.5 && sectionRect.bottom > 0;
    if (nextNear && !near) { textureReady = false; lastFilmFrame = -1; }
    near = nextNear;
    const inside = sectionRect.bottom > innerHeight * 0.45 &&
      middle <= innerHeight * 0.72 && middle >= innerHeight * 0.28;
    if (!inside || reducedMotion.matches || document.body.classList.contains('motion-paused') || document.hidden) {
      played = false; stop(); return;
    }
    if (!textureReady && !video.seeking) uploadFrame();
    if (!textureReady || (!active && played)) return;
    const film = canvas.getBoundingClientRect();
    if (!active) { active = true; played = true; started = now; }
    if (now - started >= 4200) { stop(); return; }
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(film.width * ratio));
    const height = Math.max(1, Math.round(film.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.uniform2f(size, width, height);
    gl.uniform2f(filmSize, video.videoWidth, video.videoHeight);
    gl.uniform1f(mobileLocation, innerWidth < 768 ? 1 : 0);
    gl.uniform2f(centerLocation,
      (title.left + title.width / 2 - film.left) / film.width,
      1 - (middle - film.top) / film.height);
    gl.uniform1f(time, (now - started) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!canvas.classList.contains('is-active')) canvas.classList.add('is-active');
    request();
  }
  // Upload on decode, before another scroll seek can start. The refraction and
  // the underlying video then use the same image, including while scrolling.
  function decoded() { uploadFrame(); if (near) request(); }
  if (video.requestVideoFrameCallback) {
    const presented = (_, metadata) => {
      uploadFrame(metadata.mediaTime);
      if (near) request();
      video.requestVideoFrameCallback(presented);
    };
    video.requestVideoFrameCallback(presented);
  }
  video.addEventListener('loadeddata', decoded);
  video.addEventListener('seeked', decoded);
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; played = false; stop(); }
    else request();
  });
  reducedMotion.addEventListener('change', request);
  new MutationObserver(request).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); contextLost = true; stop(); });
  request();
})();
