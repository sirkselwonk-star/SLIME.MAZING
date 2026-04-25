// hud.js — Minimap, compass, ore counter, game state UI

export class HUD {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
    }

    resize() {
        this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
        this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    draw(state) {
        const ctx = this.ctx;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);

        this._drawMinimap(ctx, state, w, h);
        this._drawCompass(ctx, state, w, h);
        this._drawOreCounter(ctx, state, w, h);
        this._drawSpeedometer(ctx, state, w, h);
        this._drawCrosshair(ctx, w, h);
    }

    _drawMinimap(ctx, state, w, h) {
        const { grid, rows, cols, playerGridPos, startPos, exitPos, visitedCells } = state;
        if (!grid) return;

        const mapSize = Math.min(180, w * 0.2);
        const mapX = 15;
        const mapY = h - mapSize - 15;
        const cellW = mapSize / cols;
        const cellH = mapSize / rows;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mapX - 5, mapY - 5, mapSize + 10, mapSize + 10, 4);
        ctx.fill();
        ctx.stroke();

        // Draw cells
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = grid[r][c];
                if (!cell.inside) continue;

                const cx = mapX + c * cellW;
                const cy = mapY + r * cellH;

                // Fog of war: only show visited cells
                const key = `${r},${c}`;
                if (!visitedCells || !visitedCells.has(key)) {
                    ctx.fillStyle = 'rgba(26, 26, 46, 0.4)';
                    ctx.fillRect(cx, cy, cellW, cellH);
                    continue;
                }

                ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
                ctx.fillRect(cx, cy, cellW, cellH);

                // Draw walls
                ctx.strokeStyle = '#4ade80';
                ctx.lineWidth = 0.5;
                if (cell.walls.N) {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + cellW, cy);
                    ctx.stroke();
                }
                if (cell.walls.S) {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy + cellH);
                    ctx.lineTo(cx + cellW, cy + cellH);
                    ctx.stroke();
                }
                if (cell.walls.W) {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx, cy + cellH);
                    ctx.stroke();
                }
                if (cell.walls.E) {
                    ctx.beginPath();
                    ctx.moveTo(cx + cellW, cy);
                    ctx.lineTo(cx + cellW, cy + cellH);
                    ctx.stroke();
                }
            }
        }

        // Start marker
        if (startPos) {
            ctx.fillStyle = '#22d3ee';
            ctx.beginPath();
            ctx.arc(
                mapX + startPos.col * cellW + cellW / 2,
                mapY + startPos.row * cellH + cellH / 2,
                Math.max(2, cellW * 0.4), 0, Math.PI * 2
            );
            ctx.fill();
        }

        // Exit marker
        if (exitPos) {
            ctx.fillStyle = '#f472b6';
            ctx.beginPath();
            ctx.arc(
                mapX + exitPos.col * cellW + cellW / 2,
                mapY + exitPos.row * cellH + cellH / 2,
                Math.max(2, cellW * 0.4), 0, Math.PI * 2
            );
            ctx.fill();
        }

        // Player position
        if (playerGridPos) {
            ctx.fillStyle = '#4ade80';
            ctx.shadowColor = '#4ade80';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(
                mapX + playerGridPos.col * cellW + cellW / 2,
                mapY + playerGridPos.row * cellH + cellH / 2,
                Math.max(2.5, cellW * 0.5), 0, Math.PI * 2
            );
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Label
        ctx.fillStyle = '#4ade80';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('MAP', mapX, mapY - 10);
    }

    _drawCompass(ctx, state, w, h) {
        const { heading } = state;
        if (heading === undefined) return;

        const cx = w / 2;
        const cy = 30;
        const radius = 20;

        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // North indicator
        const rad = -heading;
        const nx = cx + Math.sin(rad) * (radius - 5);
        const ny = cy - Math.cos(rad) * (radius - 5);

        ctx.fillStyle = '#f472b6';
        ctx.beginPath();
        ctx.arc(nx, ny, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#4ade80';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        const deg = Math.round(((heading * 180 / Math.PI) % 360 + 360) % 360);
        ctx.fillText(`${deg}°`, cx, cy + radius + 14);
    }

    _drawOreCounter(ctx, state, w, h) {
        const { oreCollected, oreTotal } = state;
        if (oreTotal === undefined) return;

        ctx.fillStyle = '#fb923c';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`ORE: ${oreCollected || 0} / ${oreTotal}`, w - 15, 25);

        // Progress bar
        const barW = 120;
        const barH = 6;
        const barX = w - 15 - barW;
        const barY = 32;
        const pct = oreTotal > 0 ? (oreCollected || 0) / oreTotal : 0;

        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.fillStyle = '#fb923c';
        ctx.fillRect(barX, barY, barW * pct, barH);
    }

    _drawSpeedometer(ctx, state, w, h) {
        const { speed } = state;
        if (speed === undefined) return;

        ctx.fillStyle = '#22d3ee';
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`SPD: ${speed.toFixed(1)}`, w - 15, h - 15);
    }

    _drawCrosshair(ctx, w, h) {
        const cx = w / 2;
        const cy = h / 2;
        const size = 12;

        ctx.strokeStyle = 'rgba(74, 222, 128, 0.5)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(cx - size, cy);
        ctx.lineTo(cx - 4, cy);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + 4, cy);
        ctx.lineTo(cx + size, cy);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx, cy - 4);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, cy + 4);
        ctx.lineTo(cx, cy + size);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
        ctx.stroke();
    }
}
