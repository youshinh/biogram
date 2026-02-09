export const SweepLineTransitionVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const SweepLineTransitionFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform float uProgress;
  uniform float uDirection;

  varying vec2 vUv;

  void main() {
    float p = clamp(uProgress, 0.0, 1.0);
    float sweepX = (uDirection < 0.5) ? p : (1.0 - p);

    vec3 originalColor = texture2D(tDiffuse, vUv).rgb;
    vec3 lineColor = texture2D(tDiffuse, vec2(sweepX, vUv.y)).rgb;
    // Soft side mask to avoid a hard visible seam line.
    float edgeSoftness = 0.02;
    float sideMask = (uDirection < 0.5)
      ? (1.0 - smoothstep(sweepX - edgeSoftness, sweepX + edgeSoftness, vUv.x))
      : smoothstep(sweepX - edgeSoftness, sweepX + edgeSoftness, vUv.x);
    vec3 color = mix(originalColor, lineColor, sideMask);

    gl_FragColor = vec4(color, 1.0);
  }
`;
