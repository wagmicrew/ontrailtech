/**
 * WebGL Fluid Simulation Engine
 * Port of Pavel Dobryakov's WebGL fluid experiment (GPU Gems Ch.38).
 * Solves Navier-Stokes for incompressible flow on the GPU.
 * Zero dependencies — pure WebGL.
 */

export interface FluidConfig {
  textureDownsample: number;
  densityDissipation: number;
  velocityDissipation: number;
  pressureDissipation: number;
  pressureIterations: number;
  curl: number;
  splatRadius: number;
}

export const defaultConfig: FluidConfig = {
  textureDownsample: 1,
  densityDissipation: 0.98,
  velocityDissipation: 0.99,
  pressureDissipation: 0.8,
  pressureIterations: 25,
  curl: 30,
  splatRadius: 0.005,
};

export interface Splat {
  x: number; y: number;
  dx: number; dy: number;
  color: [number, number, number];
}

// ─── GLSL sources ───

const VERT = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv, vL, vR, vT, vB;
uniform vec2 texelSize;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const SPLAT_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main() {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 s = exp(-dot(p,p) / radius) * color;
  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + s, 1.0);
}`;

const ADVECTION_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity, uSource;
uniform vec2 texelSize;
uniform float dt, dissipation;
void main() {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  gl_FragColor = dissipation * texture2D(uSource, coord);
  gl_FragColor.a = 1.0;
}`;

const DIVERGENCE_FRAG = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const CURL_FRAG = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const VORTICITY_FRAG = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity, uCurl;
uniform float curl, dt;
void main() {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  gl_FragColor = vec4(texture2D(uVelocity, vUv).xy + force * dt, 0.0, 1.0);
}`;

const PRESSURE_FRAG = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uPressure, uDivergence;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float div = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT_FRAG = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uPressure, uVelocity;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 vel = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
  gl_FragColor = vec4(vel, 0.0, 1.0);
}`;

const CLEAR_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
void main() { gl_FragColor = value * texture2D(uTexture, vUv); }`;

const DISPLAY_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;
void main() { gl_FragColor = texture2D(uTexture, vUv); }`;

// ─── GL helpers ───

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile error');
  return shader;
}

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
  bind: () => void;
}

function createProgram(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string): Program {
  const program = gl.createProgram()!;
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(program);
  if (!gl.getLinkParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? 'Program link error');

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name)!;
  }

  return {
    program,
    uniforms,
    bind() { gl.useProgram(program); },
  };
}

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  texId: number;
}

interface DoubleFBO {
  read: FBO;
  write: FBO;
  swap(): void;
}

function createFBO(gl: WebGLRenderingContext, texId: number, w: number, h: number, internalFormat: number, format: number, type: number, filter: number): FBO {
  gl.activeTexture(gl.TEXTURE0 + texId);
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT);

  return { texture, fbo, texId };
}

function createDoubleFBO(gl: WebGLRenderingContext, texId: number, w: number, h: number, internalFormat: number, format: number, type: number, filter: number): DoubleFBO {
  let fbo1 = createFBO(gl, texId, w, h, internalFormat, format, type, filter);
  let fbo2 = createFBO(gl, texId + 1, w, h, internalFormat, format, type, filter);
  return {
    get read() { return fbo1; },
    get write() { return fbo2; },
    swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t; },
  };
}

// ─── Main FluidSimulation class ───

export class FluidSimulation {
  private gl: WebGLRenderingContext;
  private config: FluidConfig;
  private programs: Record<string, Program>;
  private velocity!: DoubleFBO;
  private density!: DoubleFBO;
  private pressure!: DoubleFBO;
  private divergenceFBO!: FBO;
  private curlFBO!: FBO;
  private blit: () => void;
  private width = 0;
  private height = 0;
  private texWidth = 0;
  private texHeight = 0;
  private splatQueue: Splat[] = [];
  private lastTime = Date.now();

  constructor(canvas: HTMLCanvasElement, config: Partial<FluidConfig> = {}) {
    this.config = { ...defaultConfig, ...config };

    const gl = canvas.getContext('webgl', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    // Enable float textures
    gl.getExtension('OES_texture_half_float');
    gl.getExtension('OES_texture_half_float_linear');

    // Compile all programs
    this.programs = {
      splat: createProgram(gl, VERT, SPLAT_FRAG),
      advection: createProgram(gl, VERT, ADVECTION_FRAG),
      divergence: createProgram(gl, VERT, DIVERGENCE_FRAG),
      curl: createProgram(gl, VERT, CURL_FRAG),
      vorticity: createProgram(gl, VERT, VORTICITY_FRAG),
      pressure: createProgram(gl, VERT, PRESSURE_FRAG),
      gradient: createProgram(gl, VERT, GRADIENT_FRAG),
      clear: createProgram(gl, VERT, CLEAR_FRAG),
      display: createProgram(gl, VERT, DISPLAY_FRAG),
    };

    // Full-screen quad
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    this.blit = () => { gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0); };

    this.resize(canvas.width, canvas.height);
  }

  resize(w: number, h: number) {
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;

    const gl = this.gl;
    const ds = this.config.textureDownsample;
    this.texWidth = w >> ds;
    this.texHeight = h >> ds;

    if (this.texWidth < 2) this.texWidth = 2;
    if (this.texHeight < 2) this.texHeight = 2;

    const halfFloat = gl.getExtension('OES_texture_half_float');
    const type = halfFloat ? halfFloat.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
    const filter = gl.LINEAR;

    this.density = createDoubleFBO(gl, 0, this.texWidth, this.texHeight, gl.RGBA, gl.RGBA, type, filter);
    this.velocity = createDoubleFBO(gl, 2, this.texWidth, this.texHeight, gl.RGBA, gl.RGBA, type, filter);
    this.pressure = createDoubleFBO(gl, 4, this.texWidth, this.texHeight, gl.RGBA, gl.RGBA, type, filter);
    this.divergenceFBO = createFBO(gl, 6, this.texWidth, this.texHeight, gl.RGBA, gl.RGBA, type, filter);
    this.curlFBO = createFBO(gl, 7, this.texWidth, this.texHeight, gl.RGBA, gl.RGBA, type, filter);
  }

  addSplat(splat: Splat) {
    this.splatQueue.push(splat);
  }

  addRandomSplats(count: number) {
    for (let i = 0; i < count; i++) {
      this.splatQueue.push({
        x: Math.random(),
        y: Math.random(),
        dx: (Math.random() - 0.5) * 1000,
        dy: (Math.random() - 0.5) * 1000,
        color: [Math.random() + 0.2, Math.random() + 0.2, Math.random() + 0.2],
      });
    }
  }

  update() {
    const gl = this.gl;
    const cfg = this.config;
    const now = Date.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.016);
    this.lastTime = now;

    const tw = this.texWidth;
    const th = this.texHeight;
    const texel = [1.0 / tw, 1.0 / th] as const;

    // Process splat queue
    for (const s of this.splatQueue) {
      this.applySplat(this.velocity, s.x, s.y, s.dx, s.dy, [s.dx, s.dy, 0]);
      this.applySplat(this.density, s.x, s.y, s.dx, s.dy, s.color);
    }
    this.splatQueue = [];

    // Curl
    const curlProg = this.programs.curl;
    curlProg.bind();
    gl.uniform2f(curlProg.uniforms.texelSize, texel[0], texel[1]);
    gl.uniform1i(curlProg.uniforms.uVelocity, this.velocity.read.texId);
    this.renderTo(this.curlFBO);

    // Vorticity
    const vortProg = this.programs.vorticity;
    vortProg.bind();
    gl.uniform2f(vortProg.uniforms.texelSize, texel[0], texel[1]);
    gl.uniform1i(vortProg.uniforms.uVelocity, this.velocity.read.texId);
    gl.uniform1i(vortProg.uniforms.uCurl, this.curlFBO.texId);
    gl.uniform1f(vortProg.uniforms.curl, cfg.curl);
    gl.uniform1f(vortProg.uniforms.dt, dt);
    this.renderTo(this.velocity.write);
    this.velocity.swap();

    // Divergence
    const divProg = this.programs.divergence;
    divProg.bind();
    gl.uniform2f(divProg.uniforms.texelSize, texel[0], texel[1]);
    gl.uniform1i(divProg.uniforms.uVelocity, this.velocity.read.texId);
    this.renderTo(this.divergenceFBO);

    // Clear pressure
    const clearProg = this.programs.clear;
    clearProg.bind();
    gl.uniform1i(clearProg.uniforms.uTexture, this.pressure.read.texId);
    gl.uniform1f(clearProg.uniforms.value, cfg.pressureDissipation);
    this.renderTo(this.pressure.write);
    this.pressure.swap();

    // Pressure solve
    const presProg = this.programs.pressure;
    presProg.bind();
    gl.uniform2f(presProg.uniforms.texelSize, texel[0], texel[1]);
    gl.uniform1i(presProg.uniforms.uDivergence, this.divergenceFBO.texId);
    for (let i = 0; i < cfg.pressureIterations; i++) {
      gl.uniform1i(presProg.uniforms.uPressure, this.pressure.read.texId);
      this.renderTo(this.pressure.write);
      this.pressure.swap();
    }

    // Gradient subtract
    const gradProg = this.programs.gradient;
    gradProg.bind();
    gl.uniform2f(gradProg.uniforms.texelSize, texel[0], texel[1]);
    gl.uniform1i(gradProg.uniforms.uPressure, this.pressure.read.texId);
    gl.uniform1i(gradProg.uniforms.uVelocity, this.velocity.read.texId);
    this.renderTo(this.velocity.write);
    this.velocity.swap();

    // Advect velocity
    const advProg = this.programs.advection;
    advProg.bind();
    gl.uniform2f(advProg.uniforms.texelSize, texel[0], texel[1]);
    gl.uniform1i(advProg.uniforms.uVelocity, this.velocity.read.texId);
    gl.uniform1i(advProg.uniforms.uSource, this.velocity.read.texId);
    gl.uniform1f(advProg.uniforms.dt, dt);
    gl.uniform1f(advProg.uniforms.dissipation, cfg.velocityDissipation);
    this.renderTo(this.velocity.write);
    this.velocity.swap();

    // Advect density
    gl.uniform1i(advProg.uniforms.uSource, this.density.read.texId);
    gl.uniform1f(advProg.uniforms.dissipation, cfg.densityDissipation);
    this.renderTo(this.density.write);
    this.density.swap();

    // Display to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    const dispProg = this.programs.display;
    dispProg.bind();
    gl.uniform1i(dispProg.uniforms.uTexture, this.density.read.texId);
    this.blit();
  }

  private applySplat(target: DoubleFBO, x: number, y: number, dx: number, dy: number, color: number[]) {
    const gl = this.gl;
    const prog = this.programs.splat;
    prog.bind();
    gl.uniform1i(prog.uniforms.uTarget, target.read.texId);
    gl.uniform1f(prog.uniforms.aspectRatio, this.width / this.height);
    gl.uniform2f(prog.uniforms.point, x, 1.0 - y);
    gl.uniform3f(prog.uniforms.color, color[0], color[1], color[2]);
    gl.uniform1f(prog.uniforms.radius, this.config.splatRadius);
    this.renderTo(target.write);
    target.swap();
  }

  private renderTo(target: FBO) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, this.texWidth, this.texHeight);
    this.blit();
  }

  destroy() {
    // WebGL context will be lost when canvas is removed from DOM
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
