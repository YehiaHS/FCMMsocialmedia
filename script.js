(function () {
    'use strict';

    /* ==================================================================
       CONFIGURATION
       ================================================================== */
    var TOTAL = 11;
    var TRANSITION_MS = 750;
    var CLIP_COLORS = [
        '#7b61ff', '#3a86ff', '#00b4d8', '#2ecc71', '#e91e63',
        '#e040fb', '#ff9f1c', '#8338ec', '#3a86ff', '#00b4d8', '#00a4ff'
    ];
    var CLIP_LABELS = [
        'Title', 'Role', 'Portfolio', 'Open Day', 'TikTok',
        'Posts', 'Pipeline', 'Reflect', 'Skills', 'Forward', 'End'
    ];

    var current = 0;
    var transitioning = false;
    var autoPlaying = false;
    var autoTimer = null;
    var tarotStep = -1;   /* -1 = no card shown; 0,1,2 = card index currently open */
    var mouseX = window.innerWidth / 2;
    var mouseY = window.innerHeight / 2;

    /* ==================================================================
       DOM HELPERS
       ================================================================== */
    function $(sel, ctx) { return (ctx || document).querySelector(sel); }
    function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

    var slides, viewport, playheadEl, timecodeEl, currentNumEl;
    var fakeCursor, cursorRing;
    var particleCanvas, pCtx;
    var viewportGlow;

    /* ==================================================================
       CUSTOM CURSOR
       ================================================================== */
    function initCursor() {
        fakeCursor = $('#fakeCursor');
        cursorRing = $('#cursorRing');
        if (!fakeCursor) return;

        /* Follow mouse smoothly */
        document.addEventListener('mousemove', function (e) {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        /* Smooth interpolation */
        var cx = mouseX, cy = mouseY;
        (function trackCursor() {
            cx += (mouseX - cx) * 0.18;
            cy += (mouseY - cy) * 0.18;
            if (!fakeCursor.classList.contains('auto-moving')) {
                fakeCursor.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
            }
            requestAnimationFrame(trackCursor);
        })();

        /* Click effect */
        document.addEventListener('mousedown', function () {
            fakeCursor.classList.add('clicking');
        });
        document.addEventListener('mouseup', function () {
            setTimeout(function () { fakeCursor.classList.remove('clicking'); }, 250);
        });
    }

    /**
     * Animate cursor to a target element's center, do a click effect,
     * then return to mouse position.
     */
    function animateCursorToClip(targetEl, callback) {
        if (!fakeCursor || !targetEl) { if (callback) callback(); return; }
        var rect = targetEl.getBoundingClientRect();
        var tx = rect.left + rect.width / 2;
        var ty = rect.top + rect.height / 2;

        fakeCursor.classList.add('auto-moving');
        fakeCursor.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';

        setTimeout(function () {
            /* Click flash */
            fakeCursor.classList.add('clicking');

            setTimeout(function () {
                fakeCursor.classList.remove('clicking');
                if (callback) callback();

                /* Return to user mouse pos */
                setTimeout(function () {
                    fakeCursor.style.transform = 'translate(' + mouseX + 'px,' + mouseY + 'px)';
                    setTimeout(function () {
                        fakeCursor.classList.remove('auto-moving');
                    }, 400);
                }, 200);
            }, 300);
        }, 500);
    }

    /* ==================================================================
       PARTICLE BURST SYSTEM
       ================================================================== */
    var particles = [];

    function initParticles() {
        particleCanvas = $('#particle-burst');
        if (!particleCanvas) return;
        pCtx = particleCanvas.getContext('2d');
        resizeParticleCanvas();
        window.addEventListener('resize', resizeParticleCanvas);
        renderParticles();
    }

    function resizeParticleCanvas() {
        if (!particleCanvas) return;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        particleCanvas.width = window.innerWidth * dpr;
        particleCanvas.height = window.innerHeight * dpr;
        particleCanvas.style.width = window.innerWidth + 'px';
        particleCanvas.style.height = window.innerHeight + 'px';
        if (pCtx) pCtx.scale(dpr, dpr);
    }

    function emitBurst(cx, cy, color, count) {
        count = count || 35;
        for (var i = 0; i < count; i++) {
            var angle = Math.random() * Math.PI * 2;
            var speed = Math.random() * 5 + 2;
            var size = Math.random() * 3 + 1;
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: Math.random() * 0.025 + 0.015,
                size: size,
                color: color || 'rgba(0,164,255,1)'
            });
        }
    }

    function renderParticles() {
        if (!pCtx) { requestAnimationFrame(renderParticles); return; }
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        pCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.97;
            p.vy *= 0.97;
            p.vy += 0.06;
            p.life -= p.decay;

            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }

            pCtx.globalAlpha = p.life;
            pCtx.fillStyle = p.color;
            pCtx.beginPath();
            pCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            pCtx.fill();

            /* Trail */
            pCtx.globalAlpha = p.life * 0.3;
            pCtx.beginPath();
            pCtx.arc(p.x - p.vx * 2, p.y - p.vy * 2, p.size * p.life * 0.6, 0, Math.PI * 2);
            pCtx.fill();
        }
        pCtx.globalAlpha = 1;
        requestAnimationFrame(renderParticles);
    }

    /* ==================================================================
       WEBGL BACKGROUND
       ================================================================== */
    var glCanvas = document.getElementById('webgl-bg');
    var gl, glProg, uTime, uRes, uSlide;

    var VERT_SRC = 'attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.,1.);}';

    var FRAG_SRC = [
        'precision mediump float;',
        'uniform float u_time;',
        'uniform vec2 u_res;',
        'uniform float u_slide;',
        '',
        'vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}',
        'vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}',
        'vec3 permute(vec3 x){return mod289(((x*34.)+1.)*x);}',
        'float snoise(vec2 v){',
        '  const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);',
        '  vec2 i=floor(v+dot(v,C.yy));',
        '  vec2 x0=v-i+dot(i,C.xx);',
        '  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);',
        '  vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;',
        '  i=mod289(i);',
        '  vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));',
        '  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);',
        '  m=m*m;m=m*m;',
        '  vec3 x_=2.*fract(p*C.www)-1.;',
        '  vec3 h=abs(x_)-.5;',
        '  vec3 ox=floor(x_+.5);',
        '  vec3 a0=x_-ox;',
        '  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);',
        '  vec3 g;',
        '  g.x=a0.x*x0.x+h.x*x0.y;',
        '  g.yz=a0.yz*x12.xz+h.yz*x12.yw;',
        '  return 130.*dot(m,g);',
        '}',
        '',
        'void main(){',
        '  vec2 uv=gl_FragCoord.xy/u_res;',
        '  float t=u_time*.04;',
        '  float n=0.;',
        '  n+=snoise(uv*1.8+t*.35)*.5;',
        '  n+=snoise(uv*3.5-t*.25)*.25;',
        '  n+=snoise(uv*7.+t*.15)*.125;',
        '  n=n*.5+.5;',
        '',
        '  /* Slide-reactive colour shift */',
        '  float s=u_slide/9.;',
        '  vec3 c1=mix(vec3(.022,.022,.062),vec3(.04,.01,.06),s);',
        '  vec3 c2=mix(vec3(.052,.022,.088),vec3(.015,.04,.08),s);',
        '  vec3 accent=mix(vec3(0.,.40,.65),vec3(.45,.15,.55),s*.8);',
        '',
        '  vec3 col=mix(c1,c2,n);',
        '  col+=accent*pow(max(n-.42,0.)*1.8,3.)*.18;',
        '',
        '  /* Animated light streaks */',
        '  float streak=snoise(vec2(uv.x*2.+t*1.5,uv.y*0.3));',
        '  streak=smoothstep(.55,.7,streak)*0.02;',
        '  col+=accent*streak;',
        '',
        '  /* vignette */',
        '  vec2 vc=uv-.5;',
        '  float vig=1.-dot(vc,vc)*1.8;',
        '  col*=clamp(vig,.28,1.);',
        '',
        '  /* film grain */',
        '  float grain=fract(sin(dot(gl_FragCoord.xy+fract(u_time)*111.,vec2(12.9898,78.233)))*43758.5453);',
        '  col+=(grain-.5)*.02;',
        '',
        '  gl_FragColor=vec4(col,1.);',
        '}'
    ].join('\n');

    function initGL() {
        gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
        if (!gl) return;

        function compile(type, src) {
            var s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error('Shader:', gl.getShaderInfoLog(s));
                return null;
            }
            return s;
        }

        var vs = compile(gl.VERTEX_SHADER, VERT_SRC);
        var fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
        if (!vs || !fs) { gl = null; return; }

        glProg = gl.createProgram();
        gl.attachShader(glProg, vs);
        gl.attachShader(glProg, fs);
        gl.linkProgram(glProg);
        if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) {
            console.error('Link:', gl.getProgramInfoLog(glProg));
            gl = null;
            return;
        }

        gl.useProgram(glProg);

        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        var pos = gl.getAttribLocation(glProg, 'a_pos');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

        uTime = gl.getUniformLocation(glProg, 'u_time');
        uRes = gl.getUniformLocation(glProg, 'u_res');
        uSlide = gl.getUniformLocation(glProg, 'u_slide');
    }

    function resizeGL() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = window.innerWidth;
        var h = window.innerHeight;
        glCanvas.width = w * dpr;
        glCanvas.height = h * dpr;
        glCanvas.style.width = w + 'px';
        glCanvas.style.height = h + 'px';
        if (gl) gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    }

    var glStart = 0;
    var glSlideSmooth = 0;
    function renderGL() {
        if (gl) {
            var now = performance.now() / 1000;
            glSlideSmooth += (current - glSlideSmooth) * 0.05;
            gl.uniform1f(uTime, now - glStart);
            gl.uniform2f(uRes, glCanvas.width, glCanvas.height);
            gl.uniform1f(uSlide, glSlideSmooth);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        requestAnimationFrame(renderGL);
    }

    /* ==================================================================
       SLIDE NAVIGATION WITH DRAG TRANSITIONS + CURSOR
       ================================================================== */
    function goTo(index, skipCursor) {
        if (transitioning || index === current) return;
        if (index < 0 || index >= TOTAL) return;

        var direction = index > current ? 'right' : 'left';
        var targetClipEl = $('.clip[data-index="' + index + '"]');

        if (!skipCursor && targetClipEl) {
            /* Animate cursor to the target clip first, then do the transition */
            transitioning = true;
            animateCursorToClip(targetClipEl, function () {
                performDragTransition(index, direction);
            });
        } else {
            transitioning = true;
            performDragTransition(index, direction);
        }
    }

    function performDragTransition(index, direction) {
        /* Intercept navigation to slide 9 — run Paint transition instead */
        if (index === 10 && current === 9) {
            runPaintTransition();
            return;
        }

        /* Going back from Paint overlay → restore Premiere shell */
        if (current === 10) {
            var overlay = document.getElementById('paintOverlay');
            var shell = document.querySelector('.premiere-shell');
            var fakeCur = document.getElementById('fakeCursor');
            if (overlay && overlay.classList.contains('active')) {
                overlay.classList.remove('active');
                if (shell) shell.style.opacity = '1';
                if (fakeCur) fakeCur.style.display = '';
            }
        }

        var prevSlide = slides[current];
        var nextSlide = slides[index];

        /* Emit particle burst at viewport center */
        var vpRect = viewport.getBoundingClientRect();
        var burstX = vpRect.left + vpRect.width / 2;
        var burstY = vpRect.top + vpRect.height / 2;
        var color = CLIP_COLORS[index] || '#00a4ff';
        emitBurst(burstX, burstY, color, 40);
        emitBurst(burstX + (direction === 'right' ? -80 : 80), burstY, 'rgba(255,255,255,0.8)', 15);

        /* Flash viewport glow */
        if (viewportGlow) {
            viewportGlow.classList.remove('flash');
            void viewportGlow.offsetWidth;
            viewportGlow.classList.add('flash');
        }

        /* Reset anim delays on outgoing */
        $$('.anim-el', prevSlide).forEach(function (el) {
            el.style.transitionDelay = '0ms';
        });

        /* Drag out the current slide */
        prevSlide.classList.remove('active');
        prevSlide.classList.add(direction === 'right' ? 'drag-out-left' : 'drag-out-right');

        /* Bring in the new slide on the very next frame — eliminates the blank-gap stutter */
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                /* Clean outgoing classes — clear ALL inline styles so CSS classes take over again */
                prevSlide.classList.remove('drag-out-left', 'drag-out-right');
                prevSlide.style.opacity = '';
                prevSlide.style.transform = '';
                prevSlide.style.filter = '';
                /* Reset outgoing anim-el delays so they don't bleed into future visits */
                $$('.anim-el', prevSlide).forEach(function (el) {
                    el.style.transitionDelay = '0ms';
                });

                /* Clear any stale inline styles on the incoming slide */
                nextSlide.style.opacity = '';
                nextSlide.style.transform = '';
                nextSlide.style.filter = '';

                /* Set entry delays on anim elements */
                $$('.anim-el', nextSlide).forEach(function (el, i) {
                    el.style.transitionDelay = (i * 90 + 100) + 'ms';
                });

                nextSlide.classList.add('active', direction === 'right' ? 'drag-in-right' : 'drag-in-left');

                current = index;
                updateTimeline();
                updateTimecode();
                if (index === 8) setTimeout(dealTarotCards, 650);

                /* Clean after animation */
                setTimeout(function () {
                    nextSlide.classList.remove('drag-in-left', 'drag-in-right');
                    transitioning = false;
                    /* Reset tarot step whenever we land on / leave slide 7 */
                    tarotStep = -1;
                }, TRANSITION_MS);
            });
        });
    }

    /* Open (or close) a tarot card by index programmatically — bypasses click toggle */
    function openTarotCard(idx) {
        var cards  = document.querySelectorAll('.tc');
        var detail = document.getElementById('tarotDetail');
        if (!cards.length) return;

        if (idx === -1) {
            /* Close all */
            cards.forEach(function (c) { c.classList.remove('selected', 'dimmed'); });
            if (detail) detail.classList.remove('open');
            return;
        }

        var card = cards[idx];
        if (!card) return;

        /* Make sure the card is dealt + flipped so it's visible */
        card.classList.add('dealt', 'flipped');

        /* Deselect everything, dim others, select this one */
        cards.forEach(function (c) {
            c.classList.remove('selected', 'dimmed');
            if (c !== card) c.classList.add('dimmed');
        });
        card.classList.add('selected');

        /* Populate detail panel (same logic as initTarotDeck click handler) */
        var dataIdx = parseInt(card.getAttribute('data-tarot'));
        var data    = TAROT_DATA[dataIdx];
        var accent  = card.getAttribute('data-accent') || '#c9a84c';
        if (data && detail) {
            detail.style.setProperty('--td-accent', accent);
            var tdNum  = document.getElementById('tdNumeral');
            var tdName = document.getElementById('tdName');
            var tdSub  = document.getElementById('tdSub');
            var tdLore = document.getElementById('tdLore');
            var tdList = document.getElementById('tdList');
            if (tdNum)  tdNum.textContent  = data.num;
            if (tdName) tdName.textContent = data.name;
            if (tdSub)  tdSub.textContent  = data.sub;
            if (tdLore) tdLore.textContent = data.lore;
            if (tdList) {
                tdList.innerHTML = '';
                data.skills.forEach(function (s) {
                    var li = document.createElement('li');
                    li.textContent = s;
                    tdList.appendChild(li);
                });
            }
            detail.classList.add('open');
        }
    }

    function next() {
        if (current === 8) {
            var cards = document.querySelectorAll('.tc');
            var total = cards.length;        /* typically 3 */
            if (tarotStep < total - 1) {
                tarotStep++;
                openTarotCard(tarotStep);
                return;
            }
            /* All cards visited — close detail and advance */
            openTarotCard(-1);
            tarotStep = -1;
        }
        goTo(current + 1);
    }
    function prev() {
        if (current === 8) {
            if (tarotStep >= 0) {
                openTarotCard(-1);
                tarotStep = -1;
                return;   /* stay on slide 7 with no card open */
            }
        }
        goTo(current - 1);
    }

    function toggleAutoPlay() {
        autoPlaying = !autoPlaying;
        var btn = $('#playBtn');
        var icon = $('#playIcon');
        if (autoPlaying) {
            btn.classList.add('playing');
            icon.className = 'fas fa-pause';
            autoTimer = setInterval(function () {
                if (current === 8) {
                    var cards = document.querySelectorAll('.tc');
                    if (tarotStep < cards.length - 1) {
                        tarotStep++;
                        openTarotCard(tarotStep);
                        return;
                    }
                    openTarotCard(-1);
                    tarotStep = -1;
                }
                if (current < TOTAL - 1) goTo(current + 1, true);
                else toggleAutoPlay();
            }, 3500);
        } else {
            btn.classList.remove('playing');
            icon.className = 'fas fa-play';
            clearInterval(autoTimer);
            autoTimer = null;
        }
    }

    /* ==================================================================
       TIMELINE
       ================================================================== */
    function buildTimeline() {
        var tracks = $('#timelineTracks');
        var ruler = $('#timelineRuler');

        for (var i = 0; i <= TOTAL; i++) {
            var mark = document.createElement('div');
            mark.className = 'ruler-mark';
            mark.style.left = (i / TOTAL * 100) + '%';
            if (i < TOTAL) {
                var span = document.createElement('span');
                span.textContent = formatTC(i * 3);
                mark.appendChild(span);
            }
            ruler.appendChild(mark);
        }

        /* V1 */
        var v1 = makeTrack('V1');
        CLIP_LABELS.forEach(function (label, i) {
            var clip = document.createElement('div');
            clip.className = 'clip';
            clip.style.background = CLIP_COLORS[i];
            clip.style.left = (i / TOTAL * 100) + '%';
            clip.style.width = (100 / TOTAL - 0.3) + '%';
            clip.textContent = label;
            clip.setAttribute('data-index', String(i));
            clip.addEventListener('click', function () { goTo(i, true); });
            if (i === 0) clip.classList.add('active');
            v1.clips.appendChild(clip);
        });
        tracks.appendChild(v1.row);

        /* V2 */
        var v2 = makeTrack('V2');
        [0, 3, 7, 10].forEach(function (i) {
            var clip = document.createElement('div');
            clip.className = 'clip';
            clip.style.background = 'rgba(234,119,255,0.35)';
            clip.style.left = (i / TOTAL * 100) + '%';
            clip.style.width = (100 / TOTAL - 0.3) + '%';
            clip.textContent = 'FX';
            clip.style.fontSize = '7px';
            clip.style.opacity = '0.45';
            v2.clips.appendChild(clip);
        });
        tracks.appendChild(v2.row);

        /* A1 */
        var a1 = makeTrack('A1');
        var wc = document.createElement('canvas');
        wc.className = 'wave-canvas';
        a1.clips.appendChild(wc);
        tracks.appendChild(a1.row);
        window._waveCanvas = wc;
    }

    function makeTrack(name) {
        var row = document.createElement('div');
        row.className = 'track-row';
        var lbl = document.createElement('div');
        lbl.className = 'track-label';
        lbl.textContent = name;
        var clips = document.createElement('div');
        clips.className = 'track-clips';
        row.appendChild(lbl);
        row.appendChild(clips);
        return { row: row, clips: clips };
    }

    function updateTimeline() {
        playheadEl.style.left = ((current + 0.5) / TOTAL * 100) + '%';
        $$('.clip[data-index]').forEach(function (c) {
            c.classList.toggle('active', parseInt(c.getAttribute('data-index')) === current);
        });
        if (currentNumEl) currentNumEl.textContent = current + 1;
    }

    function updateTimecode() {
        if (timecodeEl) timecodeEl.textContent = formatTC(current * 3);
    }

    function formatTC(sec) {
        var h = String(Math.floor(sec / 3600)).padStart(2, '0');
        var m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
        var s = String(sec % 60).padStart(2, '0');
        return h + ';' + m + ';' + s + ';00';
    }

    /* ==================================================================
       WAVEFORM
       ================================================================== */
    function initWaveform() {
        var canvas = window._waveCanvas;
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var data = [];
        for (var i = 0; i < 220; i++) data.push(Math.random() * 0.8 + 0.1);

        function draw() {
            var parent = canvas.parentElement;
            if (!parent) { requestAnimationFrame(draw); return; }
            var rect = parent.getBoundingClientRect();
            canvas.width = rect.width * 2;
            canvas.height = rect.height * 2;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            var barW = canvas.width / data.length;
            var midY = canvas.height / 2;
            var maxH = canvas.height * 0.34;
            var t = performance.now() / 1000;
            var playPos = (current + 0.5) / TOTAL;

            for (var j = 0; j < data.length; j++) {
                var x = j * barW;
                var normX = j / data.length;
                var amp = data[j] * (0.3 + Math.sin(t * 2 + j * 0.12) * 0.08);
                var h = amp * maxH;
                var alpha = normX < playPos ? 0.55 : 0.18;
                var near = Math.abs(normX - playPos) < 0.02;

                ctx.fillStyle = near ? 'rgba(76,175,80,0.9)' : 'rgba(76,175,80,' + alpha + ')';
                ctx.fillRect(x, midY - h, Math.max(barW - 1, 1), h * 2);
            }
            requestAnimationFrame(draw);
        }
        draw();
    }

    /* ==================================================================
       ADD DECORATIVE LIGHT STREAK
       ================================================================== */
    function addLightStreak() {
        var vp = $('#viewport');
        if (!vp) return;
        var streak = document.createElement('div');
        streak.className = 'light-streak';
        vp.appendChild(streak);
    }

    /* ==================================================================
       EVENTS
       ================================================================== */
    function setupEvents() {
        document.addEventListener('keydown', function (e) {
            switch (e.key) {
                case 'ArrowRight': case 'ArrowDown': e.preventDefault(); next(); break;
                case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); prev(); break;
                case ' ': e.preventDefault(); toggleAutoPlay(); break;
                case 'Home': e.preventDefault(); goTo(0); break;
                case 'End': e.preventDefault(); goTo(TOTAL - 1); break;
            }
        });

        viewport.addEventListener('wheel', function (e) {
            e.preventDefault();
            if (e.deltaY > 0) next(); else prev();
        }, { passive: false });

        var touchY = 0;
        viewport.addEventListener('touchstart', function (e) {
            touchY = e.changedTouches[0].clientY;
        }, { passive: true });
        viewport.addEventListener('touchend', function (e) {
            var dy = e.changedTouches[0].clientY - touchY;
            if (Math.abs(dy) > 40) {
                if (dy < 0) next(); else prev();
            }
        }, { passive: true });

        viewport.addEventListener('click', function (e) {
            var rect = viewport.getBoundingClientRect();
            var x = (e.clientX - rect.left) / rect.width;
            if (x < 0.25) prev();
            else if (x > 0.75) next();
        });

        $('#prevBtn').addEventListener('click', function (e) { e.stopPropagation(); prev(); });
        $('#nextBtn').addEventListener('click', function (e) { e.stopPropagation(); next(); });
        $('#playBtn').addEventListener('click', function (e) { e.stopPropagation(); toggleAutoPlay(); });

        $('#exportBtn').addEventListener('click', exportPPTX);

        window.addEventListener('resize', function () {
            resizeGL();
            resizeParticleCanvas();
        });
    }

    /* ==================================================================
       PPTX EXPORT
       ================================================================== */
    function exportPPTX() {
        if (typeof PptxGenJS === 'undefined') { alert('Export library not loaded.'); return; }

        var pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE';
        pptx.author = 'Yehia Salem';
        pptx.title = 'Industry Placement Portfolio';

        var bg = { color: '0d0d1a' };
        var accent = '00A4FF';
        var tw = 'FFFFFF';
        var tm = '999999';
        var td = '666666';

        function addBg(slide) {
            slide.background = bg;
            slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: 0.04, fill: { color: accent } });
        }

        var s1 = pptx.addSlide();
        addBg(s1);
        s1.addText('BUE \u00b7 FACULTY OF COMMUNICATION & MASS MEDIA', {
            x: 0.5, y: 1.8, w: 12, h: 0.4, fontSize: 10, color: accent, align: 'center', fontFace: 'Arial', bold: true
        });
        s1.addText('YEHIA\nSALEM', {
            x: 0.5, y: 2.5, w: 12, h: 2.4, fontSize: 52, color: tw, align: 'center', fontFace: 'Georgia', bold: true, lineSpacingMultiple: 0.9
        });
        s1.addText('Industry Placement Portfolio', {
            x: 0.5, y: 5, w: 12, h: 0.5, fontSize: 14, color: td, align: 'center', fontFace: 'Arial'
        });
        s1.addText('229916 \u00b7 Industry Pathway', {
            x: 0.5, y: 5.8, w: 12, h: 0.3, fontSize: 10, color: td, align: 'center', fontFace: 'Consolas'
        });

        var s2 = pptx.addSlide();
        addBg(s2);
        s2.addText('01 \u2014 THE ROLE', { x: 0.5, y: 1.2, w: 12, h: 0.4, fontSize: 10, color: accent, fontFace: 'Consolas', align: 'center' });
        s2.addText('FCMM Social Media Team', { x: 0.5, y: 2, w: 12, h: 0.8, fontSize: 34, color: tw, align: 'center', fontFace: 'Georgia', bold: true });
        s2.addText('Video production & content creation for the university\u2019s official social channels.', { x: 2.5, y: 3.1, w: 8, h: 0.5, fontSize: 12, color: tm, align: 'center', fontFace: 'Arial' });
        [{ n: '6+', l: 'WEEKS' }, { n: '40', l: 'HOURS' }, { n: '5+', l: 'VIDEOS' }, { n: '3', l: 'TEAM' }].forEach(function (st, i) {
            var sx = 2.5 + i * 2.2;
            s2.addText(st.n, { x: sx, y: 4.2, w: 2, h: 0.6, fontSize: 26, color: tw, align: 'center', fontFace: 'Consolas', bold: true });
            s2.addText(st.l, { x: sx, y: 4.8, w: 2, h: 0.3, fontSize: 9, color: td, align: 'center', fontFace: 'Arial', bold: true });
        });

        var s3 = pptx.addSlide();
        addBg(s3);
        s3.addText('02 \u2014 PORTFOLIO', { x: 0.5, y: 0.8, w: 12, h: 0.4, fontSize: 10, color: accent, fontFace: 'Consolas', align: 'center' });
        [{ t: 'Open Day Video', d: 'Full campus event coverage' }, { t: 'Discussion Coverage', d: 'IMC & filming discussion edits' }, { t: 'TikTok & Reels', d: 'Trend-driven short-form content' }].forEach(function (c, i) {
            var cx = 0.8 + i * 4;
            s3.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: cx, y: 2, w: 3.6, h: 2.8, rectRadius: 0.1, fill: { color: '1a1a2e' }, line: { color: '2a2a40', width: 0.5 } });
            s3.addText(c.t, { x: cx + 0.3, y: 3.2, w: 3, h: 0.5, fontSize: 14, color: tw, fontFace: 'Georgia', bold: true });
            s3.addText(c.d, { x: cx + 0.3, y: 3.7, w: 3, h: 0.4, fontSize: 10, color: tm, fontFace: 'Arial' });
        });

        var s4 = pptx.addSlide();
        addBg(s4);
        s4.addText('03 \u2014 HERO PROJECT', { x: 0.5, y: 1, w: 12, h: 0.4, fontSize: 10, color: accent, fontFace: 'Consolas', align: 'center' });
        s4.addText('Open Day Video', { x: 0.5, y: 1.8, w: 12, h: 0.8, fontSize: 32, color: tw, align: 'center', fontFace: 'Georgia', bold: true });
        s4.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 3, y: 3, w: 7, h: 2.2, rectRadius: 0.15, fill: { color: '1a1a2e' }, line: { color: accent, width: 1, dashType: 'dash' } });
        s4.addText('[Upload]', { x: 3, y: 3.6, w: 7, h: 0.8, fontSize: 12, color: tm, align: 'center', fontFace: 'Arial', italic: true });
        ['Premiere Pro', '6+ hrs footage', 'Voiceover', 'Captions'].forEach(function (t, i) {
            s4.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 2.2 + i * 2.2, y: 5.6, w: 2, h: 0.35, rectRadius: 0.15, fill: { color: '1a1a2e' }, line: { color: '3a3a5a', width: 0.5 } });
            s4.addText(t, { x: 2.2 + i * 2.2, y: 5.6, w: 2, h: 0.35, fontSize: 9, color: tm, align: 'center', fontFace: 'Arial' });
        });

        var s5 = pptx.addSlide();
        addBg(s5);
        s5.addText('04 \u2014 SHORT-FORM', { x: 0.5, y: 1, w: 12, h: 0.4, fontSize: 10, color: accent, fontFace: 'Consolas', align: 'center' });
        s5.addText('TikTok & Reels', { x: 0.5, y: 1.8, w: 12, h: 0.8, fontSize: 32, color: tw, align: 'center', fontFace: 'Georgia', bold: true });
        s5.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 3, y: 3, w: 7, h: 2.2, rectRadius: 0.15, fill: { color: '1a1a2e' }, line: { color: accent, width: 1, dashType: 'dash' } });
        s5.addText('[Upload]', { x: 3, y: 3.6, w: 7, h: 0.8, fontSize: 12, color: tm, align: 'center', fontFace: 'Arial', italic: true });
        ['CapCut', 'Trend-driven', '3-person team', 'Christmas campaign'].forEach(function (t, i) {
            s5.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 2.2 + i * 2.2, y: 5.6, w: 2, h: 0.35, rectRadius: 0.15, fill: { color: '1a1a2e' }, line: { color: '3a3a5a', width: 0.5 } });
            s5.addText(t, { x: 2.2 + i * 2.2, y: 5.6, w: 2, h: 0.35, fontSize: 9, color: tm, align: 'center', fontFace: 'Arial' });
        });

        var s6 = pptx.addSlide();
        addBg(s6);
        s6.addText('05 \u2014 THE PIPELINE', { x: 0.5, y: 1, w: 12, h: 0.4, fontSize: 10, color: accent, fontFace: 'Consolas', align: 'center' });
        ['Script', 'Film', 'Edit', 'Publish'].forEach(function (step, i) {
            var px = 1.5 + i * 2.8;
            s6.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: px, y: 2.4, w: 2, h: 1.8, rectRadius: 0.1, fill: { color: '1a1a2e' }, line: { color: '3a3a5a', width: 0.5 } });
            s6.addText(step, { x: px, y: 3.4, w: 2, h: 0.5, fontSize: 14, color: tw, align: 'center', fontFace: 'Arial', bold: true });
            if (i < 3) s6.addText('\u2192', { x: px + 2, y: 2.9, w: 0.8, h: 0.8, fontSize: 18, color: td, align: 'center' });
        });
        s6.addText('Trending audio \u00b7 Beat sync \u00b7 Voiceover \u00b7 Captions', { x: 1, y: 4.8, w: 11, h: 0.4, fontSize: 11, color: td, align: 'center', fontFace: 'Arial' });

        var s7 = pptx.addSlide();
        addBg(s7);
        s7.addText('06 \u2014 REFLECTION', { x: 0.5, y: 1.2, w: 12, h: 0.4, fontSize: 10, color: accent, fontFace: 'Consolas', align: 'center' });
        s7.addShape(pptx.shapes.RECTANGLE, { x: 5.8, y: 2.2, w: 1.4, h: 0.04, fill: { color: accent } });
        s7.addText('"The biggest takeaway was Ms. Nadia\u2019s fearless approach \u2014 just press record and figure it out."', { x: 2, y: 2.8, w: 9, h: 1.8, fontSize: 20, color: tw, align: 'center', fontFace: 'Georgia', italic: true, lineSpacingMultiple: 1.5 });
        s7.addText('Learning by doing, not by planning.', { x: 2, y: 4.8, w: 9, h: 0.4, fontSize: 11, color: accent, align: 'center', fontFace: 'Arial', bold: true });

        var s8 = pptx.addSlide();
        addBg(s8);
        s8.addText('07 \u2014 SKILLS', { x: 0.5, y: 0.8, w: 12, h: 0.4, fontSize: 10, color: accent, fontFace: 'Consolas', align: 'center' });
        [{ t: 'Technical', d: 'Premiere Pro \u00b7 CapCut \u00b7 Cameras' }, { t: 'Creative', d: 'Storytelling \u00b7 Editing rhythm \u00b7 Pacing' }, { t: 'Leadership', d: 'Team coordination \u00b7 Workflow design' }, { t: 'Professional', d: 'Consent \u00b7 Diplomacy \u00b7 Problem-solving' }].forEach(function (sk, i) {
            var col = i % 2; var row = Math.floor(i / 2);
            var sx = 2.5 + col * 4.5; var sy = 2 + row * 2;
            s8.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: sx, y: sy, w: 4, h: 1.5, rectRadius: 0.1, fill: { color: '1a1a2e' }, line: { color: '2a2a40', width: 0.5 } });
            s8.addText(sk.t, { x: sx + 0.4, y: sy + 0.3, w: 3.2, h: 0.4, fontSize: 14, color: tw, fontFace: 'Arial', bold: true });
            s8.addText(sk.d, { x: sx + 0.4, y: sy + 0.8, w: 3.2, h: 0.4, fontSize: 10, color: tm, fontFace: 'Arial' });
        });

        var s9 = pptx.addSlide();
        addBg(s9);
        s9.addText('08 \u2014 LOOKING FORWARD', { x: 0.5, y: 1.2, w: 12, h: 0.4, fontSize: 10, color: accent, fontFace: 'Consolas', align: 'center' });
        ['Advanced colour grading & motion graphics', 'Building a freelance editing portfolio', 'Merging data analytics with creative production'].forEach(function (item, i) {
            var fy = 2.5 + i * 1.3;
            s9.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 2.5, y: fy, w: 8, h: 0.9, rectRadius: 0.1, fill: { color: '1a1a2e' }, line: { color: '2a2a40', width: 0.5 } });
            s9.addText('\u2192  ' + item, { x: 2.8, y: fy, w: 7.5, h: 0.9, fontSize: 13, color: tw, fontFace: 'Arial', valign: 'middle' });
        });

        var s10 = pptx.addSlide();
        addBg(s10);
        s10.addText('THANK YOU', { x: 0.5, y: 2, w: 12, h: 1.2, fontSize: 44, color: tw, align: 'center', fontFace: 'Georgia', bold: true });
        s10.addText('@cmm.bue  \u00b7  bue.edu.eg', { x: 0.5, y: 3.8, w: 12, h: 0.5, fontSize: 14, color: tm, align: 'center', fontFace: 'Arial' });
        s10.addText('Yehia Salem \u00b7 229916', { x: 0.5, y: 4.8, w: 12, h: 0.4, fontSize: 10, color: td, align: 'center', fontFace: 'Consolas' });

        pptx.writeFile({ fileName: 'Yehia_Salem_Portfolio.pptx' });
    }

    /* ==================================================================
       INIT
       ================================================================== */
    document.addEventListener('DOMContentLoaded', function () {
        slides = $$('.slide');
        viewport = $('#viewport');
        playheadEl = $('#playhead');
        timecodeEl = $('#timecode');
        currentNumEl = $('#currentNum');
        viewportGlow = $('#viewportGlow');

        /* Position glow inside monitor-viewport */
        var mv = $('.monitor-viewport');
        if (mv && viewportGlow) {
            mv.style.position = 'relative';
            mv.appendChild(viewportGlow);
        }

        /* Stagger initial slide entry */
        $$('.anim-el', slides[0]).forEach(function (el, i) {
            el.style.transitionDelay = (i * 100 + 400) + 'ms';
        });

        glStart = performance.now() / 1000;
        initGL();
        resizeGL();
        renderGL();
        initCursor();
        initParticles();
        addLightStreak();
        buildTimeline();
        initWaveform();
        setupEvents();
        updateTimeline();
        updateTimecode();
        initReelCarousel();
        initIgCarousel();
        initTarotDeck();
        initSocialParallax();
        initHandwriteSvg();

        /* ---- Run the Win11 preloader sequence ---- */
        runPreloader();
    });

    /* ==================================================================
       WINDOWS 11 PRELOADER SEQUENCE
       ================================================================== */
    function runPreloader() {
        var preloader     = document.getElementById('preloader');
        var pcursor       = document.getElementById('preloaderCursor');
        var prIcon        = document.getElementById('prIcon');
        var prSplash      = document.getElementById('prSplash');
        var splashStatus  = document.getElementById('prSplashStatus');
        var splashBar     = document.getElementById('prSplashBarFill');
        var splashFile    = document.getElementById('prSplashFile');
        var taskbarPr     = document.getElementById('taskbarPr');
        var taskbarTime   = document.getElementById('taskbarTime');
        var taskbarDate   = document.getElementById('taskbarDate');
        var shell         = document.querySelector('.premiere-shell');
        var fakeCursor    = document.getElementById('fakeCursor');

        if (!preloader) { if (shell) shell.classList.add('ready'); return; }

        /* Set taskbar clock */
        var now = new Date();
        if (taskbarTime) taskbarTime.textContent = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
        if (taskbarDate) taskbarDate.textContent = now.getDate().toString().padStart(2,'0') + '/' + (now.getMonth()+1).toString().padStart(2,'0') + '/' + now.getFullYear();

        /* Hide main presentation initially */
        if (shell) shell.style.opacity = '0';
        if (fakeCursor) fakeCursor.style.display = 'none';

        /* ------ Asset Preloading ------ */
        var allImages = Array.prototype.slice.call(document.querySelectorAll('img[loading="lazy"]'));
        var totalAssets = allImages.length || 1;
        var loadedAssets = 0;
        var assetsReady = false;

        var statusMessages = [
            'Loading media cache…',
            'Indexing footage…',
            'Reading project file…',
            'Loading effects plugins…',
            'Conforming audio…',
            'Building peak files…',
            'Linking media…',
            'Preparing timeline…',
            'Optimizing playback engine…',
            'Initializing Mercury Playback…'
        ];

        function updateProgress(pct) {
            if (splashBar) splashBar.style.width = Math.min(pct, 100) + '%';
            var msgIdx = Math.min(Math.floor(pct / 10), statusMessages.length - 1);
            if (splashStatus) splashStatus.textContent = statusMessages[msgIdx];
        }

        /* Start preloading all lazy images */
        function preloadAssets() {
            allImages.forEach(function (img) {
                /* Force load by removing lazy and setting a new Image */
                img.removeAttribute('loading');
                var preImg = new Image();
                preImg.onload = preImg.onerror = function () {
                    loadedAssets++;
                    updateProgress((loadedAssets / totalAssets) * 100);
                    if (loadedAssets >= totalAssets) {
                        assetsReady = true;
                    }
                };
                preImg.src = img.src;
            });
            /* Fallback: if no images or all cached */
            if (allImages.length === 0) { assetsReady = true; }
        }

        /* ------ Cursor Animation Sequence ------ */
        function moveCursorTo(el, offsetX, offsetY, cb) {
            var rect = el.getBoundingClientRect();
            var targetX = rect.left + (offsetX || rect.width / 2);
            var targetY = rect.top + (offsetY || rect.height / 2);
            pcursor.classList.add('moving');
            pcursor.style.left = targetX + 'px';
            pcursor.style.top = targetY + 'px';
            setTimeout(cb, 650);
        }

        function clickAnim(cb) {
            pcursor.classList.add('clicking');
            setTimeout(function () {
                pcursor.classList.remove('clicking');
                if (cb) cb();
            }, 250);
        }

        /* Sequence steps */
        var sequence = [
            /* 0 — Small pause on the desktop (400ms) */
            function (next) { setTimeout(next, 400); },

            /* 1 — Move cursor to Premiere icon */
            function (next) { moveCursorTo(prIcon, null, null, next); },

            /* 2 — Highlight icon */
            function (next) { prIcon.classList.add('highlight'); setTimeout(next, 200); },

            /* 3 — Double-click */
            function (next) {
                clickAnim(function () {
                    setTimeout(function () {
                        clickAnim(next);
                    }, 150);
                });
            },

            /* 4 — Start preloading & show splash */
            function (next) {
                preloadAssets();
                prIcon.classList.remove('highlight');
                prSplash.classList.add('visible');
                if (taskbarPr) { taskbarPr.style.opacity = '1'; taskbarPr.classList.add('active'); }
                /* Move cursor away from splash */
                pcursor.classList.add('moving');
                pcursor.style.left = '70%';
                pcursor.style.top = '75%';
                setTimeout(next, 500);
            },

            /* 5 — Wait for assets to load (with a minimum 1.2s for effect) */
            function (next) {
                var minTime = 1200;
                var start = Date.now();
                function check() {
                    var elapsed = Date.now() - start;
                    /* Simulate progress if assets are quick */
                    if (!assetsReady) {
                        var simPct = Math.min((elapsed / 2500) * 80, 80);
                        updateProgress(Math.max(simPct, (loadedAssets / totalAssets) * 100));
                    }
                    if (assetsReady && elapsed >= minTime) {
                        updateProgress(100);
                        if (splashStatus) splashStatus.textContent = 'Ready';
                        setTimeout(next, 300);
                    } else {
                        requestAnimationFrame(check);
                    }
                }
                check();
            },

            /* 6 — Fullscreen the splash → transition to presentation */
            function (next) {
                /* Hide cursor for the transition */
                pcursor.style.opacity = '0';

                prSplash.classList.add('fullscreening');

                setTimeout(function () {
                    /* Show the actual presentation behind */
                    if (shell) { shell.style.opacity = '1'; shell.classList.add('ready'); }
                    /* Start hiding the preloader */
                    preloader.classList.add('done');
                    setTimeout(function () {
                        /* Show main cursor, remove preloader from DOM */
                        if (fakeCursor) fakeCursor.style.display = '';
                        preloader.style.display = 'none';
                        /* Activate first slide animations again */
                        var s0 = document.querySelector('.slide[data-index="0"]');
                        if (s0) {
                            s0.classList.remove('active');
                            void s0.offsetWidth;
                            s0.classList.add('active');
                        }
                    }, 400);
                }, 500);
            }
        ];

        /* Run the sequence */
        var step = 0;
        function runStep() {
            if (step < sequence.length) {
                sequence[step](function () {
                    step++;
                    runStep();
                });
            }
        }
        runStep();
    }

    /* ==================================================================
       MS PAINT TRANSITION (Slide 8 → 9)
       ================================================================== */
    function runPaintTransition() {
        var overlay       = document.getElementById('paintOverlay');
        var pcursor       = document.getElementById('paintCursor');
        var paintIcon     = document.getElementById('paintDesktopPaintIcon');
        var paintWindow   = document.getElementById('paintWindow');
        var paintCanvas   = document.getElementById('paintCanvas');
        var shell         = document.querySelector('.premiere-shell');
        var fakeCursor    = document.getElementById('fakeCursor');
        var timeEl        = document.getElementById('paintTaskbarTime');
        var dateEl        = document.getElementById('paintTaskbarDate');

        if (!overlay) { transitioning = false; return; }

        /* Set clock */
        var now = new Date();
        if (timeEl) timeEl.textContent = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
        if (dateEl) dateEl.textContent = now.getDate().toString().padStart(2,'0') + '/' + (now.getMonth()+1).toString().padStart(2,'0') + '/' + now.getFullYear();

        /* Hide main cursor */
        if (fakeCursor) fakeCursor.style.display = 'none';

        /* Position overlay cursor center and make sure it is visible */
        pcursor.style.opacity = '1';
        pcursor.style.left = '50%';
        pcursor.style.top = '50%';
        pcursor.classList.remove('moving', 'clicking');

        function moveTo(el, cb) {
            var rect = el.getBoundingClientRect();
            pcursor.classList.add('moving');
            pcursor.style.left = (rect.left + rect.width / 2) + 'px';
            pcursor.style.top = (rect.top + rect.height / 2) + 'px';
            setTimeout(cb, 650);
        }

        function click(cb) {
            pcursor.classList.add('clicking');
            setTimeout(function () {
                pcursor.classList.remove('clicking');
                if (cb) cb();
            }, 200);
        }

        var seq = [
            /* 0 — Show overlay (Premiere "closes" → desktop visible) */
            function (next) {
                overlay.classList.add('active');
                if (shell) shell.style.opacity = '0';
                setTimeout(next, 700);
            },

            /* 1 — Move cursor to Paint icon */
            function (next) { moveTo(paintIcon, next); },

            /* 2 — Highlight & double-click Paint */
            function (next) {
                paintIcon.classList.add('highlight');
                click(function () {
                    setTimeout(function () { click(next); }, 120);
                });
            },

            /* 3 — Open Paint window */
            function (next) {
                paintIcon.classList.remove('highlight');
                paintWindow.classList.add('visible');
                setTimeout(next, 500);
            },

            /* 4 — Maximize Paint window; keep cursor visible, move into canvas area */
            function (next) {
                paintWindow.classList.add('maximized');
                /* Keep cursor visible — move it to center of canvas to simulate drawing */
                pcursor.classList.add('moving');
                pcursor.style.top  = '55%';
                pcursor.style.left = '50%';
                setTimeout(next, 700);
            },

            /* 5 — Render Thank You content inside Paint canvas */
            function (next) {
                /* Build HTML: doodles in corners only, SVG-stroke hw-wrap title, links, name */
                var html = '<div class="paint-thank-you" id="paintThankYou">';

                /* BUE Campus silhouette — hand-drawn Paint-style outline */
                html += '<div class="paint-ty-doodles" id="paintDoodles">';
                html += '<svg class="paint-bue-campus" viewBox="0 0 800 420" preserveAspectRatio="xMidYMax meet">';
                /* Main building silhouette — sketchy single path */
                html += '<path class="bue-outline" d="';
                /* Ground / steps */
                html += 'M 30 390 L 30 370 L 100 370 ';
                /* Left wing */
                html += 'L 100 260 L 120 260 L 120 240 L 140 240 L 140 200 L 180 200 L 180 240 ';
                /* Left tower */
                html += 'L 220 240 L 220 170 L 240 170 L 240 140 L 260 140 L 260 110 ';
                /* Left side of dome base */
                html += 'L 280 110 L 290 100 ';
                /* Dome arc */
                html += 'Q 310 30, 400 20 Q 490 30, 510 100 ';
                /* Dome finial */
                html += 'M 396 20 L 396 6 L 404 6 L 404 20 ';
                /* Right side of dome */
                html += 'M 510 100 L 520 110 L 540 110 ';
                /* Right tower */
                html += 'L 540 140 L 560 140 L 560 170 L 580 170 L 580 240 ';
                /* Right wing */
                html += 'L 620 240 L 620 200 L 660 200 L 660 240 L 680 240 L 680 260 L 700 260 L 700 370 ';
                /* Ground right */
                html += 'L 770 370 L 770 390';
                html += '" fill="none" stroke="#d32f2f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
                /* Three arches under dome */
                html += '<path class="bue-outline" d="M 310 240 Q 340 190, 370 240 M 370 240 Q 400 190, 430 240 M 430 240 Q 460 190, 490 240" fill="none" stroke="#d32f2f" stroke-width="2" stroke-linecap="round"/>';
                /* Three circular windows */
                html += '<circle class="bue-outline" cx="325" cy="145" r="16" fill="none" stroke="#1565c0" stroke-width="2"/>';
                html += '<circle class="bue-outline" cx="400" cy="130" r="18" fill="none" stroke="#1565c0" stroke-width="2"/>';
                html += '<circle class="bue-outline" cx="475" cy="145" r="16" fill="none" stroke="#1565c0" stroke-width="2"/>';
                /* Steps at entrance */
                html += '<path class="bue-outline" d="M 330 370 L 330 350 L 350 350 L 350 330 L 450 330 L 450 350 L 470 350 L 470 370" fill="none" stroke="#d32f2f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
                /* Left palm tree */
                html += '<path class="bue-outline" d="M 160 370 L 160 260 M 140 260 Q 160 230, 180 256 M 138 264 Q 155 240, 148 210 M 160 260 Q 175 226, 185 210" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round"/>';
                /* Right palm tree */
                html += '<path class="bue-outline" d="M 640 370 L 640 260 M 620 260 Q 640 230, 660 256 M 618 264 Q 635 240, 628 210 M 640 260 Q 655 226, 665 210" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round"/>';
                /* Lamp posts */
                html += '<path class="bue-outline" d="M 210 370 L 210 310 L 205 305 L 215 305 L 210 310" fill="none" stroke="#555" stroke-width="1.5" stroke-linecap="round"/>';
                html += '<path class="bue-outline" d="M 590 370 L 590 310 L 585 305 L 595 305 L 590 310" fill="none" stroke="#555" stroke-width="1.5" stroke-linecap="round"/>';
                /* Columns under arches */
                html += '<path class="bue-outline" d="M 310 240 L 310 330 M 370 240 L 370 330 M 430 240 L 430 330 M 490 240 L 490 330" fill="none" stroke="#d32f2f" stroke-width="1.8" stroke-linecap="round"/>';
                /* UK flag (tiny sketch on left pillar) */
                html += '<path class="bue-outline" d="M 300 175 L 300 150 L 320 150 L 320 175 L 300 175 M 300 150 L 320 175 M 320 150 L 300 175 M 310 150 L 310 175 M 300 162 L 320 162" fill="none" stroke="#1565c0" stroke-width="1" stroke-linecap="round"/>';
                html += '</svg>';
                html += '</div>';

                /* SVG-stroke title — hidden solid text + SVG outline drawn on top */
                html += '<h1 class="paint-ty-title" id="paintTyTitle">Thank You!</h1>';

                /* Wavy underline scribble */
                html += '<svg class="paint-ty-scribble" id="paintScribble" viewBox="0 0 240 20"><path d="M10 10 Q60 2 120 10 Q180 18 230 10" fill="none" stroke="#e53935" stroke-width="3" stroke-linecap="round" stroke-dasharray="240" stroke-dashoffset="240"><animate attributeName="stroke-dashoffset" to="0" dur="0.8s" begin="0.3s" fill="freeze"/></path></svg>';

                html += '<div class="paint-ty-links" id="paintLinks">';
                html += '<a href="https://drive.google.com/drive/folders/168FfG7xOKQQrY6Mei916_ZTk9QFS35Qo?usp=sharing" target="_blank" class="paint-ty-link"><i class="fas fa-folder-open"></i> Google Drive Portfolio</a>';
                html += '<a href="https://www.tiktok.com/@cmm.bue" target="_blank" class="paint-ty-link"><i class="fab fa-tiktok"></i> @cmm.bue</a>';
                html += '<a href="https://www.instagram.com/cmm.bue/" target="_blank" class="paint-ty-link"><i class="fab fa-instagram"></i> cmm.bue</a>';
                html += '<a href="https://bue.edu.eg" target="_blank" class="paint-ty-link"><i class="fas fa-globe"></i> bue.edu.eg</a>';
                html += '</div>';
                html += '<p class="paint-ty-name" id="paintName">Yehia Salem · 229916</p>';
                html += '</div>';
                paintCanvas.innerHTML = html;

                /* --- Animate title in with a slight delay, then trigger cursor --- */
                requestAnimationFrame(function () {
                    /* Small delay so browser has painted the canvas before we read layout */
                    setTimeout(function () {
                        var title = document.getElementById('paintTyTitle');
                        if (title) title.classList.add('visible');

                        /* Move cursor as if drawing */
                        pcursor.classList.add('moving');
                        pcursor.style.top  = '42%';
                        pcursor.style.left = '36%';
                        setTimeout(function () {
                            pcursor.style.top  = '42%';
                            pcursor.style.left = '60%';
                        }, 600);
                        setTimeout(function () { pcursor.style.opacity = '0'; }, 2400);
                    }, 80);

                    /* Show container + doodles */
                    var ty      = document.getElementById('paintThankYou');
                    var doodles = document.getElementById('paintDoodles');
                    var scribble = document.getElementById('paintScribble');
                    var links   = document.getElementById('paintLinks');
                    var name    = document.getElementById('paintName');
                    if (ty) ty.classList.add('visible');
                    setTimeout(function () {
                        if (doodles) {
                            /* Measure each outline path/circle and set --bue-len for stroke draw */
                            doodles.querySelectorAll('.bue-outline').forEach(function (el) {
                                var len;
                                if (el.tagName === 'circle') {
                                    var r = parseFloat(el.getAttribute('r')) || 0;
                                    len = 2 * Math.PI * r;
                                } else {
                                    len = el.getTotalLength ? el.getTotalLength() : 2000;
                                }
                                el.style.setProperty('--bue-len', len);
                            });
                            doodles.classList.add('visible');
                        }
                        if (scribble) scribble.classList.add('visible');
                    }, 400);
                    setTimeout(function () { if (links) links.classList.add('visible'); }, 2800);
                    setTimeout(function () { if (name)  name.classList.add('visible');  }, 3200);
                });

                /* Update internal slide state */
                slides[current].classList.remove('active');
                slides[current].style.opacity = '';
                current = 10;
                updateTimeline();
                updateTimecode();
                transitioning = false;
            }
        ];

        var step = 0;
        function runStep() {
            if (step < seq.length) {
                seq[step](function () { step++; runStep(); });
            }
        }
        runStep();
    }

    /* ==================================================================
       REEL CAROUSEL
       ================================================================== */
    /* ==================================================================
       TAROT DECK (Slide 7)
       ================================================================== */
    var TAROT_DATA = [
        {
            num: 'VII', name: 'THE ARTIFICER', sub: 'Technical Skills',
            lore: 'Precision crafted through hours in the edit suite.',
            skills: [
                'Adobe Premiere Pro — multi-track editing & colour grade',
                'CapCut — trend-driven short-form assembly',
                'DSLR & mirrorless — exposure, focus, framing',
                'Audio sync, j-cuts, l-cuts, beat matching',
                'Export pipelines for social platforms'
            ]
        },
        {
            num: 'III', name: 'THE ARTIST', sub: 'Creative Skills',
            lore: 'Storytelling is the art of making every frame count.',
            skills: [
                'Narrative structure: hook, build, resolve',
                'Beat-sync editing for emotional impact',
                'Trend identification for viral short-form',
                'Thumbnail & caption copywriting',
                'Visual rhythm and pacing judgment'
            ]
        },
        {
            num: 'XI', name: 'THE COMMANDER', sub: 'Leadership Skills',
            lore: 'A strong crew needs a steady hand at the helm.',
            skills: [
                'Led a 3-person on-location production crew',
                'Scheduled shoots around campus availability',
                'Delegated roles: camera, sound, direction',
                'Managed post-production handoffs & deadlines',
                'Designed repeatable content workflows'
            ]
        },
        {
            num: 'XV', name: 'THE DIPLOMAT', sub: 'Professional Skills',
            lore: 'Real-world media demands more than technical skill.',
            skills: [
                'Navigated institutional filming permissions',
                'Obtained informed consent from all subjects',
                'Diplomatic communication with faculty & students',
                'On-location problem-solving under time pressure',
                'Met broadcast-quality delivery standards'
            ]
        }
    ];

    function dealTarotCards() {
        var cards = document.querySelectorAll('.tc');
        var hand  = document.getElementById('tarotHand');
        var deckVis = document.getElementById('tarotDeckVis');
        var detail = document.getElementById('tarotDetail');
        if (!cards.length || !hand) return;

        /* Reset */
        cards.forEach(function (c) {
            c.classList.remove('dealt', 'flipped', 'selected', 'dimmed');
            c.style.transitionDelay = '0s';
        });
        if (detail) detail.classList.remove('open');
        if (deckVis) deckVis.classList.remove('gone');
        hand.classList.remove('resting', 'dealing');
        void hand.offsetWidth; /* reflow */

        /* Start deal animation on hand */
        hand.classList.add('dealing');

        /* Stagger cards: dealt → then flipped */
        cards.forEach(function (card, i) {
            var dealDelay = 350 + i * 380;
            setTimeout(function () {
                card.classList.add('dealt');
            }, dealDelay);
            setTimeout(function () {
                card.classList.add('flipped');
            }, dealDelay + 420);
        });

        /* Hide deck stubs after last card deals */
        setTimeout(function () {
            if (deckVis) deckVis.classList.add('gone');
        }, 350 + 4 * 380);

        /* Hand retreats */
        setTimeout(function () {
            hand.classList.add('resting');
        }, 3500);
    }

    function initTarotDeck() {
        document.querySelectorAll('.tc').forEach(function (card) {
            /* Apply accent CSS variable from data attribute */
            var accent = card.getAttribute('data-accent') || '#c9a84c';
            card.style.setProperty('--tc-accent', accent);

            card.addEventListener('click', function () {
                var idx = parseInt(card.getAttribute('data-tarot'));
                var detail  = document.getElementById('tarotDetail');
                var tdNum   = document.getElementById('tdNumeral');
                var tdName  = document.getElementById('tdName');
                var tdSub   = document.getElementById('tdSub');
                var tdLore  = document.getElementById('tdLore');
                var tdList  = document.getElementById('tdList');

                /* Deselect if clicking the same card */
                if (card.classList.contains('selected')) {
                    card.classList.remove('selected');
                    document.querySelectorAll('.tc.dimmed').forEach(function (c) { c.classList.remove('dimmed'); });
                    if (detail) detail.classList.remove('open');
                    return;
                }

                /* Select this card, dim others */
                document.querySelectorAll('.tc').forEach(function (c) {
                    c.classList.remove('selected', 'dimmed');
                    if (c !== card) c.classList.add('dimmed');
                });
                card.classList.add('selected');

                /* Populate detail panel */
                var data = TAROT_DATA[idx];
                if (data && detail) {
                    detail.style.setProperty('--td-accent', accent);
                    if (tdNum)  tdNum.textContent  = data.num;
                    if (tdName) tdName.textContent = data.name;
                    if (tdSub)  tdSub.textContent  = data.sub;
                    if (tdLore) tdLore.textContent = data.lore;
                    if (tdList) {
                        tdList.innerHTML = '';
                        data.skills.forEach(function (s) {
                            var li = document.createElement('li');
                            li.textContent = s;
                            tdList.appendChild(li);
                        });
                    }
                    detail.classList.add('open');
                }
            });
        });

        /* Close button */
        var closeBtn = document.getElementById('tdClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                document.getElementById('tarotDetail').classList.remove('open');
                document.querySelectorAll('.tc').forEach(function (c) {
                    c.classList.remove('selected', 'dimmed');
                });
            });
        }
    }

    /* ==================================================================
       SOCIAL PARALLAX AUTO-SCROLL (Slide 1)
       ================================================================== */
    /* ==================================================================\n       HANDWRITE SVG STROKE (Slide 9)\n       ================================================================== */
    function initHandwriteSvg() {
        var hwText = document.getElementById('hwText');
        var hwSvg  = document.getElementById('hwSvg');
        var hwWrap = document.getElementById('hwWrap');
        if (!hwText || !hwSvg || !hwWrap) return;

        /* Wait a frame so font is loaded and text has dimensions */
        requestAnimationFrame(function () {
            var w = hwWrap.offsetWidth;
            var h = hwWrap.offsetHeight;
            if (!w || !h) return;

            hwSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
            hwSvg.setAttribute('width', w);
            hwSvg.setAttribute('height', h);

            var style = getComputedStyle(hwText);
            var fontSize = parseFloat(style.fontSize);

            var svgText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            svgText.setAttribute('x', '0');
            svgText.setAttribute('y', String(fontSize * 0.82));
            svgText.setAttribute('font-size', String(fontSize));
            svgText.textContent = 'Thank You!';
            hwSvg.appendChild(svgText);

            /* Measure path length for dash animation */
            var len = svgText.getComputedTextLength() * 3.2;
            svgText.style.setProperty('--dash-len', String(Math.ceil(len)));
            hwSvg.style.setProperty('--dash-len', String(Math.ceil(len)));
        });
    }

    function initSocialParallax() {
        var tracks = [
            { el: document.getElementById('spTrackL'), speed: 0.35, y: 0 },
            { el: document.getElementById('spTrackR'), speed: 0.25, y: 0 }
        ];

        /* Duplicate inner content for seamless loop */
        tracks.forEach(function (t) {
            if (!t.el) return;
            var inner = t.el.querySelector('.sp-scroll-inner');
            if (!inner) return;
            var clone = inner.cloneNode(true);
            clone.classList.add('sp-scroll-clone');
            t.el.appendChild(clone);
            t.inner = inner;
            t.clone = clone;
            t.singleH = inner.scrollHeight;
        });

        var spAnimId = null;

        function tick() {
            tracks.forEach(function (t) {
                if (!t.inner || !t.singleH) return;
                t.y -= t.speed;
                if (Math.abs(t.y) >= t.singleH + 10) {
                    t.y = 0;
                }
                t.inner.style.transform = 'translateY(' + t.y + 'px)';
                if (t.clone) t.clone.style.transform = 'translateY(' + t.y + 'px)';
            });
            spAnimId = requestAnimationFrame(tick);
        }

        /* Only run when slide 1 is active */
        var observer = new MutationObserver(function () {
            var slide1 = document.querySelector('.slide[data-index="1"]');
            if (!slide1) return;
            var isActive = slide1.classList.contains('active') ||
                           slide1.classList.contains('drag-in-left') ||
                           slide1.classList.contains('drag-in-right');
            if (isActive && !spAnimId) {
                spAnimId = requestAnimationFrame(tick);
            } else if (!isActive && spAnimId) {
                cancelAnimationFrame(spAnimId);
                spAnimId = null;
            }
        });

        var slide1 = document.querySelector('.slide[data-index="1"]');
        if (slide1) {
            observer.observe(slide1, { attributes: true, attributeFilter: ['class'] });
            /* Start immediately if already active */
            if (slide1.classList.contains('active')) {
                spAnimId = requestAnimationFrame(tick);
            }
        }
    }

    function initReelCarousel() {
        var track = document.getElementById('reelTrack');
        var prevBtn = document.getElementById('reelPrev');
        var nextBtn = document.getElementById('reelNext');
        var dots = document.querySelectorAll('.reel-dot');
        if (!track) return;
        var total = track.children.length;
        var idx = 0;

        function goTo(n) {
            idx = (n + total) % total;
            track.style.transform = 'translateX(-' + (idx * 100) + '%)';
            dots.forEach(function (d, i) {
                d.classList.toggle('active', i === idx);
            });
        }

        prevBtn && prevBtn.addEventListener('click', function () { goTo(idx - 1); });
        nextBtn && nextBtn.addEventListener('click', function () { goTo(idx + 1); });
        dots.forEach(function (d) {
            d.addEventListener('click', function () { goTo(parseInt(d.getAttribute('data-reel'))); });
        });
    }

    /* ==================================================================
       INSTAGRAM POST CAROUSEL (Slide 5)
       ================================================================== */
    function initIgCarousel() {
        var track   = document.getElementById('igPostTrack');
        var prevBtn = document.getElementById('igPrev');
        var nextBtn = document.getElementById('igNext');
        var dots    = document.querySelectorAll('.ig-dot');
        if (!track) return;
        var total = track.children.length;
        var idx = 0;

        function goTo(n) {
            idx = (n + total) % total;
            track.style.transform = 'translateX(-' + (idx * 100) + '%)';
            dots.forEach(function (d, i) {
                d.classList.toggle('active', i === idx);
            });
        }

        if (prevBtn) prevBtn.addEventListener('click', function (e) { e.stopPropagation(); goTo(idx - 1); });
        if (nextBtn) nextBtn.addEventListener('click', function (e) { e.stopPropagation(); goTo(idx + 1); });
        dots.forEach(function (d) {
            d.addEventListener('click', function (e) { e.stopPropagation(); goTo(parseInt(d.getAttribute('data-ig'))); });
        });

        /* Swipe support */
        var startX = 0;
        track.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
        track.addEventListener('touchend', function (e) {
            var dx = e.changedTouches[0].clientX - startX;
            if (Math.abs(dx) > 40) goTo(idx + (dx < 0 ? 1 : -1));
        });
    }

})();
