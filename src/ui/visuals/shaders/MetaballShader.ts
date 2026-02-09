export const MetaballVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const MetaballFragmentShader = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uCameraPos;
  uniform float uCrossfade;
  
  // Audio Uniforms
  uniform float uLowA;
  uniform float uLowB;
  uniform float uHighA;
  uniform float uHighB;
  
  // FX Uniforms
  uniform float uDecimator;
  uniform float uGate;
  uniform float uDub;
  uniform float uCloud;
  uniform float uCloudDensity;
  uniform float uKickImpulse; // Kick impact for organic pulsation
  
  // Mode Selection (0.0 = Organic, 1.0 = Mono/Gallery)
  uniform float uMode;
  
  // Texture Uniforms
  uniform sampler2D uTextureA;
  uniform sampler2D uTextureB;
  uniform sampler2D uSpectrum;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  // Optimized noise function
  float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }
  
  // 3D Noise for clouds
  float random3d(vec3 p) {
      return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
  }

  // SDF Primitives
  float sdSphere(vec3 p, float s) {
    return length(p) - s;
  }
  
  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
  }
  
  float sdTorus(vec3 p, vec2 t) {
      vec2 q = vec2(length(p.xz)-t.x,p.y);
      return length(q)-t.y;
  }
  
  // Domain Operations
  vec3 opTwist(vec3 p, float k) {
      float c = cos(k*p.y);
      float s = sin(k*p.y);
      mat2  m = mat2(c,-s,s,c);
      vec3  q = vec3(m*p.xz,p.y);
      return q;
  }
  
  vec3 opRep(vec3 p, vec3 c) {
      return mod(p+0.5*c,c)-0.5*c;
  }
  
  // Smooth Minimum (Polynomial)
  float smin(float a, float b, float k) {
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
  }
  
  // FBM for Surface Detail
  float fbm(vec3 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 4; i++) {
          value += amplitude * random3d(p);
          p *= 2.0;
          amplitude *= 0.5;
      }
      return value;
  }
  
  // Rotation Matrices
  mat3 rotateY(float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return mat3(c, 0, s, 0, 1, 0, -s, 0, c);
  }
  
  mat3 rotateX(float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return mat3(1, 0, 0, 0, c, -s, 0, s, c);
  }
  
  mat3 rotateZ(float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return mat3(c, -s, 0, s, c, 0, 0, 0, 1);
  }

  // Triplanar Mapping for seamless texturing
  vec3 triplanar(sampler2D tex, vec3 p, vec3 normal, float scale) {
      vec3 blend = pow(abs(normal), vec3(0.75));
      blend /= (blend.x + blend.y + blend.z);
      
      vec2 uvX = p.yz * scale;
      vec2 uvY = p.xz * scale;
      vec2 uvZ = p.xy * scale;
      
      vec3 colX = texture2D(tex, uvX).rgb;
      vec3 colY = texture2D(tex, uvY).rgb;
      vec3 colZ = texture2D(tex, uvZ).rgb;
      
      return colX * blend.x + colY * blend.y + colZ * blend.z;
  }

  // --- GRAND MATHEMATICAL GALLERY FORMS ---
  // Helper to generate shapes by ID (0-19)
  float getGalleryShape(float id, vec3 p) {
      float d = 0.0;
      
      // Basic SDF components
      // CLIPPING FIX: Increased bounds from 1.5 to 5.0 or removed where safe
      
      float r = length(p);
      
      if (id < 0.5) { 
          // 0. EGG (Base)
          p.y *= 0.8; 
          d = length(p) - 1.2;
      } 
      else if (id < 1.5) { 
          // 1. SCHWARZ P (TPMS)
          // cos(x)+cos(y)+cos(z) = 0
          float scale = 3.0;
          float val = cos(p.x*scale) + cos(p.y*scale) + cos(p.z*scale);
          d = max(length(p)-15.0, abs(val)/scale - 0.1); 
      }
      else if (id < 2.5) {
          // 2. NEOVIUS (TPMS)
          // 3(cos(x)+cos(y)+cos(z)) + 4cos(x)cos(y)cos(z) = 0
          float s = 2.5;
          d = 3.0*(cos(p.x*s)+cos(p.y*s)+cos(p.z*s)) + 4.0*cos(p.x*s)*cos(p.y*s)*cos(p.z*s);
          d = max(length(p)-15.0, abs(d)/s - 0.05);
      }
      else if (id < 3.5) {
          // 3. LIDINOID (TPMS Variant)
          // 0.5(sin(2x)cos(y)sin(z) + ...)
          float s = 3.0;
          float val = 0.5*(sin(2.0*p.x*s)*cos(p.y*s)*sin(p.z*s) + 
                           sin(2.0*p.y*s)*cos(p.z*s)*sin(p.x*s) + 
                           sin(2.0*p.z*s)*cos(p.x*s)*sin(p.y*s));
          d = max(length(p)-15.0, abs(val)/s - 0.05);
      }
      else if (id < 4.5) {
          // 4. GYROID (TPMS)
          float s = 5.0;
          float val = dot(sin(p*s), cos(p.zxy*s));
          d = max(length(p)-15.0, abs(val)/s - 0.05);
      }
      else if (id < 5.5) {
          // 5. TORUS KNOT
          // Parametric Torus Twist approximation
          vec3 pK = p;
          float r1 = 1.0, r2 = 0.3;
          // Approximate by twisting a torus domain
          float a = atan(pK.z, pK.x);
          float r = length(pK.xz);
          vec3 pTwist = vec3(r - r1, pK.y, 0.0);
          // Rotate twist based on angle
          float ka = a * 3.0; // 3 loops
          float c = cos(ka), s = sin(ka);
          pTwist.xy = mat2(c,-s,s,c) * pTwist.xy;
          d = length(pTwist) - r2;
      }
      else if (id < 6.5) {
          // 6. TREFOIL KNOT (Thickened Curve)
          // Approximate with twisted torus variant
          vec3 pK = p;
          float r1 = 1.0, r2 = 0.25;
          float a = atan(pK.z, pK.x); 
          // 3/2 twist ratio
          float ka = a * 1.5; 
          vec3 q = vec3(length(pK.xz) - r1, pK.y, 0.0);
          float c = cos(ka), s = sin(ka);
          q.xy = mat2(c,-s,s,c) * q.xy;
          d = length(q) - r2;
      }
      else if (id < 7.5) {
          // 7. MÖBIUS STRIP (Approx)
          // Twisted flat box ring
          vec3 pM = p;
          float a = atan(pM.z, pM.x);
          float r = length(pM.xz);
          vec3 q = vec3(r - 1.2, pM.y, 0.0);
          // Half twist per revolution
          float ka = a * 0.5;
          float c = cos(ka), s = sin(ka);
          q.xy = mat2(c,-s,s,c) * q.xy;
          d = max(abs(q.x)-0.3, abs(q.y)-0.02); // Flat strip
          d = max(d, abs(p.y)-0.8); // Relaxed bounds
      }
      else if (id < 8.5) {
          // 8. KLEIN BOTTLE (Approx/Bulbous)
          // Self-intersecting organic shape
          float s = 1.5;
          float val = (pow(p.x,2.0)+pow(p.y,2.0)+pow(p.z,2.0) + 2.0*p.y - 1.0) * 
                      (pow(p.x*s,2.0)+pow(p.y*s,2.0)-0.1); // Simplified
          d = max(length(p)-15.0, abs(val)*0.1 - 0.05);
      }
      else if (id < 9.5) {
          // 9. ENNEPER SURFACE
          // Previously implemented
          vec3 pE = p;
          float undulate = pE.y - (pow(pE.x,3.0)/3.0 - pE.x + pow(pE.z,3.0)/3.0 - pE.z);
          d = max(length(p)-15.0, abs(undulate)*0.5 - 0.05);
      }
      else if (id < 10.5) {
          // 10. ROMAN SURFACE (Steiner)
          // x^2y^2 + y^2z^2 + z^2x^2 + xyz = 0
          float val = pow(p.x*p.y, 2.0) + pow(p.y*p.z, 2.0) + pow(p.z*p.x, 2.0) + p.x*p.y*p.z;
          d = max(length(p)-15.0, abs(val)*2.0 - 0.02);
      }
      else if (id < 11.5) {
          // 11. KUEN SURFACE (Sharp Horns)
          // Approx by modulated tractroid
          vec3 pK = p;
          float r = 1.0 / cosh(pK.y * 2.0); // Tractroid base
          // Add sharp folds
          r *= (1.0 + 0.3*sin(atan(pK.z,pK.x)*4.0));
          d = length(vec2(length(pK.xz)-r, 0.0)) - 0.02;
          d = max(d, abs(pK.y)-2.5); // Relaxed
      }
      else if (id < 12.5) {
          // 12. BOUR'S MINIMAL SURFACE
          // Spiral planes
          float a = atan(p.z, p.x);
          float r = length(p.xz);
          // Spiral height function
          float h = p.y - a * 0.2; 
          d = max(length(p)-15.0, abs(sin(h*10.0))*0.1 - 0.02);
      }
      else if (id < 13.5) {
          // 13. MANDELBULB (Fractal Iteration)
          vec3 w = p;
          float m = length(w);
          float dz = 1.0;
          float power = 4.0;
          for(int i=0; i<3; i++) { // Very low iter for cheap morph
              float r = length(w);
              float b = power * atan(w.y, w.x); // Phony mandelbulb
              // Simplified bulbous distortion
              w = abs(w) / (r*r) - 0.5;
              dz = 2.0 * r * dz + 1.0;
          }
          d = 0.25 * log(m) * sqrt(m) / dz;
          d = max(length(p)-15.0, d); // Clipping fix
      }
      else if (id < 14.5) {
          // 14. MENGER SPONGE (Box Fractal)
          float s = 1.0;
          vec3 pM = p;
          d = sdBox(pM, vec3(1.0));
          for(int m=0; m<3; m++) {
              vec3 a = mod(pM*s, 2.0)-1.0;
              s *= 3.0;
              vec3 r = 1.0 - 3.0*abs(a);
              float c = max(r.x,max(r.y,r.z)); // Cross
              d = max(d, (c-1.0)/s); // Subtract cross
          }
      }
      else if (id < 15.5) {
          // 15. APOLLONIAN GASKET (Spheres)
          // Simplified sphere packing
          float s = 1.0;
          vec3 q = p;
          d = length(q) - 1.0;
          for(int i=0; i<3; i++) {
               s *= 1.8;
               q = mod(q*s, 2.0) - 1.0;
               float sphere = length(q) - 0.8;
               d = smin(d, sphere/s, 0.1);
          }
          d = max(length(p)-15.0, d);
      }
      else if (id < 16.5) {
          // 16. STRANGE ATTRACTOR (Flow Field)
          // Lorenz-like loops
          vec3 pA = p;
          pA.xz = mat2(cos(pA.y*2.0), -sin(pA.y*2.0), sin(pA.y*2.0), cos(pA.y*2.0)) * pA.xz;
          d = length(vec2(length(pA.xz)-0.8, 0.0)) - 0.1;
      }
      else if (id < 17.5) {
          // 17. PHYLLOTAXIS (Spiky Sphere)
          float a = atan(p.z, p.x);
          float r = length(p.xz);
          // Golden angle spiral
          float spikes = sin(p.y*10.0 + a*5.0) * sin(a*8.0); 
          d = length(p) - (1.0 + spikes*0.2);
      }
      else if (id < 18.5) {
          // 18. VORONOI (Cellular)
          // Sphere roughly cut by planes
          float v = 0.0;
          vec3 q = p * 3.0;
          for(int i=0; i<3; i++) {
             v += sin(dot(q, vec3(1.0, 0.5, 0.2)));
             q = q.zxy * 1.5;
          }
          d = length(p) - (1.0 + v*0.1);
      }
      else if (id < 19.5) {
          // 19. REACTION-DIFFUSION (Noise)
          d = length(p) - 1.0;
          float detail = fbm(p * 4.0 + uTime*0.1);
          d += detail * 0.3; 
      }
      else {
          // 20. SUPERFORMULA / CALABI-YAU (Complex Fold)
          // 6D projection approximation (folding space)
          vec3 q = p;
          q = abs(q);
          float fold = dot(q, vec3(1.0)); // Octahedral fold
          d = length(p) - 1.0;
          d += sin(fold * 10.0) * 0.1;
          d += cos(q.x*20.0)*0.02;
      }
      
      return d;
  }

  // === MAIN SHAPE DEFINITION ===
  float map(vec3 p) {
      float modeBlend = smoothstep(0.3, 0.7, uMode);
      
      // ROTATION: Constant slow rotation for gallery view
      float rotSpeed = 0.2;
      // Audio-Reactive tumbling, weighted by math blend amount.
      if (modeBlend > 0.01) {
          // Drive tumbling by Mids (Vocals/Snare)
          float mids = (uLowA + uLowB + uHighA + uHighB) * 0.25;
          float highs = max(uHighA, uHighB);
          float activity = mids + highs;
          
          // "YUTTARI" (Gentle/Relaxed) Rotation
          // Use a very slow constant base speed to avoid jerks
          // Modulate AMPLITUDE of sway, not Phase speed directly
          float tumbleBase = uTime * 0.1; // Very slow roll (approx 6s per rad)
          float tumbleSway = sin(uTime * 0.5) * activity * 0.2 * modeBlend; // Gentle nod on beat
          float angle = tumbleBase + tumbleSway;
          
          // Add complex 3-axis rotation (Quaternion-like effect)
          p.yz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.yz; // X-axis roll
          p.xy = mat2(cos(angle * 0.7), -sin(angle * 0.7), sin(angle * 0.7), cos(angle * 0.7)) * p.xy; // Z-axis roll
      }
      
      vec3 pRot = rotateY(uTime * rotSpeed) * p;
      pRot = rotateX(sin(uTime * 0.25) * 0.2) * pRot;
      
      // Center with slight drift
      vec3 pCenter = pRot - vec3(0.0, sin(uTime * 0.5)*0.1, 0.0);
      // --- ORGANIC MODE (Enhanced Audio Reactivity) ---
      float lowEnergy = uLowA + uLowB;
      float highEnergy = uHighA + uHighB;
      float totalEnergy = lowEnergy + highEnergy;
      float kickPulse = uKickImpulse * 0.1;
      float breath = lowEnergy * 0.095 + kickPulse;
      float rotAccel = 0.2 + totalEnergy * 0.15;
      float dynamicRotY = uTime * 0.15 * rotAccel;
      float dynamicRotX = sin(uTime * 0.2 * rotAccel) * 0.1;

      vec3 pOrganic = rotateY(dynamicRotY) * (p - vec3(0.0, sin(uTime * 0.5)*0.1, 0.0));
      pOrganic = rotateX(dynamicRotX) * pOrganic;
      float deformA = sin(pOrganic.y * 2.0 + uTime * 1.2) * uLowA * 0.14;
      float deformB = cos(pOrganic.x * 2.4 - uTime * 1.0) * uLowB * 0.14;
      float spikeA = sin(dot(pOrganic, vec3(1.2, 0.9, 0.7)) * 2.0 - uTime * 1.6) * uHighA * 0.05;
      float spikeB = -cos(dot(pOrganic, vec3(0.8, 1.1, 1.0)) * 1.8 + uTime * 1.3) * uHighB * 0.05;
      float deformBlend = mix(deformA + spikeA, deformB + spikeB, uCrossfade);
      float organic1 = sin(pOrganic.x * 1.4 + pOrganic.y * 1.1 + uTime * 0.45) * 0.07;
      float organic2 = cos(pOrganic.y * 2.2 + pOrganic.z * 1.8 + uTime * 0.65) * 0.048;
      float organic3 = sin(pOrganic.z * 2.6 + uTime * 1.4) * 0.012;
      float organicTotal = organic1 + organic2 + organic3;
      if (uKickImpulse > 0.3) {
          float wobble = sin(pOrganic.y * 6.0) * uKickImpulse * 0.06;
          pOrganic.x += wobble;
      }
      float dOrganic = sdSphere(pOrganic, 1.2 + breath) + deformBlend + organicTotal;

      // --- MATH MODE: DYNAMIC CHAOS GALLERY ---
      float bass = max(uLowA, uLowB); 
      float mid = (uLowA + uLowB + uHighA + uHighB) * 0.25;
      float high = max(uHighA, uHighB);
      float totalVol = bass + mid + high;
      float activeTrigger = smoothstep(0.1, 0.4, totalVol);
      float beatTime = uTime * 0.05 + totalVol * 0.25;
      float seed = floor(beatTime);
      float currentId = floor(random(vec2(seed, 0.0)) * 20.0);
      float nextId = floor(random(vec2(seed + 1.0, 0.0)) * 20.0);
      vec3 pMath = pCenter;
      float instability = smoothstep(0.4, 0.8, high);
      if (instability > 0.1) {
          float glitch = sin(pMath.y * 10.0 + uTime * 20.0) * instability * 0.2;
          pMath += vec3(glitch, glitch * 0.5, -glitch);
          if (instability > 0.6) {
               pMath = abs(pMath) - 0.5 * instability;
          }
      }
      float fractTime = fract(beatTime);
      float transition = smoothstep(0.0, 0.8, fractTime);
      float d1 = getGalleryShape(currentId, pMath);
      float d2 = getGalleryShape(nextId, pMath);
      float dActive = mix(d1, d2, transition);
      float dRest = length(pMath) - 1.0;
      float dFinal = mix(dRest, dActive, activeTrigger);
      dFinal -= bass * 0.2;
      if (high > 0.2) {
          float ripple = sin(pMath.y * 50.0 + uTime * 30.0) * 0.005 * high;
          dFinal += ripple;
      }
      float dMath = dFinal * 0.7;

      return mix(dOrganic, dMath, modeBlend);
  }
  
  // Calculate Normal
  vec3 calcNormal(vec3 p) {
      const float h = 0.001; 
      const vec2 k = vec2(1,-1);
      return normalize( k.xyy*map( p + k.xyy*h ) + 
                        k.yyx*map( p + k.yyx*h ) + 
                        k.yxy*map( p + k.yxy*h ) + 
                        k.xxx*map( p + k.xxx*h ) );
  }

  // Normal Perturbation for Plaster
  vec3 perturbNormal(vec3 n, vec3 p, float scale, float strength) {
      float nX = random(p.yz * scale);
      float nY = random(p.xz * scale);
      float nZ = random(p.xy * scale);
      vec3 blend = abs(n);
      blend /= (blend.x + blend.y + blend.z);
      float noise = nX * blend.x + nY * blend.y + nZ * blend.z;
      return normalize(n + vec3(noise) * strength);
  }

  void main() {
    vec3 ro = uCameraPos; 
    vec3 p = vWorldPosition; 
    vec3 rd = normalize(p - ro); 
    
    // FX: DECIMATOR
    float modeBlend = smoothstep(0.3, 0.7, uMode);
    if (uDecimator > 0.1 && modeBlend > 0.01) {
        float steps = 50.0 * (1.1 - uDecimator); 
        vec3 quantized = floor(rd * steps) / steps;
        rd = mix(rd, quantized, modeBlend);
    }


    
    
    float t = 0.0;
    float tMax = 12.0; 
    
    // Raymarch Loop
    for(int i = 0; i < 96; i++) { // Slightly higher for smoother organic convergence
        float d = map(p);

        float hitEps = mix(0.002, 0.01, modeBlend);
        if(d < hitEps) { // Hit
            // Small backstep refinement to reduce contour-like raymarch banding
            p -= rd * d * 0.5;
            vec3 normal = calcNormal(p);
            vec3 col = vec3(0.0);
            
            // Organic shading
            float rotSpeed = 0.2;
            vec3 pRot = rotateY(uTime * rotSpeed) * p;
            pRot = rotateX(sin(uTime * 0.25) * 0.2) * pRot;
            vec3 pCenter = pRot - vec3(0.0, sin(uTime * 0.5)*0.1, 0.0);
            vec3 nRot = rotateY(uTime * rotSpeed) * normal;
            nRot = rotateX(sin(uTime * 0.25) * 0.2) * nRot;
            vec3 lightPosOrg = vec3(2.0, 4.0, 5.0);
            float diffOrg = max(dot(normal, normalize(lightPosOrg - p)), 0.0);
            vec3 texA = triplanar(uTextureA, pCenter, nRot, 0.45);
            vec3 texB = triplanar(uTextureB, pCenter, nRot, 0.45);
            vec3 texColor = mix(texA, texB, uCrossfade);
            float ambient = 0.28;
            vec3 colOrganic = texColor * (ambient + diffOrg * 0.82);

            // Math shading
            float high = max(uHighA, uHighB);
            float bass = max(uLowA, uLowB);
            float grainScale = 120.0 + high * 50.0;
            float grainStr = 0.03 + high * 0.05;
            vec3 detailNormal = perturbNormal(normal, p, grainScale, grainStr);
            float orbitSpeed = 0.005 + high * 0.02;
            float lightAngle = uTime * orbitSpeed;
            vec3 lightPosMath = vec3(cos(lightAngle)*8.0, 6.0 + bass*1.0, sin(lightAngle)*8.0);
            vec3 lightDir = normalize(lightPosMath - p);
            float diffMath = max(dot(detailNormal, lightDir), 0.0);
            vec3 fillLightDir = normalize(vec3(-5.0, 2.0, -5.0));
            float fill = max(dot(detailNormal, fillLightDir), 0.0) * 0.3;
            vec3 baseColor = vec3(0.6, 0.6, 0.62);
            vec3 flashColor = vec3(0.9, 0.9, 0.9);
            vec3 materialColor = mix(baseColor, flashColor, high * 0.8);
            float shadow = smoothstep(0.0, 0.5, diffMath);
            vec3 colMath = materialColor * (0.1 + 0.8 * shadow + fill);
            vec3 halfDir = normalize(lightDir - rd);
            float spec = pow(max(dot(detailNormal, halfDir), 0.0), 16.0);
            colMath += vec3(spec) * 0.1;
            float rim = 1.0 - max(dot(normal, -rd), 0.0);
            colMath += vec3(rim) * 0.15;

            col = mix(colOrganic, colMath, modeBlend);
            
            // FX: SLICER
            if (uGate > 0.1) {
                col *= step(0.5, fract(uTime * 20.0));
            }

            gl_FragColor = vec4(col, 1.0);
            return;
        }
        
        // Ray advance
        p += rd * d;
        t += d;
        if(t > tMax) break;
    }
    
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }
`;
