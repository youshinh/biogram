export const MetaballVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  
  void main() {
    vUv = uv;
    // Standard projection
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const MetaballFragmentShader = `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vWorldPosition;

  uniform float uTime;
  uniform float uCrossfade; // 0.0 - 1.0
  uniform sampler2D uTextureA;
  uniform sampler2D uTextureB;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  
  // Audio Reactivity
  uniform float uLowA;
  uniform float uLowB;
  uniform float uHighA;
  uniform float uHighB;

  uniform vec3 uCameraPos;
  uniform float uMode; // 0: Organic, 1: Wireframe
  uniform sampler2D uSpectrum;
  
  // FX Uniforms
  uniform float uDub;
  uniform float uGate; // 0.0 - 1.0 (Threshold based)
  uniform float uCloud; // 0.0 - 1.0 (Mix)
  uniform float uCloudDensity;
  uniform float uDecimator;

  // --- SDF Functions ---
  
  float smin(float a, float b, float k) {
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
  }
  
  float random3d(vec3 p) {
      return fract(sin(dot(p, vec3(12.9898, 78.233, 45.543))) * 43758.5453);
  }

  // Basic Sphere SDF
  float sdSphere(vec3 p, float s) {
    return length(p) - s;
  }
  
  // Triplanar Mapping for organic textures
  vec3 triplanar(sampler2D tex, vec3 p, vec3 normal, float scale) {
      vec3 blend = abs(normal);
      blend /= dot(blend, vec3(1.0)); // Normalize weights so they sum to 1
      
      vec2 uvX = p.yz * scale;
      vec2 uvY = p.zx * scale;
      vec2 uvZ = p.xy * scale;
      
      vec3 colX = texture2D(tex, uvX).rgb;
      vec3 colY = texture2D(tex, uvY).rgb;
      vec3 colZ = texture2D(tex, uvZ).rgb;
      
      return colX * blend.x + colY * blend.y + colZ * blend.z;
  }

  // The Scene Map
  float map(vec3 p) {
      // Biological Fluctuation (Subtle Breathing & Sway)
      // "Unnoticeable level" -> very low frequency and amplitude
      float breath = sin(uTime * 0.8) * 0.02; 
      float sway = cos(uTime * 0.4) * 0.04;

      vec3 p1 = p - vec3(-2.0 * uCrossfade, sway, 0.0);
      vec3 p2 = p - vec3(2.0 * (1.0 - uCrossfade), -sway, 0.0);
      
      // FX: CLOUD GRAIN (Displacement Noise)
      // Displace surface to look like point cloud / rugged
      float cloudNoise = 0.0;
      if (uCloud > 0.05) {
          float scale = 10.0 * (1.1 - uCloudDensity * 5.0); // Inverted density for more intuitive control
          cloudNoise = (random3d(p * scale) - 0.5) * uCloud * 0.5;
      }
      
      // FX: DUB (Ripple Echo)
      // Create concentric ripples based on distance
      float ripple = 0.0;
      if (uDub > 0.1) {
          ripple = sin(length(p) * 20.0 - uTime * 5.0) * 0.05 * uDub;
      }

      float noiseA = sin(p.y * 5.0 + uTime) * uLowA * 0.2;
      float noiseB = cos(p.x * 5.0 + uTime) * uLowB * 0.2;

      float d1 = sdSphere(p1, 1.0 + breath + (uLowA * 0.5)) + noiseA + cloudNoise + ripple;
      float d2 = sdSphere(p2, 1.0 - breath + (uLowB * 0.5)) + noiseB + cloudNoise + ripple;
      
      return smin(d1, d2, 0.8); // 0.8 = Gooey factor
  }
  
  // Calculate Normal for lighting/texturing
  vec3 calcNormal(vec3 p) {
      const float h = 0.001; 
      const vec2 k = vec2(1,-1);
      return normalize( k.xyy*map( p + k.xyy*h ) + 
                        k.yyx*map( p + k.yyx*h ) + 
                        k.yxy*map( p + k.yxy*h ) + 
                        k.xxx*map( p + k.xxx*h ) );
  }

  void main() {
    // Raymarching Setup
    vec3 ro = uCameraPos; // Camera Position
    vec3 p = vWorldPosition; // Start marching from the surface fragment
    vec3 rd = normalize(p - ro); // Ray Direction: Camera -> Fragment
    
    // FX: DECIMATOR (Pixelate Ray Direction or Position?)
    // Modifying Ray Direction creates a "low res angular resolution" effect
    if (uDecimator > 0.1) {
        float steps = 50.0 * (1.1 - uDecimator); // Lower steps = more pixelated
        rd = floor(rd * steps) / steps;
    }
    
    // Debug: If we see red, the shader is running and fragment position is valid
    // gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; 
    
    float t = 0.0;
    float tMax = 10.0; // Max distance to march inside volume
    
    // Improved Raymarch Loop for WebGL
    for(int i = 0; i < 48; i++) {
        float d = map(p);
        
        // Inverted logic for volume rendering? 
        // No, SDF is Distance to Surface. 
        // If we are OUTSIDE the shape, d > 0.
        // We step forward. If we enter shape, d <= X.
        
        if(d < 0.05) { // Relaxed hit threshold
            // HIT
            vec3 normal = calcNormal(p);
            
            // Texture blend based on Crossfade
            vec3 texA = triplanar(uTextureA, p, normal, 0.5);
            vec3 texB = triplanar(uTextureB, p, normal, 0.5);
            vec3 finalTex = mix(texA, texB, uCrossfade);
            
            // --- Chaos / Glitch Effect ---
            // High frequency audio triggers white noise / "PikaPika"
            float chaosLevel = max(uHighA, uHighB);
            if (chaosLevel > 0.4) {
                 float noise = fract(sin(dot(p.xy + uTime * 10.0, vec2(12.9898,78.233))) * 43758.5453);
                 if (noise > 0.8) {
                     finalTex += vec3(1.0) * chaosLevel; // Flash white
                 }
            }

            // Lighting
            vec3 lightPos = vec3(2.0 + sin(uTime)*2.0, 4.0, 5.0); // Moving light
            vec3 lightDir = normalize(lightPos - p);
            float diff = max(dot(normal, lightDir), 0.0);
            float rim = 1.0 - max(dot(normal, -rd), 0.0);
            
            vec3 col = vec3(0.0);

            if (uMode > 0.5) {
                // --- PARTICLES / SPOTS MODE ---
                // "Grey spots" as requested
                
                // 1. Create 3D Dots pattern
                float scale = 8.0;
                vec3 localP = fract(p * scale);
                float distToCenter = length(localP - 0.5);
                
                // Dot size varies slightly with audio
                float radius = 0.2 + (uLowA + uLowB) * 0.1; 
                float isDot = 1.0 - smoothstep(radius, radius + 0.05, distToCenter);
                
                // Base: Dark Grey
                vec3 baseCol = vec3(0.05);
                
                // Dot: Light Grey
                vec3 dotCol = vec3(0.6);
                
                // SPECTRUM VISUALIZATION (Particles Mode)
                // If we have uSpectrum, map Y position to frequency bin
                // p.y ranges roughly -2 to +2. Map to 0..1
                float yNorm = (p.y + 2.0) / 4.0;
                if (yNorm >= 0.0 && yNorm <= 1.0) {
                     // Sample spectrum at this height
                     float specVal = texture2D(uSpectrum, vec2(yNorm, 0.5)).r;
                     // If spectrum value is high at this height, light up!
                     if (specVal > 0.4) {
                         dotCol = mix(dotCol, vec3(0.1, 1.0, 0.9), (specVal - 0.4) * 2.0); // Cyan glow
                         radius *= 1.5; // Bigger dots
                         isDot = 1.0 - smoothstep(radius, radius + 0.05, distToCenter);
                     }
                }

                // Mix
                col = mix(baseCol, dotCol, isDot);
                
                // Rim Light (Subtle)
                col += vec3(rim) * 0.3;

            } else {
                // --- ORGANIC MODE ---
                vec3 colTex = finalTex * (diff + 0.3); // Ambient
                
                // SPECTRUM REFLECTION (Organic Mode)
                // Map reflection vector to spectrum texture
                vec3 ref = reflect(-rd, normal);
                // Simple planar mapping of reflection vector
                vec2 refUv = ref.xy * 0.5 + 0.5;
                float specRef = texture2D(uSpectrum, refUv).r;
                
                // Add metallic shimmer based on spectrum
                vec3 metalColor = vec3(1.0, 0.8, 0.6); // Gold/Copper
                colTex += metalColor * specRef * 2.0 * rim;

                colTex += vec3(rim) * (uHighA + uHighB) * 0.8;
                col = colTex;
            }
            
            // FX: SLICER / GATE
            // Stutter black/white based on square wave
            if (uGate > 0.1) {
                float sliceSpeed = 20.0; // Hz
                float slicer = step(0.5, fract(uTime * sliceSpeed));
                // Only reduce opacity, don't flash white
                col *= mix(1.0, slicer, uGate); 
            }

            gl_FragColor = vec4(col, 1.0);
            return;
        }
        
        // Safe step
        p += rd * d;
        t += d;
        if(t > tMax) break;
    }
    
    // Miss: Transparent
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }
`;
