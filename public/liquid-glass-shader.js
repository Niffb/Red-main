/**
 * Liquid Glass Shader Implementation
 * tailored for Red AI App
 */

(function () {
    // Wait for DOM to be ready
    function init() {
        const canvas = document.getElementById("liquid-glass-canvas");
        if (!canvas) {
            console.warn("Liquid Glass: Canvas element not found, retrying in 100ms...");
            setTimeout(init, 100);
            return;
        }

        const gl = canvas.getContext("webgl", { antialias: true }) || canvas.getContext("experimental-webgl", { antialias: true });
        if (!gl) {
            console.error("Liquid Glass: WebGL not supported");
            return;
        }

        function resize() {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
        window.addEventListener("resize", resize);
        resize();

        const vertexShaderElement = document.getElementById("vertexShader");
        const fragmentShaderElement = document.getElementById("fragmentShader");

        if (!vertexShaderElement || !fragmentShaderElement) {
            console.warn("Liquid Glass: Shaders not found, retrying...");
            setTimeout(init, 100);
            return;
        }

        const vertexShaderSrc = vertexShaderElement.textContent;
        const fragmentShaderSrc = fragmentShaderElement.textContent;

        function compileShader(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error("Shader compile error:", gl.getShaderInfoLog(shader));
                return null;
            }
            return shader;
        }

        const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSrc);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSrc);

        if (!vertexShader || !fragmentShader) {
            return;
        }

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("Program link error:", gl.getProgramInfoLog(program));
            return;
        }
        gl.useProgram(program);

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            -1, 1,
            1, -1,
            1, 1
        ]), gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        const u_resolution = gl.getUniformLocation(program, "u_resolution");
        const u_count = gl.getUniformLocation(program, "u_count");
        const u_centers = gl.getUniformLocation(program, "u_centers");
        const u_sizes = gl.getUniformLocation(program, "u_sizes");
        const u_radii = gl.getUniformLocation(program, "u_radii");
        const u_dpr = gl.getUniformLocation(program, "u_dpr");

        const background = gl.createTexture();
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = "liquidglass-bg.jpeg";
        image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, background);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.uniform1i(gl.getUniformLocation(program, "u_background"), 0);
            gl.uniform1f(u_dpr, window.devicePixelRatio || 1);
            requestAnimationFrame(draw);
        };

        // Max items matching shader
        const MAX_ITEMS = 10;

        function draw(now) {
            resize(); // Ensure canvas matches window size
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform2f(u_resolution, canvas.width, canvas.height);

            // Find target elements dynamically
            const targets = document.querySelectorAll(".liquid-glass-target");
            const count = Math.min(targets.length, MAX_ITEMS);

            gl.uniform1i(u_count, count);

            const centers = [];
            const sizes = [];
            const radii = [];

            // Y-flip for WebGL (0,0 is bottom-left)
            const height = canvas.height / (window.devicePixelRatio || 1);

            for (let i = 0; i < count; i++) {
                const rect = targets[i].getBoundingClientRect();

                // Center X, Y (flipped Y)
                const cx = rect.left + rect.width / 2;
                const cy = height - (rect.top + rect.height / 2);

                centers.push(cx, cy);
                sizes.push(rect.width, rect.height);

                // Get border radius if possible, or default
                const style = window.getComputedStyle(targets[i]);
                const r = parseFloat(style.borderRadius) || 20.0;
                radii.push(r);
            }

            // Fill remaining with 0
            for (let i = count; i < MAX_ITEMS; i++) {
                centers.push(0, 0);
                sizes.push(0, 0);
                radii.push(0);
            }

            gl.uniform2fv(u_centers, new Float32Array(centers));
            gl.uniform2fv(u_sizes, new Float32Array(sizes));
            gl.uniform1fv(u_radii, new Float32Array(radii));

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, background);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            requestAnimationFrame(draw);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
