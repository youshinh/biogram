// Gaussian Blur Shader for Post-Processing
// Separable blur: Use horizontal pass, then vertical pass

export const BlurVertexShader = /* glsl */`
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const BlurFragmentShaderH = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float blurAmount;

varying vec2 vUv;

void main() {
    vec4 sum = vec4(0.0);
    float h = blurAmount / resolution.x;
    
    // 9-tap Gaussian kernel
    sum += texture2D(tDiffuse, vec2(vUv.x - 4.0*h, vUv.y)) * 0.0162;
    sum += texture2D(tDiffuse, vec2(vUv.x - 3.0*h, vUv.y)) * 0.0540;
    sum += texture2D(tDiffuse, vec2(vUv.x - 2.0*h, vUv.y)) * 0.1216;
    sum += texture2D(tDiffuse, vec2(vUv.x - 1.0*h, vUv.y)) * 0.1945;
    sum += texture2D(tDiffuse, vec2(vUv.x, vUv.y))         * 0.2270;
    sum += texture2D(tDiffuse, vec2(vUv.x + 1.0*h, vUv.y)) * 0.1945;
    sum += texture2D(tDiffuse, vec2(vUv.x + 2.0*h, vUv.y)) * 0.1216;
    sum += texture2D(tDiffuse, vec2(vUv.x + 3.0*h, vUv.y)) * 0.0540;
    sum += texture2D(tDiffuse, vec2(vUv.x + 4.0*h, vUv.y)) * 0.0162;
    
    gl_FragColor = sum;
}
`;

export const BlurFragmentShaderV = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float blurAmount;

varying vec2 vUv;

void main() {
    vec4 sum = vec4(0.0);
    float v = blurAmount / resolution.y;
    
    // 9-tap Gaussian kernel (vertical)
    sum += texture2D(tDiffuse, vec2(vUv.x, vUv.y - 4.0*v)) * 0.0162;
    sum += texture2D(tDiffuse, vec2(vUv.x, vUv.y - 3.0*v)) * 0.0540;
    sum += texture2D(tDiffuse, vec2(vUv.x, vUv.y - 2.0*v)) * 0.1216;
    sum += texture2D(tDiffuse, vec2(vUv.x, vUv.y - 1.0*v)) * 0.1945;
    sum += texture2D(tDiffuse, vec2(vUv.x, vUv.y))         * 0.2270;
    sum += texture2D(tDiffuse, vec2(vUv.x, vUv.y + 1.0*v)) * 0.1945;
    sum += texture2D(tDiffuse, vec2(vUv.x, vUv.y + 2.0*v)) * 0.1216;
    sum += texture2D(tDiffuse, vec2(vUv.x, vUv.y + 3.0*v)) * 0.0540;
    sum += texture2D(tDiffuse, vec2(vUv.x, vUv.y + 4.0*v)) * 0.0162;
    
    gl_FragColor = sum;
}
`;
