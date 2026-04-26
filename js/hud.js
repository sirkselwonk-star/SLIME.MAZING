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

        this._drawDamageFlash(ctx, state, w, h);
        this._drawVignette(ctx, state, w, h);
        this._drawCockpitFrame(ctx, w, h);
        this._drawMinimap(ctx, state, w, h);
        this._drawCompass(ctx, state, w, h);
        this._drawOreCounter(ctx, state, w, h);
        this._drawSpeedometer(ctx, state, w, h);
        this._drawCrosshair(ctx, w, h);
        this._drawHealthBar(ctx, state, w, h);
        this._drawAmmoCounter(ctx, state, w, h);
        this._drawEyesBleedIndicator(ctx, state, w, h);
    }

    _drawVignette(ctx, state, w, h) {
        // Speed-reactive vignette — darkens edges during movement to reduce motion sickness
        const speed = state.speed || 0;
        const maxSpeed = 10;
        // Base vignette always present (subtle), intensifies with speed
        const baseAlpha = 0.25;
        const speedAlpha = Math.min(0.55, baseAlpha + (speed / maxSpeed) * 0.3);

        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(w, h) * 0.55;

        const grad = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(0.7, `rgba(0, 0, 0, ${speedAlpha * 0.3})`);
        grad.addColorStop(1, `rgba(0, 0, 0, ${speedAlpha})`);

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    _drawCockpitFrame(ctx, w, h) {
        // Static cockpit frame — gives the brain a fixed reference to reduce sickness
        const color = 'rgba(74, 222, 128, 0.08)';
        const edgeColor = 'rgba(74, 222, 128, 0.15)';
        const thickness = 2;

        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = thickness;

        // Corner brackets (top-left, top-right, bottom-left, bottom-right)
        const bLen = 40;
        const margin = 60;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(margin, margin + bLen);
        ctx.lineTo(margin, margin);
        ctx.lineTo(margin + bLen, margin);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(w - margin - bLen, margin);
        ctx.lineTo(w - margin, margin);
        ctx.lineTo(w - margin, margin + bLen);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(margin, h - margin - bLen);
        ctx.lineTo(margin, h - margin);
        ctx.lineTo(margin + bLen, h - margin);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(w - margin - bLen, h - margin);
        ctx.lineTo(w - margin, h - margin);
        ctx.lineTo(w - margin, h - margin - bLen);
        ctx.stroke();

        // Subtle top and bottom bars for horizon reference
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 12]);

        // Top bar
        ctx.beginPath();
        ctx.moveTo(margin + bLen + 10, margin);
        ctx.lineTo(w - margin - bLen - 10, margin);
        ctx.stroke();

        // Bottom bar
        ctx.beginPath();
        ctx.moveTo(margin + bLen + 10, h - margin);
        ctx.lineTo(w - margin - bLen - 10, h - margin);
        ctx.stroke();

        ctx.setLineDash([]);
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

        // Enemy positions (red dots, only in visited cells)
        if (state.enemyPositions) {
            for (const ep of state.enemyPositions) {
                const key = `${ep.row},${ep.col}`;
                if (!visitedCells || !visitedCells.has(key)) continue;
                ctx.fillStyle = '#ff2255';
                ctx.shadowColor = '#ff2255';
                ctx.shadowBlur = 4;
                ctx.beginPath();
                ctx.arc(
                    mapX + ep.col * cellW + cellW / 2,
                    mapY + ep.row * cellH + cellH / 2,
                    Math.max(1.5, cellW * 0.35), 0, Math.PI * 2
                );
                ctx.fill();
                ctx.shadowBlur = 0;
            }
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

    _drawHealthBar(ctx, state, w, h) {
        const hp = state.playerHP;
        const maxHP = state.playerMaxHP;
        if (hp === undefined || maxHP === undefined) return;

        const barW = 160;
        const barH = 10;
        const barX = 15;
        const barY = 20;
        const pct = Math.max(0, hp / maxHP);

        // Label
        ctx.fillStyle = pct > 0.3 ? '#4ade80' : '#f87171';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`HP: ${Math.ceil(hp)}`, barX, barY - 5);

        // Bar background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(barX, barY, barW, barH);

        // Bar fill — green to red
        const r = Math.round(255 * (1 - pct));
        const g = Math.round(200 * pct);
        ctx.fillStyle = `rgb(${r}, ${g}, 60)`;
        ctx.fillRect(barX, barY, barW * pct, barH);

        // Border
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
    }

    _drawAmmoCounter(ctx, state, w, h) {
        const { gunAmmo, rocketAmmo } = state;
        if (gunAmmo === undefined) return;

        const x = 15;
        const y = h - 210; // above minimap

        ctx.font = '11px monospace';
        ctx.textAlign = 'left';

        // Gun ammo
        ctx.fillStyle = '#4ade80';
        ctx.fillText(`GUN: ${gunAmmo}`, x, y);

        // Rocket ammo
        ctx.fillStyle = '#fb923c';
        ctx.fillText(`RKT: ${rocketAmmo}`, x, y + 16);
    }

    _drawDamageFlash(ctx, state, w, h) {
        const flash = state.damageFlash;
        if (!flash || flash <= 0) return;

        ctx.fillStyle = `rgba(255, 30, 30, ${flash * 0.3})`;
        ctx.fillRect(0, 0, w, h);
    }

    _drawEyesBleedIndicator(ctx, state, w, h) {
        if (!state.eyesBleedActive) return;

        const text = 'EYES BLEED!';
        const x = w / 2;
        const y = h - 50;

        ctx.save();
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#ff00ff';
        ctx.fillText(text, x, y);

        // Sharper pass
        ctx.shadowBlur = 8;
        ctx.fillText(text, x, y);

        ctx.restore();
    }
}
