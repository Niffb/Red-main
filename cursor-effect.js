/**
 * Red AI - Antigravity Cursor Effect (Polished)
 * Particles appear around the cursor with a random, organic layout and wave-like pulsation.
 */

document.addEventListener('DOMContentLoaded', function () {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particlesArray = [];

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Handle window resize
    window.addEventListener('resize', function () {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        init();
    });

    // Mouse interaction
    const mouse = {
        x: null,
        y: null,
        radius: 400 // Significantly increased visibility radius
    };

    window.addEventListener('mousemove', function (event) {
        mouse.x = event.x;
        mouse.y = event.y;
    });

    window.addEventListener('mouseout', function () {
        mouse.x = undefined;
        mouse.y = undefined;
    });

    // Particle Class
    class Particle {
        constructor(x, y, size, color) {
            this.x = x;
            this.y = y;
            this.baseX = x;
            this.baseY = y;
            this.size = size;
            this.baseSize = size;
            this.color = color;
            this.density = (Math.random() * 30) + 1;
            // Random offset for wave phase to make it look more organic
            this.phaseOffset = Math.random() * Math.PI * 2;
        }

        // Draw particle
        draw(opacity) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);

            // Inject opacity into color
            // Assuming color is 'rgba(r, g, b, a)'
            let colorParts = this.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (colorParts) {
                // Use the base alpha from the color definition multiplied by the calculated opacity
                const baseAlpha = colorParts[4] ? parseFloat(colorParts[4]) : 1;
                const finalAlpha = baseAlpha * opacity;
                ctx.fillStyle = `rgba(${colorParts[1]}, ${colorParts[2]}, ${colorParts[3]}, ${finalAlpha})`;
            } else {
                ctx.fillStyle = this.color;
            }
            ctx.fill();
        }

        // Update particle position
        update() {
            // Default: invisible
            let opacity = 0;

            if (mouse.x != undefined && mouse.y != undefined) {
                let dx = mouse.x - this.x;
                let dy = mouse.y - this.y;
                let distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < mouse.radius) {
                    // Calculate opacity based on distance (fade out at edges)
                    // Non-linear fade for a stronger core
                    opacity = 1 - Math.pow(distance / mouse.radius, 1.5);
                    opacity = Math.max(0, opacity);

                    // Wave Effect: Size pulsation based on distance and time
                    const time = Date.now() * 0.004;
                    // Combine radial wave with individual random phase for "shimmering debris" look
                    const wave = Math.sin(distance * 0.03 - time + this.phaseOffset);

                    // Make size variation more dramatic
                    this.size = this.baseSize + (wave * 2);
                    if (this.size < 0.5) this.size = 0.5;

                    // Repulsion/Movement
                    const maxDistance = mouse.radius;
                    const force = (maxDistance - distance) / maxDistance;
                    const directionX = (dx / distance) * force * this.density;
                    const directionY = (dy / distance) * force * this.density;

                    // Move away from mouse, but drag behind slightly
                    this.x = this.baseX - directionX * 1.5;
                    this.y = this.baseY - directionY * 1.5;
                } else {
                    // Reset if out of range
                    this.size = this.baseSize;
                    this.x = this.baseX;
                    this.y = this.baseY;
                }
            }

            // Only draw if visible
            if (opacity > 0.01) {
                this.draw(opacity);
            }
        }
    }

    // Initialize particles
    function init() {
        particlesArray = [];
        // Random distribution instead of grid
        // Density control: Area / pixels per particle
        const numberOfParticles = (canvas.width * canvas.height) / 4000;

        for (let i = 0; i < numberOfParticles; i++) {
            let x = Math.random() * canvas.width;
            let y = Math.random() * canvas.height;

            // Larger particles: 2px to 5px
            let size = (Math.random() * 3) + 2;

            // Red shades with varying base opacity
            const colors = [
                'rgba(220, 38, 38, 0.9)',
                'rgba(239, 68, 68, 0.8)',
                'rgba(185, 28, 28, 0.85)',
                'rgba(252, 165, 165, 0.7)' // Lighter red for contrast
            ];
            let color = colors[Math.floor(Math.random() * colors.length)];

            particlesArray.push(new Particle(x, y, size, color));
        }
    }

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        ctx.clearRect(0, 0, innerWidth, innerHeight);

        for (let i = 0; i < particlesArray.length; i++) {
            particlesArray[i].update();
        }
    }

    init();
    animate();
});
