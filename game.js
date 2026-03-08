const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");


const GAME_STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, GAME_OVER: 3, VICTORY: 4, OUTRO: 5 };
const STORAGE_KEYS = { highScore: "moonPatrolHighScore", settings: "moonPatrolSettings" };
const BASE_W = 800;
const BASE_H = 400;
const GROUND_Y = 280;

const LEVELS = [
    { name: "SECTOR 1", theme: "ON THE MOON",     targetScore: 250, boss: true, bossCount: 1, spawnMinions: false, midboss: 0 },
    { name: "SECTOR 2", theme: "ALIEN TERRITORY", targetScore: 450, boss: true, bossCount: 1, spawnMinions: true,  midboss: 0 },
    { name: "SECTOR 3", theme: "CAT-ASTROPHE",    targetScore: 650, boss: true, bossCount: 1, spawnMinions: false, midboss: 2 }
];

const world = {
    state: GAME_STATE.MENU,
    playTick: 0,
    gameTime: 0,
    score: 0,
    difficulty: 1,
    targetDifficulty: 1,
    levelIndex: 0,
    breather: 0,
    sectorClear: 0,
    highScore: 0,
    settings: { volume: 70, aimSensitivity: 100, controlMode: "manual" },
    slowTimer: 0,
    shake: 0,
    damageFlash: 0,
    tutorial: 900,
    bossSpawned: -1,
    bossesSpawnedThisSector: 0,
    bossesKilledThisSector: 0,
    sectorScore: 0,
    outroTick: 0,
    finishLineX: 0,
    sectorAnnounce: 0    // countdown for big sector intro banner
};

const input = {
    keys: {}, prev: {},
    mouseX: BASE_W / 2, mouseY: BASE_H / 2,
    clicked: false,
    // --- MOBILE CONTROLS ---
    mobileJump: false,       // true while jump button held
    mobileShooting: false,   // true while shoot button held
    mobileAimX: 1,           // analog stick normalised X
    mobileAimY: 0,           // analog stick normalised Y
    mobileAimActive: false   // true while finger is on analog stick
};

const player = {
    x: 100,
    y: GROUND_Y,
    w: 40,
    h: 25,
    dy: 0,
    gravity: 0.35,
    jumpForce: -14,
    moveSpeed: 3.8,
    onGround: true,
    coyote: 0,
    coyoteMax: 8,
    jumpsMax: 1,
    jumpsLeft: 1,
    health: 4,
    healthMax: 5,
    invincible: 0,
    shield: 0,
    rapid: 0,
    inc: 0,
    bullets: [],
    lastShot: 0,
    aimX: 1,
    aimY: 0
};

let obstacles = [];
let enemies = [];
let enemyShots = [];
let powerUps = [];
let particles = [];
let stars = { far: [], mid: [], near: [] };

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function pressed(code) { return Boolean(input.keys[code]); }
function tapped(code) { return Boolean(input.keys[code] && !input.prev[code]); }
function syncPrev() { input.prev = { ...input.keys }; }

function loadData() {
    const hs = localStorage.getItem(STORAGE_KEYS.highScore);
    if (hs) world.highScore = Number(hs) || 0;
    const ss = localStorage.getItem(STORAGE_KEYS.settings);
    if (ss) {
        try {
            const s = JSON.parse(ss);
            world.settings.volume = clamp(Number(s.volume) || 70, 0, 100);
            world.settings.aimSensitivity = clamp(Number(s.aimSensitivity) || 100, 40, 160);
        } catch {}
    }
    // Mobile-only: always auto mode — no manual mode
    world.settings.controlMode = "auto";
}

function saveData() {
    if (Math.floor(world.score) > world.highScore) {
        world.highScore = Math.floor(world.score);
        localStorage.setItem(STORAGE_KEYS.highScore, String(world.highScore));
    }
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(world.settings));
}

function toggleControlMode() {
    world.settings.controlMode = world.settings.controlMode === "manual" ? "auto" : "manual";
    saveData();
}

function normalizeControlMode() {
    world.settings.controlMode = world.settings.controlMode === "auto" ? "auto" : "manual";
}

function manualHorizontalInput() {
    const left = pressed("ArrowLeft") || pressed("KeyA");
    const right = pressed("ArrowRight") || pressed("KeyD");
    return (right ? 1 : 0) - (left ? 1 : 0);
}

function worldDirection() {
    normalizeControlMode();
    if (world.settings.controlMode === "auto") return 1;
    return manualHorizontalInput();
}

function shouldAdvanceWorld() {
    return worldDirection() !== 0;
}

function resetRun() {
    world.playTick = 0;
    world.gameTime = 0;
    world.score = 0;
    world.difficulty = 1;
    world.targetDifficulty = 1;
    world.levelIndex = 0;
    world.breather = 0;
    world.sectorClear = 0;
    world.slowTimer = 0;
    world.shake = 0;
    world.damageFlash = 0;
    world.tutorial = 900;
    world.bossSpawned = -1;
    world.bossesSpawnedThisSector = 0;
    world.bossesKilledThisSector = 0;
    world.sectorScore = 0;
    world.sectorAnnounce = 180; // show Sector 1 banner on game start

    player.x = Math.floor(BASE_W / 2 - player.w / 2);
    player.y = GROUND_Y;
    player.dy = 0;
    player.onGround = true;
    player.coyote = 0;
    player.jumpsMax = 1;
    player.jumpsLeft = 1;
    player.health = 4;
    player.invincible = 0;
    player.shield = 0;
    player.rapid = 0;
    player.inc = 0;
    player.bullets = [];
    player.lastShot = 0;

    obstacles = [];
    enemies = [];
    enemyShots = [];
    powerUps = [];
    particles = [];
}

function startGame() { resetRun(); world.state = GAME_STATE.PLAYING; }
function endGame() { world.state = GAME_STATE.GAME_OVER; saveData(); }
function winGame() {
    if (world.state === GAME_STATE.OUTRO || world.state === GAME_STATE.VICTORY) return;
    world.state = GAME_STATE.OUTRO;
    world.outroTick = 0;
    world.finishLineX = canvas.width + 400;
    obstacles.length = 0;
    enemies.length = 0;
    enemyShots.length = 0;
    powerUps.length = 0;
    particles.length = 0;
    saveData();
}

function gameSpeed() {
    const scoreTier = Math.floor(world.score / 200);
    const scoreBoost = Math.min(scoreTier * 0.13, 0.38); // slightly higher cap and step
    let spd = 1.8 + world.difficulty * 0.34 + Math.min(Math.floor(world.score / 280) * 0.06, 0.36) + scoreBoost;
    if (world.breather > 0) spd *= 0.7;
    if (world.slowTimer > 0) spd *= 0.58;
    if (!shouldAdvanceWorld()) spd = 0;
    if (world.settings.controlMode === "auto") spd *= 0.65;
    return spd;
}

function shootCooldown() { return player.rapid > 0 ? 8 : 16; }

function createStars() {
    stars = { far: [], mid: [], near: [], ufos: [], catStars: [] };
    for (let i = 0; i < 35; i++) stars.far.push({ x: Math.random() * canvas.width * 2, y: Math.random() * 150, s: 1, o: 0.35 });
    for (let i = 0; i < 55; i++) stars.mid.push({ x: Math.random() * canvas.width * 2, y: Math.random() * 220, s: 1.2, o: 0.7 });
    for (let i = 0; i < 90; i++) stars.near.push({ x: Math.random() * canvas.width * 2, y: Math.random() * 280, s: 1.8, o: 1 });
    // Sector 2: background UFOs — more of them
    for (let i = 0; i < 12; i++) stars.ufos.push({ x: Math.random() * canvas.width * 2, y: 20 + Math.random() * 120, t: Math.random() * Math.PI * 2 });
    // Sector 3: more tiny digital cat stars — spread across full canvas height, each with a gentle vertical drift
    for (let i = 0; i < 35; i++) stars.catStars.push({
        x: Math.random() * canvas.width * 2,
        y: 8 + Math.random() * 240,
        t: Math.random() * Math.PI * 2,
        vy: (Math.random() - 0.5) * 0.18,   // slow vertical drift
        baseY: 8 + Math.random() * 240       // centre of vertical bob
    });
}

function particleBurst(x, y, color, n = 8) {
    for (let i = 0; i < n; i++) {
        particles.push({ x, y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 24, color });
    }
}
function terrainYAt(x) {
    const sx = x + world.gameTime * 0.5 * (2 + world.difficulty * 0.42);
    return (GROUND_Y + player.h)
        + Math.sin(sx * 0.018) * 5
        + Math.sin(sx * 0.047 + 1.3) * 3
        + Math.sin(sx * 0.11  + 2.7) * 1.5
        + Math.sin(sx * 0.23  + 0.9) * 0.8;
}

function spawnObstacle() {
    if (enemies.some(e => e.type === "boss")) return; // arena rule
    if (worldDirection() <= 0) return;
    if (!shouldAdvanceWorld()) return;
    if (world.breather > 0) return;
    const runProgress = clamp(world.gameTime / 7000, 0, 1);
    const chance = 0.022 + runProgress * 0.018 + world.difficulty * 0.0012;
    const maxOnScreen = Math.floor(4 + runProgress * 4);
    const minSpawnGap = 260 - runProgress * 100;

    if (obstacles.length >= maxOnScreen) return;
    if (Math.random() > chance) return;
    if (obstacles.some(o => o.x > canvas.width - minSpawnGap)) return;

    const spawnX = canvas.width + 10;
    const tY = terrainYAt(spawnX);

    const roll = Math.random();
    if (roll < 0.30) {
        obstacles.push({ x: spawnX, y: tY - 28, w: 34, h: 28, type: "rock", breakable: false });
    } else if (roll < 0.42) {
        // large boulder — taller, unbreakable
        obstacles.push({ x: spawnX, y: tY - 42, w: 44, h: 42, type: "rock", breakable: false });
    } else if (roll < 0.62) {
        obstacles.push({ x: spawnX - 2, y: tY - 20, w: 30, h: 20, type: "crate", breakable: true, hp: 1 });
    } else if (roll < 0.76) {
        obstacles.push({ x: spawnX - 2, y: tY - 18, w: 26, h: 18, type: "mine", breakable: true, hp: 1 });
    } else if (roll < 0.88) {
        obstacles.push({ x: spawnX - 2, y: tY - 38, w: 44, h: 38, type: "ramp", breakable: false });
    } else {
        // spike cluster — two mines close together
        obstacles.push({ x: spawnX - 2, y: tY - 18, w: 26, h: 18, type: "mine", breakable: true, hp: 1 });
        const tY2 = terrainYAt(spawnX + 36);
        obstacles.push({ x: spawnX + 34, y: tY2 - 18, w: 26, h: 18, type: "mine", breakable: true, hp: 1 });
    }
    // bonus trailing crate — more common as game progresses
    if (Math.random() < 0.12 + runProgress * 0.18) {
        const tY2 = terrainYAt(spawnX + 55);
        obstacles.push({ x: spawnX + 55, y: tY2 - 18, w: 28, h: 18, type: "crate", breakable: true, hp: 1 });
    }
}

function spawnEnemy() {
    if (enemies.some(e => e.type === "boss")) return; // arena rule
    if (worldDirection() <= 0) return;
    if (!shouldAdvanceWorld()) return;
    if (world.breather > 0) return;
    if (enemies.filter(e => e.type !== "boss").length >= 8) return;
    if (Math.random() > 0.006 + world.difficulty * 0.001) return;
    if (enemies.some(e => e.type !== "boss" && e.x > canvas.width - 260)) return;

    const y = 100 + Math.random() * 140;
    if (enemies.some(e => e.type !== "boss" && e.x > canvas.width - 360 && Math.abs(e.y - y) < 70)) return;
    const speed = gameSpeed();
    const roll = Math.random();

    if (roll < 0.22) enemies.push({ x: canvas.width, y, w: 32, h: 32, type: "asteroid", vx: speed + 0.4, hp: 1, t: 0 });
    else if (roll < 0.42) enemies.push({ x: canvas.width, y, w: 30, h: 30, type: "drone", vx: speed + 0.2, hp: 1, t: 0 });
    else if (roll < 0.58) enemies.push({ x: canvas.width, y, w: 34, h: 24, type: "zigzag", vx: speed + 0.3, hp: 1, t: 0 });
    else if (roll < 0.72) enemies.push({ x: canvas.width, y, w: 36, h: 28, type: "interceptor", vx: speed + 1.0, hp: 1, t: 0 });
    else if (roll < 0.84) enemies.push({ x: canvas.width, y, w: 28, h: 28, type: "comet", vx: speed + 1.8, hp: 1, t: Math.random() * Math.PI * 2 });
    else if (roll < 0.93) enemies.push({ x: canvas.width, y, w: 26, h: 26, type: "debris", vx: speed + 0.6, hp: 1, t: Math.random() * Math.PI * 2 });
    else enemies.push({ x: canvas.width, y, w: 36, h: 36, type: "shooter", vx: speed, hp: 2, t: 0, cd: 90 + Math.random() * 45 });
}

function maybeSpawnBoss() {
    const level = LEVELS[Math.min(world.levelIndex, LEVELS.length - 1)];
    if (!level || !level.boss) return;
    if (world.sectorScore < level.targetScore) return;

    const mainBossAlive = enemies.some(e => e.type === "boss");
    const midbossAlive  = enemies.some(e => e.type === "midboss");

    // ── Spawn main boss once ──────────────────────────────────────────────────
    if (world.bossesSpawnedThisSector === 0) {
        world.bossesSpawnedThisSector++;
        // Arena rule: clear floor obstacles and non-boss enemies immediately
        obstacles.length = 0;
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].type !== "boss") enemies.splice(i, 1);
        }
        enemies.push({ x: canvas.width - 10, y: 95, w: 110, h: 90, type: "boss", vx: 0.7, hp: 20, hpMax: 20, t: 0, cd: 120 });
        return;
    }

    // ── Sector 2: spawn a wave of 4 fast mini-projectile enemies after boss dies ──
    if (level.spawnMinions && world.bossesKilledThisSector >= 1 && world.bossesSpawnedThisSector === 1 && !mainBossAlive) {
        world.bossesSpawnedThisSector++;
        const spd = gameSpeed();
        for (let i = 0; i < 4; i++) {
            const yOff = 80 + i * 55;
            enemies.push({ x: canvas.width + i * 60, y: yOff, w: 20, h: 20, type: "comet", vx: spd + 2.5, hp: 1, t: Math.random() * Math.PI * 2 });
        }
        return;
    }

    // ── Sector 3: spawn 2 midbosses after main boss dies ─────────────────────
    if (level.midboss > 0 && world.bossesKilledThisSector >= 1 && world.bossesSpawnedThisSector === 1 && !mainBossAlive && !midbossAlive) {
        world.bossesSpawnedThisSector++;
        const mbHp = 5; // quarter of boss HP (20)
        enemies.push({ x: canvas.width - 10,  y: 80,  w: 60, h: 55, type: "midboss", vx: 0.5, hp: mbHp, hpMax: mbHp, t: 0, cd: Math.floor(Math.random() * 60) + 120 });
        enemies.push({ x: canvas.width + 80, y: 185, w: 60, h: 55, type: "midboss", vx: 0.5, hp: mbHp, hpMax: mbHp, t: 0, cd: Math.floor(Math.random() * 60) + 150 });
        return;
    }
}

function spawnPowerUp(x, y) {
    if (Math.random() > 0.34) return;
    // shield and health weighted 3x, others 1x
    const types = ["shield", "shield", "shield", "health", "health", "health", "rapid", "doubleJump", "inc"];
    powerUps.push({ x, y, w: 18, h: 18, type: types[Math.floor(Math.random() * types.length)], t: 0 });
}

function spawnAmbientPowerUp() {
    if (enemies.some(e => e.type === "boss")) return; // arena rule
    if (worldDirection() <= 0) return;
    if (!shouldAdvanceWorld()) return;
    if (powerUps.length >= 3) return;
    if (powerUps.some(p => p.x > canvas.width - 260)) return;

    const progress = clamp(world.gameTime / 8000, 0, 1);
    const lowHealth = player.health < 2;
    // After sector 2 (levelIndex >= 2) boost overall spawn rate
    const sectorBoost = world.levelIndex >= 2 ? 0.0030 : 0;
    // When health is critical, double the spawn chance
    const healthBoost = lowHealth ? 0.0035 : 0;
    const chance = 0.0022 + progress * 0.0026 + sectorBoost + healthBoost;
    if (Math.random() > chance) return;

    // When health < 2: shield and health heavily weighted (6x), others minimal
    // Normal: shield and health 3x, others 1x
    const types = lowHealth
        ? ["shield", "shield", "shield", "shield", "shield", "shield", "health", "health", "health", "health", "health", "health", "rapid", "inc"]
        : ["shield", "shield", "shield", "health", "health", "health", "rapid", "doubleJump", "inc"];
    const y = 110 + Math.random() * 150;
    powerUps.push({
        x: canvas.width + 10,
        y,
        w: 20,
        h: 20,
        type: types[Math.floor(Math.random() * types.length)],
        t: Math.random() * Math.PI * 2
    });
}

function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function hurtPlayer(amount = 1) {
    if (player.invincible > 0) return;
    if (player.shield > 0) {
        player.shield = Math.max(0, player.shield - 1);
        player.invincible = 20;
        particleBurst(player.x + player.w / 2, player.y + player.h / 2, "#33CCFF", 9);
        world.shake = 6;
        return;
    }
    player.health -= amount;
    player.invincible = 90;
    world.damageFlash = 10;
    world.shake = 12;
    particleBurst(player.x + player.w / 2, player.y + player.h / 2, "#FF4444", 12);
    if (player.health <= 0) endGame();
}

function applyPowerUp(type) {
    if (type === "shield") player.shield = 3;
    else if (type === "rapid") player.rapid = Math.max(player.rapid, 500);
    else if (type === "doubleJump") { player.jumpsMax = 2; player.jumpsLeft = 2; }
    else if (type === "inc") player.inc = Math.max(player.inc, 600);
    else if (type === "health") player.health = Math.min(player.healthMax, player.health + 1);
    particleBurst(player.x + player.w / 2, player.y + player.h / 2, "#88FF00", 10);
    world.shake = 7;
}

function fireBullet() {
    const sx = player.x + player.w + 6;
    const sy = player.y + player.h / 2;
    const speed = 13;
    let vx = player.aimX * speed;
    let vy = player.aimY * speed;

    const nearest = enemies.filter(e => e.x > player.x).sort((a, b) => Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy))[0];
    if (nearest) {
        const tx = nearest.x + nearest.w / 2 - sx;
        const ty = nearest.y + nearest.h / 2 - sy;
        const d = Math.hypot(tx, ty) || 1;
        vx = vx * 0.86 + (tx / d) * speed * 0.14;
        vy = vy * 0.86 + (ty / d) * speed * 0.14;
    }
    const bulletW = player.inc > 0 ? 18 : 10;
    const bulletH = player.inc > 0 ? 8 : 4;
    player.bullets.push({
        x: sx,
        y: sy,
        w: bulletW,
        h: bulletH,
        vx,
        vy,
        life: 120,
        dist: 0,
        maxDist: canvas.width
    });
}

function spawnEnemyShot(enemy, speed = 4, spread = 0, shotW = 6, shotH = 6) {
    const sx = enemy.x;
    const sy = enemy.y + enemy.h / 2;
    const dx = player.x + player.w / 2 - sx;
    const dy = player.y + player.h / 2 - sy;
    const base = Math.atan2(dy, dx) + spread;
    enemyShots.push({
        x: sx - shotW / 2,
        y: sy - shotH / 2,
        w: shotW,
        h: shotH,
        vx: Math.cos(base) * speed,
        vy: Math.sin(base) * speed,
        life: 210
    });
}

function spawnBossShot(enemy) {
    const sx = enemy.x;
    const sy = enemy.y + enemy.h / 2;
    const tx = player.x + player.w / 2;
    const ty = player.y + player.h / 2;
    const d = Math.hypot(tx - sx, ty - sy) || 1;
    const speed = 3.1;
    const bossShotW = Math.max(player.w, 40);
    const bossShotH = Math.max(player.h, 25);

    enemyShots.push({
        x: sx - bossShotW / 2,
        y: sy - bossShotH / 2,
        w: bossShotW,
        h: bossShotH,
        // Direction is captured at fire time and stays fixed.
        vx: ((tx - sx) / d) * speed,
        vy: ((ty - sy) / d) * speed,
        life: 210
    });
}
function updatePlayer() {
    normalizeControlMode();
    // Mobile jump: treat held-down mobile jump as a fresh tap each frame it transitions to pressed
    const jumpTap = tapped("Space") || tapped("ArrowUp") || tapped("KeyW") || input.mobileJump;
    // Mobile shoot: continuous fire while shoot button held
    const shootTap = input.clicked || tapped("KeyF") || tapped("ControlLeft") || input.mobileShooting;
    // Reset mobileJump so it acts as tapped (only fires once per press) — handled in setupInput
    input.mobileJump = false;
    player.x = Math.floor(canvas.width / 2 - player.w / 2);

    if (player.onGround) {
        player.coyote = player.coyoteMax;
        player.jumpsLeft = player.jumpsMax;
    } else {
        player.coyote--;
    }

    if (jumpTap) {
        if (player.onGround || player.coyote > 0) {
            player.dy = player.jumpForce;
            player.onGround = false;
            player.coyote = 0;
        } else if (player.jumpsLeft > 0) {
            player.dy = player.jumpForce * 0.92;
            player.jumpsLeft--;
        }
    }

    player.dy = Math.min((player.onGround ? player.dy : player.dy * 0.985) + player.gravity, 11);
    player.y += player.dy;

    if (player.y >= GROUND_Y) {
        player.y = GROUND_Y;
        player.dy = 0;
        player.onGround = true;
    } else {
        player.onGround = false;
    }

    // Use analog stick aim on mobile when active, otherwise use mouse
    if (input.mobileAimActive) {
        player.aimX = input.mobileAimX;
        player.aimY = input.mobileAimY;
    } else {
        const ax = (input.mouseX - (player.x + player.w)) * (world.settings.aimSensitivity / 100);
        const ay = input.mouseY - (player.y + player.h / 2);
        const ad = Math.hypot(ax, ay) || 1;
        player.aimX = ax / ad;
        player.aimY = ay / ad;
    }

    if (shootTap && world.playTick - player.lastShot >= shootCooldown()) {
        player.lastShot = world.playTick;
        fireBullet();
        world.shake = Math.max(world.shake, 4);
    }
    input.clicked = false;

    if (player.invincible > 0) player.invincible--;
    if (player.rapid > 0) player.rapid--;
    if (player.inc > 0) player.inc--;
}

// Goal B: Sector 2 boss drops mini rovers toward the player
function spawnMiniRover(boss) {
    // Cap — never more than 2 mini rovers alive at once
    if (enemies.filter(e => e.type === "miniRover").length >= 2) return;

    // Drop from the bottom of the boss, straight down
    const spawnX = boss.x + boss.w / 2 - 11;
    const spawnY = boss.y + boss.h;
    const toPlayer = player.x + player.w / 2 < spawnX ? -1 : 1;
    enemies.push({
        x: spawnX, y: spawnY,
        w: 22, h: 16,
        type: "miniRover",
        phase: "drop",       // drop → pause → drive
        pauseTimer: 90,      // 1.5s stationary after landing before driving
        driveDir: toPlayer,
        driveSpeed: 1.8,
        hp: 3, hpMax: 3, t: 0
    });
}

function updateEntities() {
    const spd = gameSpeed();
    const dir = worldDirection();

    for (let i = player.bullets.length - 1; i >= 0; i--) {
        const b = player.bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        b.dist += Math.hypot(b.vx, b.vy);
        if (
            b.life <= 0 ||
            b.dist >= b.maxDist ||
            b.x >= canvas.width ||
            b.x + b.w <= 0 ||
            b.y + b.h <= 0 ||
            b.y >= canvas.height
        ) {
            player.bullets.splice(i, 1);
        }
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].x -= spd * dir;
        if (obstacles[i].x + obstacles[i].w < -10) obstacles.splice(i, 1);
        else if (obstacles[i].x > canvas.width + 60) obstacles.splice(i, 1);
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.t = (e.t || 0) + 0.05;
        if (e.type !== "miniRover") e.x -= (spd * 0.75 + (e.vx || 0) * 0.25) * dir;

        if (e.type === "asteroid") e.y += Math.sin(e.t) * 0.7;
        else if (e.type === "drone") e.y += Math.sin(e.t * 1.3) * 1.1;
        else if (e.type === "zigzag") e.y += Math.sin(e.t * 2.2) * 2;
        else if (e.type === "comet") e.y += Math.sin(e.t * 1.8) * 1.4;
        else if (e.type === "debris") { e.y += Math.sin(e.t * 2.8) * 0.9; e.t += 0.04; }
        else if (e.type === "interceptor") e.y += (player.y - 20 - e.y) * 0.03;
        else if (e.type === "shooter") {
            e.y += Math.sin(e.t * 0.8) * 0.8;
            e.cd--;
            if (e.cd <= 0) { spawnEnemyShot(e, 3.6); e.cd = 85 - Math.min(world.difficulty * 6, 30); }
        } else if (e.type === "boss") {
            e.x = Math.max(canvas.width - 170, e.x);
            if (world.levelIndex === 1) {
                // Sector 2: stationary — no drift, no wobble; drops miniRovers every 120 ticks
                e.cd--;
                if (e.cd <= 0) {
                    spawnMiniRover(e);
                    e.cd = 120;
                }
            } else {
                // All other sectors: original behavior
                e.y += Math.sin(e.t * 0.75) * 1.1;
                e.cd--;
                if (e.cd <= 0) {
                    spawnBossShot(e);
                    e.cd = 120;
                }
            }
        } else if (e.type === "midboss") {
            // hover in upper half, slow bob
            e.x = Math.max(canvas.width - 220, e.x);
            e.y += Math.sin(e.t * 0.6) * 1.0;
            e.cd--;
            if (e.cd <= 0) {
                // fire a fixed-direction shot toward rover's position at fire time — no tracking
                const sx = e.x;
                const sy = e.y + e.h / 2;
                const tx = player.x + player.w / 2;
                const ty = player.y + player.h / 2;
                const d = Math.hypot(tx - sx, ty - sy) || 1;
                const spd2 = 3.8;
                enemyShots.push({
                    x: sx - 8, y: sy - 8, w: 16, h: 16,
                    vx: ((tx - sx) / d) * spd2,
                    vy: ((ty - sy) / d) * spd2,
                    life: 240
                });
                // 2–3 seconds = 120–180 ticks
                e.cd = 120 + Math.floor(Math.random() * 60);
            }
        }

        else if (e.type === "miniRover") {
            if (e.phase === "drop") {
                e.y += 4;
                e.x -= spd * dir;
                const groundY = terrainYAt(e.x + e.w / 2) - e.h;
                if (e.y >= groundY) {
                    e.y = groundY;
                    e.phase = "pause"; // land → pause before driving
                }
            } else if (e.phase === "pause") {
                // sit still on terrain, count down before driving
                e.x -= spd * dir;
                const groundY = terrainYAt(e.x + e.w / 2) - e.h;
                e.y = groundY;
                e.pauseTimer--;
                if (e.pauseTimer <= 0) e.phase = "drive";
            } else {
                // drive along terrain toward player
                e.x -= spd * dir;
                e.x += e.driveDir * e.driveSpeed;
                const groundY = terrainYAt(e.x + e.w / 2) - e.h;
                e.y = groundY;
            }
            if (e.x + e.w < -20 || e.x > canvas.width + 20) {
                enemies.splice(i, 1);
                continue;
            }
        }

        if (e.type !== "miniRover") e.y = clamp(e.y, 30, canvas.height - 60);
        if (e.x + e.w < -40) enemies.splice(i, 1);
    }

    for (let i = enemyShots.length - 1; i >= 0; i--) {
        const p = enemyShots[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0 || p.x + p.w < -20 || p.x > canvas.width + 20 || p.y + p.h < -20 || p.y > canvas.height + 20) enemyShots.splice(i, 1);
    }

    for (let i = powerUps.length - 1; i >= 0; i--) {
        powerUps[i].t += 0.08;
        powerUps[i].x -= spd * 0.8 * dir;
        powerUps[i].y += Math.sin(powerUps[i].t) * 0.8;
        if (powerUps[i].x + powerUps[i].w < -20 || powerUps[i].x > canvas.width + 30) powerUps.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].x += particles[i].vx;
        particles[i].y += particles[i].vy;
        particles[i].vx *= 0.97;
        particles[i].vy *= 0.97;
        particles[i].life--;
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
}

function handleCollisions() {
    for (let bi = player.bullets.length - 1; bi >= 0; bi--) {
        const b = player.bullets[bi];
        let bulletHit = false;

        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            const e = enemies[ei];
            if (!hit(b, e)) continue;
            e.hp -= 1;
            bulletHit = true;
            particleBurst(e.x + e.w / 2, e.y + e.h / 2, "#FFAA00", e.type === "boss" ? 7 : 4);
            if (e.hp <= 0) {
                if (e.type === "boss") world.bossesKilledThisSector++;
                if (e.type === "midboss") world.bossesKilledThisSector++;
                const pts = e.type === "boss" ? 500 : e.type === "midboss" ? 200 : e.type === "miniRover" ? 30 : e.type === "shooter" ? 80 : 45;
                world.score += pts;
                world.sectorScore += pts;
                spawnPowerUp(e.x + e.w / 2, e.y + e.h / 2);
                enemies.splice(ei, 1);
                world.shake = Math.max(world.shake, 8);
            }
            break;
        }

        if (!bulletHit) {
            for (let oi = obstacles.length - 1; oi >= 0; oi--) {
                const o = obstacles[oi];
                if (!hit(b, o)) continue;
                bulletHit = true;
                if (o.breakable) {
                    o.hp -= 1;
                    if (o.hp <= 0) {
                        const opts = o.type === "mine" ? 20 : 12;
                        world.score += opts;
                        world.sectorScore += opts;
                        particleBurst(o.x + o.w / 2, o.y + o.h / 2, "#DDCC66", 6);
                        obstacles.splice(oi, 1);
                    }
                }
                break;
            }
        }
        if (bulletHit) player.bullets.splice(bi, 1);
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        if (!hit(player, o)) continue;
        if (o.type === "rock") { world.slowTimer = Math.max(world.slowTimer, 130); world.shake = Math.max(world.shake, 6); }
        else if (o.type === "ramp") { player.dy = Math.min(player.dy, -10.5); world.shake = Math.max(world.shake, 5); }
        else hurtPlayer(1);
        if (o.type !== "ramp") obstacles.splice(i, 1);
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        if (hit(player, enemies[i])) {
            hurtPlayer(1);
            if (enemies[i].type !== "boss") enemies.splice(i, 1);
        }
    }

    for (let i = enemyShots.length - 1; i >= 0; i--) {
        if (hit(player, enemyShots[i])) { hurtPlayer(1); enemyShots.splice(i, 1); }
    }

    for (let i = powerUps.length - 1; i >= 0; i--) {
        if (hit(player, powerUps[i])) { applyPowerUp(powerUps[i].type); powerUps.splice(i, 1); }
    }
}
function drawStars() {
    const s = gameSpeed();
    const dir = worldDirection();
    const drawLayer = (arr, color, mult) => {
        ctx.fillStyle = color;
        arr.forEach(star => {
            star.x -= s * mult * dir;
            if (star.x < -4) { star.x = canvas.width + 5 + Math.random() * 60; }
            if (star.x > canvas.width + 65) { star.x = -4 - Math.random() * 60; }
            ctx.globalAlpha = star.o;
            ctx.fillRect(star.x, star.y, star.s, star.s);
        });
    };
    drawLayer(stars.far, "#3344AA", 0.13);
    drawLayer(stars.mid, "#88CCFF", 0.28);
    drawLayer(stars.near, "#FFFFFF", 0.52);
    ctx.globalAlpha = 1;

    // ── Sector 2: background UFOs ──────────────────────────────────────────
    if (world.levelIndex === 1) {
        stars.ufos.forEach(u => {
            u.x -= s * 0.18 * dir;
            u.t += 0.03;
            if (u.x < -30) u.x = canvas.width + 30;
            if (u.x > canvas.width + 30) u.x = -30;
            const ux = u.x, uy = u.y + Math.sin(u.t) * 4;
            const pulse = 0.5 + 0.5 * Math.sin(u.t * 2.5);
            // saucer body
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = "#334444";
            ctx.beginPath(); ctx.ellipse(ux, uy + 3, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
            // dome
            ctx.fillStyle = "#223333";
            ctx.beginPath(); ctx.ellipse(ux, uy, 8, 6, 0, Math.PI, Math.PI * 2); ctx.fill();
            // glow ring
            ctx.strokeStyle = `rgba(0,255,180,${0.3 + pulse * 0.4})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(ux, uy + 3, 16, 5, 0, 0, Math.PI * 2); ctx.stroke();
            // light dots under saucer
            for (let d = -2; d <= 2; d++) {
                ctx.fillStyle = `rgba(${d % 2 === 0 ? "0,255,180" : "255,200,0"},${0.4 + pulse * 0.4})`;
                ctx.beginPath(); ctx.arc(ux + d * 5, uy + 5, 1.5, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
        });
    }

    // ── Sector 3: tiny digital cat stars ──────────────────────────────────
    if (world.levelIndex === 2) {
        stars.catStars.forEach(c => {
            c.x -= s * 0.22 * dir;
            c.t += 0.04;
            // vertical drift — gentle sine bob around their base position
            c.y = c.baseY + Math.sin(c.t * 0.6 + c.baseY * 0.05) * 8 + c.vy * c.t * 0.8;
            // clamp vertical so they stay in sky
            if (c.y < 6) c.y = 6;
            if (c.y > 255) { c.y = 255; c.vy *= -1; }
            // wrap x back at a random position so they don't line up
            if (c.x < -20) { c.x = canvas.width + 20 + Math.random() * 120; }
            if (c.x > canvas.width + 140) { c.x = -20 - Math.random() * 80; }
            const cx2 = c.x, cy2 = c.y;
            const blink = Math.floor(c.t / 1.5) % 4 !== 0;
            ctx.globalAlpha = 0.65;
            // tiny cat head
            ctx.fillStyle = "#00FFCC";
            ctx.beginPath(); ctx.arc(cx2, cy2 + 2, 4, 0, Math.PI * 2); ctx.fill();
            // ears
            ctx.beginPath(); ctx.moveTo(cx2 - 4, cy2); ctx.lineTo(cx2 - 6, cy2 - 4); ctx.lineTo(cx2 - 1, cy2 - 1); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(cx2 + 4, cy2); ctx.lineTo(cx2 + 6, cy2 - 4); ctx.lineTo(cx2 + 1, cy2 - 1); ctx.closePath(); ctx.fill();
            // eyes
            ctx.fillStyle = "#001A14";
            if (blink) {
                ctx.beginPath(); ctx.arc(cx2 - 1.5, cy2 + 2, 1, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(cx2 + 1.5, cy2 + 2, 1, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.strokeStyle = "#001A14"; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(cx2 - 2.5, cy2 + 2); ctx.lineTo(cx2 - 0.5, cy2 + 2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(cx2 + 0.5, cy2 + 2); ctx.lineTo(cx2 + 2.5, cy2 + 2); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        });
    }
}

function drawMoon() {
    const bossAlive = enemies.some(e => e.type === "boss" || e.type === "midboss");
    ctx.fillStyle = bossAlive ? "#CC2200" : "#CCCCAA";
    ctx.beginPath();
    ctx.arc(canvas.width - 150, 80, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bossAlive ? "#991500" : "#9D9D74";
    ctx.beginPath(); ctx.arc(canvas.width - 178, 50, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(canvas.width - 132, 102, 8, 0, Math.PI * 2); ctx.fill();

    // Sector 3: cat silhouette shadow on moon
    if (world.levelIndex === 2) {
        const mx = canvas.width - 150, my = 80;
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        // body
        ctx.beginPath(); ctx.ellipse(mx + 6, my + 12, 18, 14, 0, 0, Math.PI * 2); ctx.fill();
        // head
        ctx.beginPath(); ctx.arc(mx + 6, my - 4, 12, 0, Math.PI * 2); ctx.fill();
        // ears
        ctx.beginPath(); ctx.moveTo(mx - 4, my - 14); ctx.lineTo(mx - 10, my - 26); ctx.lineTo(mx + 2, my - 16); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(mx + 14, my - 14); ctx.lineTo(mx + 20, my - 26); ctx.lineTo(mx + 8, my - 16); ctx.closePath(); ctx.fill();
        // tail curling up
        ctx.strokeStyle = "rgba(0,0,0,0.28)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(mx + 22, my + 18); ctx.quadraticCurveTo(mx + 40, my + 5, mx + 32, my - 8); ctx.stroke();
    }
}

function drawRover() {
    const flash = world.damageFlash > 0;
    const px = player.x, py = player.y;
    const pw = player.w, ph = player.h;

    // --- Wheels ---
    const wheelR = 6;
    const wheelY = py + ph + 1;
    const wheelCol = flash ? "#FF8888" : "#44FF88";
    const spokeCol = flash ? "#FF5555" : "#00CC55";
    for (let wx of [px + 6, px + pw - 9]) {
        // tyre
        ctx.fillStyle = "#222";
        ctx.beginPath(); ctx.arc(wx + 3, wheelY, wheelR + 1, 0, Math.PI * 2); ctx.fill();
        // rim
        ctx.fillStyle = wheelCol;
        ctx.beginPath(); ctx.arc(wx + 3, wheelY, wheelR - 1, 0, Math.PI * 2); ctx.fill();
        // hub
        ctx.fillStyle = spokeCol;
        ctx.beginPath(); ctx.arc(wx + 3, wheelY, 2.5, 0, Math.PI * 2); ctx.fill();
        // spokes
        ctx.strokeStyle = spokeCol;
        ctx.lineWidth = 1;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
            ctx.beginPath();
            ctx.moveTo(wx + 3, wheelY);
            ctx.lineTo(wx + 3 + Math.cos(a) * (wheelR - 1), wheelY + Math.sin(a) * (wheelR - 1));
            ctx.stroke();
        }
    }

    // --- Chassis body ---
    ctx.fillStyle = flash ? "#FF4444" : "#0A8844";
    ctx.fillRect(px + 2, py + 8, pw - 4, ph - 8);

    // --- Chassis top panel ---
    ctx.fillStyle = flash ? "#FF6666" : "#00CC66";
    ctx.fillRect(px + 4, py + 2, pw - 10, ph - 10);

    // --- Cockpit glass ---
    ctx.fillStyle = flash ? "#FF9999" : "#00FFCC";
    ctx.globalAlpha = 0.85;
    ctx.fillRect(px + 5, py + 3, 13, 9);
    ctx.globalAlpha = 1;
    // glass glint
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(px + 6, py + 4, 4, 2);

    // --- Antenna ---
    ctx.strokeStyle = flash ? "#FF8888" : "#00FF88";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 10, py + 2);
    ctx.lineTo(px + 10, py - 7);
    ctx.stroke();
    ctx.fillStyle = "#FF00FF";
    ctx.beginPath(); ctx.arc(px + 10, py - 8, 2, 0, Math.PI * 2); ctx.fill();

    // --- Cannon barrel ---
    ctx.fillStyle = flash ? "#FF6655" : "#AAFFCC";
    ctx.fillRect(px + pw - 4, py + ph / 2 - 2, 8, 4);
    ctx.fillStyle = flash ? "#FF3300" : "#FF00FF";
    ctx.fillRect(px + pw + 3, py + ph / 2 - 1, 3, 2);

    // --- Exhaust ---
    ctx.fillStyle = "rgba(100,255,100,0.35)";
    ctx.fillRect(px + 2, py + ph - 3, 3, 2);
    ctx.fillRect(px + 2, py + ph - 6, 2, 2);

    // --- Outline ---
    ctx.strokeStyle = flash ? "#FF0000" : "#00FF44";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 2, py + 8, pw - 4, ph - 8);

    // --- Shield bubble ---
    if (player.shield > 0) {
        const pulse = 0.7 + 0.3 * Math.sin(world.playTick * 0.15);
        ctx.strokeStyle = `rgba(80,220,255,${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px + pw / 2, py + ph / 2, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(80,220,255,${pulse * 0.4})`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(px + pw / 2, py + ph / 2, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
    }
}

function drawObstacle(o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (o.type === "rock") {
        // irregular moon rock
        ctx.fillStyle = "#556655";
        ctx.beginPath();
        ctx.moveTo(o.x + 6, o.y + o.h);
        ctx.lineTo(o.x, o.y + o.h - 6);
        ctx.lineTo(o.x + 4, o.y + 8);
        ctx.lineTo(o.x + 10, o.y + 2);
        ctx.lineTo(o.x + o.w - 6, o.y + 4);
        ctx.lineTo(o.x + o.w, o.y + 10);
        ctx.lineTo(o.x + o.w - 2, o.y + o.h - 4);
        ctx.lineTo(o.x + o.w - 6, o.y + o.h);
        ctx.closePath();
        ctx.fill();
        // highlight facets
        ctx.fillStyle = "#778877";
        ctx.beginPath();
        ctx.moveTo(o.x + 10, o.y + 2);
        ctx.lineTo(o.x + o.w - 6, o.y + 4);
        ctx.lineTo(o.x + o.w - 8, o.y + 12);
        ctx.lineTo(o.x + 12, o.y + 10);
        ctx.closePath();
        ctx.fill();
        // crack
        ctx.strokeStyle = "#334433";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 2, o.y + 6); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx, o.y + o.h - 4);
        ctx.stroke();
    } else if (o.type === "crate") {
        // metal supply crate
        ctx.fillStyle = "#8B6914";
        ctx.fillRect(o.x, o.y, o.w, o.h);
        // panels
        ctx.fillStyle = "#A87E28";
        ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, 6);
        ctx.fillRect(o.x + 2, o.y + o.h - 8, o.w - 4, 6);
        // cross brace
        ctx.strokeStyle = "#5C430A";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
        ctx.beginPath();
        ctx.moveTo(o.x + 2, cy); ctx.lineTo(o.x + o.w - 2, cy);
        ctx.moveTo(cx, o.y + 2); ctx.lineTo(cx, o.y + o.h - 2);
        ctx.stroke();
        // rivets
        ctx.fillStyle = "#FFCC44";
        for (let [rx, ry] of [[o.x+3, o.y+3],[o.x+o.w-5, o.y+3],[o.x+3, o.y+o.h-5],[o.x+o.w-5, o.y+o.h-5]]) {
            ctx.beginPath(); ctx.arc(rx, ry, 1.5, 0, Math.PI*2); ctx.fill();
        }
        // biohazard label
        ctx.fillStyle = "#FFD700";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.fillText("!", cx, cy + 3);
        ctx.textAlign = "left";
    } else if (o.type === "mine") {
        // spiky sea-mine
        const r = Math.min(o.w, o.h) / 2 - 1;
        const pulse = 0.7 + 0.3 * Math.sin(world.playTick * 0.12);
        // glow
        ctx.fillStyle = `rgba(255,50,50,${pulse * 0.3})`;
        ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI*2); ctx.fill();
        // body
        ctx.fillStyle = "#661111";
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "#993333";
        ctx.beginPath(); ctx.arc(cx - 2, cy - 2, r - 2, 0, Math.PI*2); ctx.fill();
        // spikes
        ctx.strokeStyle = "#CC2222";
        ctx.lineWidth = 2;
        for (let a = 0; a < Math.PI*2; a += Math.PI/4) {
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
            ctx.lineTo(cx + Math.cos(a)*(r+5), cy + Math.sin(a)*(r+5));
            ctx.stroke();
        }
        // eye light
        ctx.fillStyle = `rgba(255,80,80,${pulse})`;
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
    } else {
        // launch ramp - sleek incline with markings
        ctx.fillStyle = "#5A4535";
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + o.h);
        ctx.lineTo(o.x + o.w, o.y + o.h);
        ctx.lineTo(o.x + o.w, o.y);
        ctx.closePath();
        ctx.fill();
        // surface highlight
        ctx.fillStyle = "#7A6050";
        ctx.beginPath();
        ctx.moveTo(o.x + 4, o.y + o.h - 2);
        ctx.lineTo(o.x + o.w - 2, o.y + o.h - 2);
        ctx.lineTo(o.x + o.w - 2, o.y + 6);
        ctx.closePath();
        ctx.fill();
        // hazard stripes
        ctx.strokeStyle = "#FFCC00";
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const t = (i + 1) / 4;
            const sx = o.x + o.w * t;
            const sy = o.y + o.h - (o.h * t);
            ctx.beginPath();
            ctx.moveTo(sx, o.y + o.h);
            ctx.lineTo(sx - 6, sy);
            ctx.stroke();
        }
    }
}

function drawEnemy(e) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const t = world.playTick;

    if (e.type === "asteroid") {
        // chunky tumbling space rock
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * 0.018);
        ctx.fillStyle = "#774433";
        ctx.beginPath();
        ctx.moveTo(-e.w/2+2, -e.h/2+6);
        ctx.lineTo(-e.w/2+8, -e.h/2);
        ctx.lineTo(e.w/2-4, -e.h/2+2);
        ctx.lineTo(e.w/2, -e.h/2+8);
        ctx.lineTo(e.w/2-2, e.h/2-2);
        ctx.lineTo(-e.w/2+4, e.h/2);
        ctx.lineTo(-e.w/2, e.h/2-4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#AA6655";
        ctx.beginPath();
        ctx.moveTo(-e.w/2+8, -e.h/2);
        ctx.lineTo(e.w/2-4, -e.h/2+2);
        ctx.lineTo(e.w/2-10, e.h/2-10);
        ctx.closePath();
        ctx.fill();
        // crater
        ctx.strokeStyle = "#553322";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(4, 3, 4, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(-5, -4, 2.5, 0, Math.PI*2); ctx.stroke();
        ctx.restore();

    } else if (e.type === "drone") {
        // hovering scout drone with spinning ring
        // body glow
        ctx.fillStyle = "rgba(255,120,0,0.25)";
        ctx.beginPath(); ctx.arc(cx, cy, e.w/2+4, 0, Math.PI*2); ctx.fill();
        // spinning outer ring
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.06);
        ctx.strokeStyle = "#FF6600"; ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(0, 0, e.w/2+1, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // fuselage
        ctx.fillStyle = "#CC4400";
        ctx.fillRect(e.x + 4, e.y + 6, e.w - 8, e.h - 10);
        // cockpit dome
        ctx.fillStyle = "#FF9933";
        ctx.beginPath(); ctx.ellipse(cx, e.y + 7, 8, 5, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "rgba(255,220,100,0.7)";
        ctx.beginPath(); ctx.ellipse(cx - 1, e.y + 6, 4, 3, -0.3, 0, Math.PI*2); ctx.fill();
        // wing stubs
        ctx.fillStyle = "#FF6600";
        ctx.fillRect(e.x, e.y + e.h - 10, 6, 4);
        ctx.fillRect(e.x + e.w - 6, e.y + e.h - 10, 6, 4);
        // engine glow
        const eg = 0.6 + 0.4 * Math.sin(t * 0.2);
        ctx.fillStyle = `rgba(255,200,50,${eg})`;
        ctx.beginPath(); ctx.arc(cx - 6, e.y + e.h - 4, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 6, e.y + e.h - 4, 3, 0, Math.PI*2); ctx.fill();

    } else if (e.type === "zigzag") {
        // erratic alien fighter
        ctx.fillStyle = "#2266CC";
        // main wing shape
        ctx.beginPath();
        ctx.moveTo(cx, e.y);
        ctx.lineTo(e.x + e.w, e.y + e.h/2 + 4);
        ctx.lineTo(cx + 4, e.y + e.h/2);
        ctx.lineTo(cx, e.y + e.h);
        ctx.lineTo(cx - 4, e.y + e.h/2);
        ctx.lineTo(e.x, e.y + e.h/2 + 4);
        ctx.closePath();
        ctx.fill();
        // spine
        ctx.fillStyle = "#55AAFF";
        ctx.beginPath();
        ctx.moveTo(cx, e.y + 2);
        ctx.lineTo(cx + 5, cy);
        ctx.lineTo(cx, e.y + e.h - 2);
        ctx.lineTo(cx - 5, cy);
        ctx.closePath();
        ctx.fill();
        // pulsing core
        const zp = 0.5 + 0.5 * Math.sin(t * 0.25);
        ctx.fillStyle = `rgba(180,230,255,${zp})`;
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2); ctx.fill();
        // energy trail dots
        ctx.fillStyle = "rgba(85,170,255,0.5)";
        for (let i = 1; i <= 3; i++) {
            ctx.beginPath(); ctx.arc(e.x + e.w + i*5, cy, 2-i*0.4, 0, Math.PI*2); ctx.fill();
        }

    } else if (e.type === "interceptor") {
        // sleek fast pursuit ship
        ctx.fillStyle = "#CC1177";
        // needle body
        ctx.beginPath();
        ctx.moveTo(e.x + e.w, cy);
        ctx.lineTo(e.x + 6, e.y);
        ctx.lineTo(e.x + 2, cy - 4);
        ctx.lineTo(e.x, cy);
        ctx.lineTo(e.x + 2, cy + 4);
        ctx.lineTo(e.x + 6, e.y + e.h);
        ctx.closePath();
        ctx.fill();
        // wing sweep
        ctx.fillStyle = "#FF33AA";
        ctx.beginPath();
        ctx.moveTo(e.x + e.w - 4, cy);
        ctx.lineTo(e.x + e.w/2, e.y + 2);
        ctx.lineTo(e.x + e.w/2 - 4, cy - 6);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(e.x + e.w - 4, cy);
        ctx.lineTo(e.x + e.w/2, e.y + e.h - 2);
        ctx.lineTo(e.x + e.w/2 - 4, cy + 6);
        ctx.closePath();
        ctx.fill();
        // afterburner
        const af = 0.7 + 0.3 * Math.sin(t * 0.3);
        ctx.fillStyle = `rgba(255,100,200,${af})`;
        ctx.beginPath(); ctx.arc(e.x + 1, cy, 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${af * 0.8})`;
        ctx.beginPath(); ctx.arc(e.x + 1, cy, 2, 0, Math.PI*2); ctx.fill();
        // cockpit slit
        ctx.fillStyle = "rgba(255,200,240,0.8)";
        ctx.fillRect(e.x + e.w - 10, cy - 1, 6, 2);

    } else if (e.type === "shooter") {
        // heavy weapons platform
        ctx.fillStyle = "#996600";
        ctx.fillRect(e.x + 2, e.y + 4, e.w - 4, e.h - 8);
        // turret base
        ctx.fillStyle = "#CC8800";
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI*2); ctx.fill();
        // rotating turret ring
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.04);
        ctx.strokeStyle = "#FFAA33"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.stroke();
        // turret barrels
        ctx.fillStyle = "#FFCC55";
        ctx.fillRect(6, -1.5, 8, 3);
        ctx.fillRect(-14, -1.5, 8, 3);
        ctx.restore();
        // armor plates
        ctx.fillStyle = "#BB7700";
        ctx.fillRect(e.x, e.y + 6, 6, e.h - 12);
        ctx.fillRect(e.x + e.w - 6, e.y + 6, 6, e.h - 12);
        // warning light
        const wl = 0.5 + 0.5 * Math.sin(t * 0.18);
        ctx.fillStyle = `rgba(255,80,0,${wl})`;
        ctx.beginPath(); ctx.arc(cx, e.y + 2, 3, 0, Math.PI*2); ctx.fill();
        // panel rivets
        ctx.fillStyle = "#FFD700";
        for (let [rx, ry] of [[e.x+3,e.y+5],[e.x+e.w-4,e.y+5],[e.x+3,e.y+e.h-6],[e.x+e.w-4,e.y+e.h-6]]) {
            ctx.beginPath(); ctx.arc(rx, ry, 1.5, 0, Math.PI*2); ctx.fill();
        }

    } else if (e.type === "comet") {
        // fast-moving ice comet with tail
        const tailLen = 22;
        const grad = ctx.createLinearGradient(cx + tailLen, cy, cx - 4, cy);
        grad.addColorStop(0, "rgba(120,200,255,0)");
        grad.addColorStop(1, "rgba(180,230,255,0.7)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx + tailLen, cy);
        ctx.lineTo(cx, cy - 5);
        ctx.lineTo(cx - 4, cy);
        ctx.lineTo(cx, cy + 5);
        ctx.closePath();
        ctx.fill();
        // secondary tail
        const grad2 = ctx.createLinearGradient(cx + tailLen * 0.7, cy - 3, cx - 2, cy - 3);
        grad2.addColorStop(0, "rgba(200,240,255,0)");
        grad2.addColorStop(1, "rgba(200,240,255,0.4)");
        ctx.fillStyle = grad2;
        ctx.beginPath();
        ctx.moveTo(cx + tailLen * 0.7, cy - 3);
        ctx.lineTo(cx, cy - 7);
        ctx.lineTo(cx - 2, cy - 3);
        ctx.closePath();
        ctx.fill();
        // nucleus
        ctx.fillStyle = "#DDEEFF";
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath(); ctx.arc(cx - 1, cy - 1, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(100,180,255,0.3)";
        ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();

    } else if (e.type === "debris") {
        // spinning chunk of space junk
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(world.playTick * 0.055);
        ctx.fillStyle = "#556677";
        ctx.beginPath();
        ctx.moveTo(-5, -6); ctx.lineTo(5, -5);
        ctx.lineTo(7, 2);   ctx.lineTo(2, 7);
        ctx.lineTo(-6, 5);  ctx.lineTo(-7, -2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#778899";
        ctx.beginPath();
        ctx.moveTo(-3, -5); ctx.lineTo(4, -4); ctx.lineTo(3, 0); ctx.lineTo(-2, -1);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#334455";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-1, -2); ctx.lineTo(2, 3); ctx.stroke();
        ctx.restore();

    } else if (e.type === "miniRover") {
        const px = e.x, py = e.y, pw = e.w, ph = e.h;
        const facingLeft = e.driveDir < 0;
        // flash orange during pause to warn player it's about to drive
        const isPaused = e.phase === "pause";
        const flashOn = isPaused && Math.floor(world.playTick / 8) % 2 === 0;
        // body
        ctx.fillStyle = flashOn ? "#FF6600" : "#AA0000";
        ctx.fillRect(px + 2, py + 4, pw - 4, ph - 4);
        // cockpit
        ctx.fillStyle = flashOn ? "#FFAA00" : "#FF4444";
        ctx.fillRect(facingLeft ? px + pw - 12 : px + 4, py + 1, 8, 6);
        // wheels
        ctx.fillStyle = "#330000";
        for (const wx of [px + 3, px + pw - 9]) {
            ctx.beginPath(); ctx.arc(wx + 3, py + ph + 2, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = flashOn ? "#FF6600" : "#AA0000";
            ctx.beginPath(); ctx.arc(wx + 3, py + ph + 2, 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#330000";
        }
        // cannon
        ctx.fillStyle = "#FF6666";
        if (facingLeft) {
            ctx.fillRect(px - 4, py + ph / 2 - 1, 5, 3);
        } else {
            ctx.fillRect(px + pw - 1, py + ph / 2 - 1, 5, 3);
        }
        // HP bar
        const hpRatio = (e.hp || 1) / (e.hpMax || 3);
        ctx.fillStyle = "#330000";
        ctx.fillRect(px, py - 6, pw, 4);
        ctx.fillStyle = "#FF2200";
        ctx.fillRect(px, py - 6, pw * hpRatio, 4);

    } else if (e.type === "midboss") {
        // ── MIDBOSS: WARDEN GUNSHIP ───────────────────────────────────────────
        const bx = e.x, by = e.y, bw = e.w, bh = e.h;
        const bcx = bx + bw/2, bcy = by + bh/2;
        const pulse = 0.6 + 0.4 * Math.sin(world.playTick * 0.13);
        const hpRatio = e.hp / (e.hpMax || 1);

        // outer glow
        ctx.fillStyle = `rgba(255,120,0,${pulse * 0.18})`;
        ctx.beginPath(); ctx.ellipse(bcx, bcy, bw/2+10, bh/2+8, 0, 0, Math.PI*2); ctx.fill();

        // main hull
        ctx.fillStyle = "#7A3300";
        ctx.beginPath();
        ctx.moveTo(bx + bw, bcy);
        ctx.lineTo(bx + bw - 8, by + 4);
        ctx.lineTo(bx + 10, by + 6);
        ctx.lineTo(bx + 4, bcy);
        ctx.lineTo(bx + 10, by + bh - 6);
        ctx.lineTo(bx + bw - 8, by + bh - 4);
        ctx.closePath();
        ctx.fill();

        // top armor plate
        ctx.fillStyle = "#CC5500";
        ctx.beginPath();
        ctx.moveTo(bx + bw - 8, by + 4);
        ctx.lineTo(bx + bw/2, by + 2);
        ctx.lineTo(bx + 14, by + 8);
        ctx.lineTo(bx + bw/2 - 4, bcy - 4);
        ctx.lineTo(bx + bw - 12, bcy - 2);
        ctx.closePath();
        ctx.fill();

        // single front cannon
        ctx.fillStyle = "#FF8833";
        ctx.fillRect(bx + bw - 4, bcy - 3, 12, 6);
        ctx.fillStyle = `rgba(255,180,50,${pulse})`;
        ctx.beginPath(); ctx.arc(bx + bw + 8, bcy, 4, 0, Math.PI*2); ctx.fill();

        // engine vent
        ctx.fillStyle = "#1a0a00";
        ctx.fillRect(bx + 6, bcy - 8, 10, 16);
        ctx.fillStyle = `rgba(255,100,0,${0.5 + 0.5*Math.sin(world.playTick*0.2)})`;
        ctx.fillRect(bx + 8, bcy - 6, 6, 12);

        // cockpit
        ctx.fillStyle = "rgba(255,200,100,0.75)";
        ctx.beginPath(); ctx.ellipse(bcx + 4, bcy, 7, 5, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,200,0.5)";
        ctx.beginPath(); ctx.ellipse(bcx + 3, bcy - 1, 3, 2, -0.3, 0, Math.PI*2); ctx.fill();

        // HP bar
        ctx.fillStyle = "#111";
        ctx.fillRect(bx, by - 10, bw, 6);
        ctx.fillStyle = hpRatio > 0.5 ? "#FF8800" : "#FF3300";
        ctx.fillRect(bx, by - 10, hpRatio * bw, 6);
        ctx.strokeStyle = "#FF6600";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by - 10, bw, 6);
        ctx.fillStyle = "#FF9933";
        ctx.font = "bold 8px Courier New";
        ctx.textAlign = "center";
        ctx.fillText("WARDEN", bcx, by - 13);
        ctx.textAlign = "left";

    } else if (e.type === "boss") {
        // ── BOSS: TITAN WARSHIP ────────────────────────────────────────────────
        const bw = e.w, bh = e.h;
        const bx = e.x, by = e.y;
        const bcx = bx + bw/2, bcy = by + bh/2;
        const pulse = 0.6 + 0.4 * Math.sin(t * 0.08);
        const hpRatio = e.hp / (e.hpMax || 1);

        // outer menacing glow
        ctx.fillStyle = `rgba(180,0,255,${pulse * 0.15})`;
        ctx.beginPath(); ctx.ellipse(bcx, bcy, bw/2+14, bh/2+10, 0, 0, Math.PI*2); ctx.fill();

        // ── main hull body ────
        ctx.fillStyle = "#330055";
        ctx.beginPath();
        ctx.moveTo(bx + bw, bcy - 8);
        ctx.lineTo(bx + bw - 10, by + 6);
        ctx.lineTo(bx + bw/2 + 8, by);
        ctx.lineTo(bx + 18, by + 8);
        ctx.lineTo(bx + 6, bcy);
        ctx.lineTo(bx + 18, by + bh - 8);
        ctx.lineTo(bx + bw/2 + 8, by + bh);
        ctx.lineTo(bx + bw - 10, by + bh - 6);
        ctx.lineTo(bx + bw, bcy + 8);
        ctx.closePath();
        ctx.fill();

        // ── upper armor plates ────
        ctx.fillStyle = "#6611AA";
        ctx.beginPath();
        ctx.moveTo(bx + bw - 10, by + 6);
        ctx.lineTo(bx + bw/2 + 8, by);
        ctx.lineTo(bx + bw/2, by + bh/3);
        ctx.lineTo(bx + bw - 14, bcy - 4);
        ctx.closePath();
        ctx.fill();
        // lower plate
        ctx.beginPath();
        ctx.moveTo(bx + bw - 10, by + bh - 6);
        ctx.lineTo(bx + bw/2 + 8, by + bh);
        ctx.lineTo(bx + bw/2, by + bh*2/3);
        ctx.lineTo(bx + bw - 14, bcy + 4);
        ctx.closePath();
        ctx.fill();

        // ── spine ridge ────
        ctx.fillStyle = "#9933FF";
        ctx.beginPath();
        ctx.moveTo(bx + bw, bcy - 5);
        ctx.lineTo(bx + bw - 8, bcy - 12);
        ctx.lineTo(bx + 30, bcy - 8);
        ctx.lineTo(bx + 16, bcy);
        ctx.lineTo(bx + 30, bcy + 8);
        ctx.lineTo(bx + bw - 8, bcy + 12);
        ctx.lineTo(bx + bw, bcy + 5);
        ctx.closePath();
        ctx.fill();

        // ── cannon array (4 barrels) ────
        ctx.fillStyle = "#AA44FF";
        for (let [cy2, len] of [[bcy-16, bw*0.38],[bcy-6, bw*0.46],[bcy+6, bw*0.46],[bcy+16, bw*0.38]]) {
            ctx.fillRect(bx + bw - 4, cy2 - 2, len * 0.6, 4);
        }
        // barrel tips glow
        const bpulse = 0.5 + 0.5 * Math.sin(t * 0.22 + 1);
        ctx.fillStyle = `rgba(255,100,255,${bpulse})`;
        for (let cy2 of [bcy-16, bcy-6, bcy+6, bcy+16]) {
            ctx.beginPath(); ctx.arc(bx + bw + 14, cy2, 3, 0, Math.PI*2); ctx.fill();
        }

        // ── engine vents ────
        for (let [vy, vh] of [[by+8,12],[bcy-6,12],[by+bh-20,12]]) {
            ctx.fillStyle = "#1a0033";
            ctx.fillRect(bx + 8, vy, 14, vh);
            const eg2 = 0.5 + 0.5*Math.sin(t * 0.15);
            ctx.fillStyle = `rgba(130,0,255,${eg2})`;
            ctx.fillRect(bx + 10, vy+2, 10, vh-4);
        }

        // ── viewport strip ────
        ctx.fillStyle = `rgba(255,200,255,${0.5 + 0.5*Math.sin(t*0.07)})`;
        ctx.fillRect(bx + bw/2 - 4, bcy - 2, 20, 4);

        // ── panel detail lines ────
        ctx.strokeStyle = "rgba(180,80,255,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + 20, bcy); ctx.lineTo(bx + bw - 20, bcy);
        ctx.moveTo(bcx, by + 10); ctx.lineTo(bcx, by + bh - 10);
        ctx.stroke();

        // ── damage cracks at low HP ────
        if (hpRatio < 0.4) {
            ctx.strokeStyle = `rgba(255,80,0,${0.7 + 0.3*Math.sin(t*0.3)})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(bcx - 10, by + 20); ctx.lineTo(bcx + 5, by + 40);
            ctx.moveTo(bcx + 15, bcy - 5); ctx.lineTo(bcx + 30, bcy + 15);
            ctx.stroke();
        }

        // ── HP bar ────
        ctx.fillStyle = "#111";
        ctx.fillRect(bx, by - 14, bw, 8);
        ctx.fillStyle = hpRatio > 0.5 ? "#FF3355" : hpRatio > 0.25 ? "#FF8800" : "#FF2200";
        ctx.fillRect(bx, by - 14, hpRatio * bw, 8);
        ctx.strokeStyle = "#FF00AA";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by - 14, bw, 8);
        // boss label
        ctx.fillStyle = "#FF00CC";
        ctx.font = "bold 9px Courier New";
        ctx.textAlign = "center";
        ctx.fillText("TITAN", bcx, by - 17);
        ctx.textAlign = "left";
    }
}

function drawHUD() {
    const level = LEVELS[Math.min(world.levelIndex, LEVELS.length - 1)];
    const goal = level ? `${level.name} GOAL: ${level.targetScore}` : "FINAL GOAL COMPLETE";
    const sectorProgress = level ? clamp(world.sectorScore / level.targetScore, 0, 1) : 1;

    ctx.fillStyle = "#00FF00";
    ctx.font = "bold 16px Courier New";
    ctx.fillText(`SCORE: ${Math.floor(world.score)}`, 16, 26);
    ctx.fillText(`HIGH: ${world.highScore}`, 16, 48);
    ctx.fillText(`HEALTH: ${player.health}`, 16, 70);
    ctx.fillText(`DIFF: ${world.difficulty.toFixed(2)}x`, 16, 92);
    ctx.fillStyle = "#00FFFF";
    ctx.font = "14px Courier New";
    ctx.fillText(goal, 16, 114);
    ctx.fillStyle = "#66CCFF";
    ctx.font = "bold 11px Courier New";
    ctx.fillText("SECTOR PROGRESS", 16, 132);
    ctx.fillStyle = "#333";
    ctx.fillRect(16, 136, 180, 8);
    ctx.fillStyle = "#66CCFF";
    ctx.fillRect(16, 136, 180 * sectorProgress, 8);

    const ratio = clamp((world.playTick - player.lastShot) / shootCooldown(), 0, 1);
    ctx.fillStyle = player.rapid > 0 ? "#FFD700" : "#44FF88";
    ctx.font = "bold 11px Courier New";
    ctx.fillText("SHOOT RECHARGE", 16, 162);
    ctx.fillStyle = "#333"; ctx.fillRect(16, 166, 120, 8);
    ctx.fillStyle = player.rapid > 0 ? "#FFD700" : "#44FF88"; ctx.fillRect(16, 166, 120 * ratio, 8);

    const activePowerUps = [];
    if (player.shield > 0) activePowerUps.push({ text: `SHIELD ${player.shield} HIT`, color: "#55CCFF" });
    if (player.rapid > 0) activePowerUps.push({ text: `RAPID ${Math.ceil(player.rapid / 60)}s`, color: "#FFCC00" });
    if (player.inc > 0) activePowerUps.push({ text: `INC ${Math.ceil(player.inc / 60)}s`, color: "#FFAA33" });
    if (player.jumpsMax > 1) activePowerUps.push({ text: "DOUBLE JUMP", color: "#88FF66" });

    if (activePowerUps.length > 0) {
        const startY = 22;
        const boxW = 250;
        const boxH = 22 + activePowerUps.length * 22;
        const boxX = Math.floor(canvas.width / 2 - boxW / 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(boxX, 6, boxW, boxH);
        ctx.strokeStyle = "#44FFFF";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(boxX, 6, boxW, boxH);
        ctx.textAlign = "center";
        ctx.font = "bold 15px Courier New";
        activePowerUps.forEach((p, i) => {
            ctx.fillStyle = p.color;
            ctx.fillText(p.text, canvas.width / 2, startY + i * 20);
        });
        ctx.textAlign = "left";
    }
    if (world.breather > 0) { ctx.fillStyle = "#FFFF00"; ctx.fillText("BREATHER WAVE", 320, 24); }
    if (world.sectorClear > 0) { ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 22px Courier New"; ctx.fillText("SECTOR CLEAR", 300, 80); }

    // ── Big sector announce banner ─────────────────────────────────────────
    if (world.sectorAnnounce > 0) {
        const level = LEVELS[Math.min(world.levelIndex, LEVELS.length - 1)];
        if (level) {
            const alpha = Math.min(1, world.sectorAnnounce / 40, world.sectorAnnounce / 210 * 3);
            ctx.globalAlpha = alpha;
            // dark backing
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, canvas.height / 2 - 70, canvas.width, 120);
            // sector number
            ctx.fillStyle = "#FFFF00";
            ctx.font = "bold 48px Courier New";
            ctx.textAlign = "center";
            ctx.fillText(level.name, canvas.width / 2, canvas.height / 2 - 10);
            // theme name
            ctx.fillStyle = "#00FFCC";
            ctx.font = "bold 26px Courier New";
            ctx.fillText(level.theme, canvas.width / 2, canvas.height / 2 + 32);
            ctx.textAlign = "left";
            ctx.globalAlpha = 1;
        }
    }
    if (world.tutorial > 0) { ctx.fillStyle = "#00FFFF"; ctx.font = "13px Courier New"; ctx.fillText("A/D Move | Space Jump | Mouse/F Shoot | P Pause | M Mode", 180, 390); }
}

function drawCrosshair() {
    // On mobile analog: project crosshair along aim vector from player centre
    // On desktop: use raw mouse position as before
    let cx, cy;
    if (input.mobileAimActive) {
        const CROSSHAIR_DIST = 90; // px from player centre — tweak if needed
        const originX = player.x + player.w / 2;
        const originY = player.y + player.h / 2;
        cx = originX + player.aimX * CROSSHAIR_DIST;
        cy = originY + player.aimY * CROSSHAIR_DIST;
    } else {
        cx = input.mouseX;
        cy = input.mouseY;
    }
    ctx.strokeStyle = "#FF00FF";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy); ctx.lineTo(cx + 18, cy);
    ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy + 18);
    ctx.stroke();
}

function drawScene() {
    ctx.fillStyle = "#000011";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawStars();
    drawMoon();

    // ── Bumpy moon terrain (visual only — physics GROUND_Y unchanged) ──────────
    const terrainTop = GROUND_Y + player.h; // flat physics line, terrain draws from here down
    const tw = canvas.width;
    const scrollX = world.gameTime * gameSpeed() * 0.5; // scroll with world speed

    // Build terrain profile: gentle rolling hills using layered sines
    function terrainY(x) {
        const sx = x + scrollX;
        return terrainTop
            + Math.sin(sx * 0.018) * 5        // long gentle roll
            + Math.sin(sx * 0.047 + 1.3) * 3  // medium bumps
            + Math.sin(sx * 0.11  + 2.7) * 1.5 // small pebble texture
            + Math.sin(sx * 0.23  + 0.9) * 0.8; // micro detail
    }
    // Fill the terrain body (dark moon dirt)
    ctx.fillStyle = "#332211";
    ctx.beginPath();
    ctx.moveTo(0, terrainY(0));
    for (let x = 1; x <= tw; x++) {
        ctx.lineTo(x, terrainY(x));
    }
    ctx.lineTo(tw, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Top surface highlight strip (lighter layer)
    ctx.strokeStyle = "#55331A";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, terrainY(0));
    for (let x = 1; x <= tw; x++) {
        ctx.lineTo(x, terrainY(x));
    }
    ctx.stroke();

    // Bright rim line on top surface
    ctx.strokeStyle = "#7A5533";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, terrainY(0) - 1);
    for (let x = 1; x <= tw; x++) {
        ctx.lineTo(x, terrainY(x) - 1);
    }
    ctx.stroke();

    // Scattered surface pebbles/craters scrolled with terrain
    ctx.fillStyle = "#4A3020";
    const pebbleSeed = Math.floor(scrollX / 60);
    for (let p = 0; p < 18; p++) {
        // deterministic positions from seed so they don't flicker
        const px2 = ((pebbleSeed * 37 + p * 173) % tw + tw) % tw;
        const py2 = terrainY(px2) + 3 + ((p * 71) % 5);
        const pr  = 2 + (p % 3);
        ctx.beginPath(); ctx.arc(px2, py2, pr, 0, Math.PI * 2); ctx.fill();
    }
    // small crater rings
    ctx.strokeStyle = "#3A2515";
    ctx.lineWidth = 1;
    for (let c = 0; c < 5; c++) {
        const cx2 = ((pebbleSeed * 113 + c * 211) % tw + tw) % tw;
        const cy2 = terrainY(cx2) + 5;
        const cr  = 4 + (c % 4) * 2;
        ctx.beginPath(); ctx.arc(cx2, cy2, cr, Math.PI, Math.PI * 2); ctx.stroke();
    }


    obstacles.forEach(drawObstacle);
    enemies.forEach(drawEnemy);

    const pColors = { shield: "#33CCFF", rapid: "#FFCC00", doubleJump: "#88FF66", inc: "#FFAA33", health: "#FF6666" };
    const pLabels = { shield: "+SHLD", rapid: "+RPD", doubleJump: "+DBL", inc: "+INC", health: "+HLTH" };
    powerUps.forEach(p => {
        const color = pColors[p.type] || "#FFF";
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(p.x - 3, p.y - 3, p.w + 6, p.h + 6);
        ctx.fillStyle = color;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 11px Courier New";
        ctx.fillText(pLabels[p.type] || "+PWR", p.x - 8, p.y - 8);
    });

    enemyShots.forEach(s => {
        const isBossShot = s.w >= player.w || s.h >= player.h;
        if (isBossShot) {
            ctx.fillStyle = "rgba(255, 90, 20, 0.35)";
            ctx.fillRect(s.x - 3, s.y - 3, s.w + 6, s.h + 6);
            ctx.fillStyle = "#FF5522";
            ctx.fillRect(s.x, s.y, s.w, s.h);
            ctx.strokeStyle = "#FFD166";
            ctx.lineWidth = 2;
            ctx.strokeRect(s.x, s.y, s.w, s.h);
        } else {
            ctx.fillStyle = "#FF5522";
            ctx.fillRect(s.x, s.y, s.w, s.h);
        }
    });
    player.bullets.forEach(b => { ctx.fillStyle = "#00FF00"; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.fillStyle = "rgba(0,255,0,0.3)"; ctx.fillRect(b.x - 2, b.y - 1, b.w + 4, b.h + 2); });

    if (player.invincible <= 0 || Math.floor(player.invincible / 6) % 2 === 0) drawRover();

    particles.forEach(p => { ctx.globalAlpha = p.life / 24; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); });
    ctx.globalAlpha = 1;

    drawCrosshair();
    drawHUD();

    if (world.damageFlash > 0) {
        ctx.fillStyle = `rgba(255,0,0,${world.damageFlash * 0.03})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}
function drawMenu() {
    ctx.fillStyle = "#000011";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawStars();
    drawMoon();

    ctx.fillStyle = "#00FF00";
    ctx.font = "bold 58px Courier New";
    ctx.textAlign = "center";
    ctx.fillText("MOON PATROL", canvas.width / 2, 96);
    ctx.fillStyle = "#FF00FF";
    ctx.font = "20px Courier New";
    ctx.fillText("SPACE EDITION", canvas.width / 2, 132);

    ctx.fillStyle = "#00FFFF";
    ctx.font = "15px Courier New";
    ctx.fillText("Mission sectors + boss at every section end, power-ups, pause/settings", canvas.width / 2, 198);

    ctx.fillStyle = "#FFFF00";
    ctx.font = "bold 22px Courier New";
    ctx.fillText("PRESS ENTER TO START", canvas.width / 2, 320);

    ctx.fillStyle = "#44FF88";
    ctx.font = "16px Courier New";
    ctx.fillText(`HIGH SCORE: ${world.highScore}`, canvas.width / 2, 356);
    ctx.textAlign = "left";
}

function drawPause() {
    drawScene();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#FFFF00";
    ctx.font = "bold 40px Courier New";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", canvas.width / 2, 120);
    ctx.fillStyle = "#00FFFF";
    ctx.font = "16px Courier New";
    ctx.fillText(`Volume: ${world.settings.volume}% (- / =)`, canvas.width / 2, 190);
    ctx.fillText(`Aim Sensitivity: ${world.settings.aimSensitivity}% ([ / ])`, canvas.width / 2, 220);
    ctx.fillText("Press P or ESC to Resume", canvas.width / 2, 250);
    ctx.textAlign = "left";
}

function drawEnd(title, color) {
    ctx.fillStyle = "rgba(0,0,17,0.86)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = "bold 56px Courier New";
    ctx.textAlign = "center";
    ctx.fillText(title, canvas.width / 2, 120);
    ctx.fillStyle = "#FFFF00";
    ctx.font = "32px Courier New";
    ctx.fillText(`Score: ${Math.floor(world.score)}`, canvas.width / 2, 200);
    ctx.fillStyle = "#44FF88";
    ctx.font = "20px Courier New";
    ctx.fillText(`High Score: ${world.highScore}`, canvas.width / 2, 240);
    ctx.fillStyle = "#00FF00";
    ctx.font = "16px Courier New";
    ctx.fillText("PRESS ENTER TO RETURN TO MENU", canvas.width / 2, 310);
    ctx.textAlign = "left";
}

function draw() {
    ctx.save();
    if (world.shake > 0) ctx.translate((Math.random() - 0.5) * world.shake, (Math.random() - 0.5) * world.shake);

    if (world.state === GAME_STATE.MENU) drawMenu();
    else if (world.state === GAME_STATE.PLAYING) drawScene();
    else if (world.state === GAME_STATE.PAUSED) drawPause();
    else if (world.state === GAME_STATE.GAME_OVER) drawEnd("GAME OVER", "#FF0000");
    else if (world.state === GAME_STATE.VICTORY) drawEnd("MISSION COMPLETE", "#00FF88");

    ctx.restore();
}

function updateInput() {
    // M key toggle removed — auto mode only

    if (tapped("KeyP") || tapped("Escape")) {
        if (world.state === GAME_STATE.PLAYING) world.state = GAME_STATE.PAUSED;
        else if (world.state === GAME_STATE.PAUSED) world.state = GAME_STATE.PLAYING;
    }

    if (tapped("Enter")) {
        if (world.state === GAME_STATE.MENU) startGame();
        else if (world.state === GAME_STATE.GAME_OVER || world.state === GAME_STATE.VICTORY || world.state === GAME_STATE.OUTRO) world.state = GAME_STATE.MENU;
    }

    if (world.state === GAME_STATE.PAUSED) {
        if (tapped("Minus")) world.settings.volume = clamp(world.settings.volume - 5, 0, 100);
        if (tapped("Equal")) world.settings.volume = clamp(world.settings.volume + 5, 0, 100);
        if (tapped("BracketLeft")) world.settings.aimSensitivity = clamp(world.settings.aimSensitivity - 5, 40, 160);
        if (tapped("BracketRight")) world.settings.aimSensitivity = clamp(world.settings.aimSensitivity + 5, 40, 160);
        saveData();
    }
}

function updateGame() {
    if (world.state !== GAME_STATE.PLAYING) { syncPrev(); return; }
    world.playTick++;

    const advancingWorld = shouldAdvanceWorld();

    if (advancingWorld) {
        world.gameTime++;
        world.targetDifficulty = 1 + world.gameTime / 1600;
        world.difficulty += (world.targetDifficulty - world.difficulty) * 0.02;
        if (world.breather > 0) world.breather--;
        if (world.sectorClear > 0) world.sectorClear--;
        if (world.sectorAnnounce > 0) world.sectorAnnounce--;
        if (world.slowTimer > 0) world.slowTimer--;
        if (world.tutorial > 0) world.tutorial--;
    }

    maybeSpawnBoss();
    spawnObstacle();
    spawnEnemy();
    spawnAmbientPowerUp();

    updatePlayer();
    updateEntities();
    handleCollisions();

    const level = LEVELS[Math.min(world.levelIndex, LEVELS.length - 1)];
    const mainBossAlive = enemies.some(e => e.type === "boss");
    const midbossAlive  = enemies.some(e => e.type === "midboss");
    const anyBossAlive  = mainBossAlive || midbossAlive;

    // Sector 1: need score + boss spawned + boss killed
    const sector1done = world.bossesSpawnedThisSector >= 1 && world.bossesKilledThisSector >= 1 && !mainBossAlive;
    // Sector 2: also need minion wave spawned and cleared
    const sector2done = !level?.spawnMinions || (sector1done && world.bossesSpawnedThisSector >= 2 && !anyBossAlive);
    // Sector 3: also need both wardens dead
    const sector3done = !level?.midboss || (sector1done && world.bossesSpawnedThisSector >= 2 && !midbossAlive);

    const levelComplete = level && world.sectorScore >= level.targetScore && sector1done && sector2done && sector3done;

    if (levelComplete && world.sectorClear <= 0) {
        world.sectorClear = 180;
        world.breather = 180;
        world.levelIndex++;
        world.bossesSpawnedThisSector = 0;
        world.bossesKilledThisSector = 0;
        world.sectorScore = 0;
        // only announce if there's a real next sector (not the win condition)
        if (world.levelIndex < LEVELS.length) world.sectorAnnounce = 210;
        world.shake = Math.max(world.shake, 7);
    }
    if (world.levelIndex >= LEVELS.length) winGame();

    saveData();
    syncPrev();
}

function updateOutro() {
    world.outroTick++;
    world.playTick++;
    world.gameTime++;

    // keep rover animating — run player update so wheels spin and rover stays on ground
    updatePlayer();

    // scroll finish line toward player
    world.finishLineX -= 1.8;

    // when rover reaches finish line
    if (world.finishLineX <= player.x + player.w + 10) {
        world.state = GAME_STATE.VICTORY;
        saveData();
    }
}

function drawDigitalCat(x, y, tick) {
    const w = 110, h = 90;
    const cx = x + w / 2, cy = y + h / 2;
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);
    const blink = Math.floor(tick / 40) % 5 !== 0;

    ctx.fillStyle = `rgba(0,255,200,${pulse * 0.15})`;
    ctx.beginPath(); ctx.ellipse(cx, cy, w / 2 + 14, h / 2 + 10, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#0A1A1A";
    ctx.strokeStyle = `rgba(0,255,180,${0.6 + pulse * 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x + 8, y + 22, w - 16, h - 22, 12); ctx.fill(); ctx.stroke();

    // ears
    ctx.fillStyle = "#0A1A1A";
    ctx.strokeStyle = `rgba(0,255,180,${0.6 + pulse * 0.4})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 14, y + 26); ctx.lineTo(x + 6, y + 2); ctx.lineTo(x + 30, y + 20); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - 14, y + 26); ctx.lineTo(x + w - 6, y + 2); ctx.lineTo(x + w - 30, y + 20); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = `rgba(0,255,180,${0.3 + pulse * 0.3})`;
    ctx.beginPath(); ctx.moveTo(x + 14, y + 23); ctx.lineTo(x + 10, y + 8); ctx.lineTo(x + 26, y + 21); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w - 14, y + 23); ctx.lineTo(x + w - 10, y + 8); ctx.lineTo(x + w - 26, y + 21); ctx.closePath(); ctx.fill();

    ctx.fillStyle = "#0D2020";
    ctx.beginPath(); ctx.ellipse(cx, y + 46, 30, 24, 0, 0, Math.PI * 2); ctx.fill();

    if (blink) {
        ctx.fillStyle = `rgba(0,255,200,${0.8 + pulse * 0.2})`;
        ctx.beginPath(); ctx.ellipse(cx - 11, y + 40, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 11, y + 40, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#001A14";
        ctx.beginPath(); ctx.ellipse(cx - 11, y + 41, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 11, y + 41, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath(); ctx.arc(cx - 9, y + 38, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 13, y + 38, 2, 0, Math.PI * 2); ctx.fill();
    } else {
        ctx.strokeStyle = `rgba(0,255,180,0.9)`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cx - 17, y + 41); ctx.lineTo(cx - 5, y + 41); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 5, y + 41); ctx.lineTo(cx + 17, y + 41); ctx.stroke();
    }

    ctx.fillStyle = `rgba(0,255,180,${0.7 + pulse * 0.3})`;
    ctx.beginPath(); ctx.moveTo(cx, y + 49); ctx.lineTo(cx - 4, y + 54); ctx.lineTo(cx + 4, y + 54); ctx.closePath(); ctx.fill();

    ctx.strokeStyle = `rgba(0,255,180,0.8)`; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 10, y + 56); ctx.lineTo(cx - 4, y + 61);
    ctx.lineTo(cx, y + 57); ctx.lineTo(cx + 4, y + 61); ctx.lineTo(cx + 10, y + 56);
    ctx.stroke();

    ctx.strokeStyle = `rgba(0,255,200,${0.4 + pulse * 0.3})`; ctx.lineWidth = 1;
    for (const [ox, dir] of [[-1, -1], [1, 1]]) {
        for (const wy of [-2, 2, 6]) {
            ctx.beginPath(); ctx.moveTo(cx + ox * 6, y + 52 + wy); ctx.lineTo(cx + ox * 6 + dir * 22, y + 51 + wy + dir); ctx.stroke();
        }
    }

    ctx.strokeStyle = `rgba(0,255,180,${0.15 + pulse * 0.1})`; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 65); ctx.lineTo(x + 30, y + 65); ctx.lineTo(x + 30, y + 75); ctx.lineTo(x + 45, y + 75);
    ctx.moveTo(x + w - 18, y + 68); ctx.lineTo(x + w - 32, y + 68); ctx.lineTo(x + w - 32, y + 78);
    ctx.stroke();
}

function drawFinishLine(x) {
    const groundY = GROUND_Y + 25;
    const poleH = 90, flagW = 50;
    ctx.strokeStyle = "#AAAAAA"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x, groundY - poleH); ctx.stroke();
    const cols = 5, rows = 4, cw = flagW / cols, ch = 16 / rows;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? "#FFFFFF" : "#111111";
            ctx.fillRect(x + c * cw, groundY - poleH + r * ch, cw, ch);
        }
    }
    ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1;
    ctx.strokeRect(x, groundY - poleH, flagW, 16);
    for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)";
        ctx.fillRect(x + i * 8, groundY - 6, 8, 6);
    }
    ctx.fillStyle = "#FFFF00"; ctx.font = "bold 13px Courier New"; ctx.textAlign = "center";
    ctx.fillText("FINISH", x + flagW / 2, groundY - poleH - 6);
    ctx.textAlign = "left";
}

function drawOutro() {
    // reuse drawScene for background + terrain
    drawScene();
    // floating cat bobs above the finish line
    const catX = world.finishLineX - 20;
    const catY = 60 + Math.sin(world.outroTick * 0.05) * 10;
    drawDigitalCat(catX, catY, world.outroTick);
    drawFinishLine(world.finishLineX);
}

function gameLoop() {
    updateInput();
    if (world.shake > 0) world.shake--;
    if (world.damageFlash > 0) world.damageFlash--;
    if (world.state === GAME_STATE.PLAYING) updateGame();
    else if (world.state === GAME_STATE.OUTRO) updateOutro();
    if (world.state === GAME_STATE.OUTRO) drawOutro();
    else draw();
    requestAnimationFrame(gameLoop);
}

function setupInput() {
    // ── Keyboard ──────────────────────────────────────────────────────────────
    document.addEventListener("keydown", e => {
        input.keys[e.code] = true;
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    });
    document.addEventListener("keyup", e => { input.keys[e.code] = false; });
    window.addEventListener("blur", () => {
        input.keys = {};
        input.prev = {};
        input.clicked = false;
        input.mobileShooting = false;
        input.mobileJump = false;
        input.mobileAimActive = false;
    });

    // ── Mouse aim (desktop) ───────────────────────────────────────────────────
    canvas.addEventListener("mousemove", e => {
        const r = canvas.getBoundingClientRect();
        input.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
        input.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener("mousedown", e => { if (e.button === 0) input.clicked = true; });

    // ── Mobile: Jump button (left side) ──────────────────────────────────────
    const btnJump = document.getElementById("btn-jump");
    if (btnJump) {
        const onJumpDown = ev => { ev.preventDefault(); input.mobileJump = true; };
        btnJump.addEventListener("touchstart", onJumpDown, { passive: false });
        btnJump.addEventListener("mousedown", onJumpDown);
    }

    // ── Mobile: Shoot button (left side, continuous fire) ────────────────────
    const btnShoot = document.getElementById("btn-shoot");
    if (btnShoot) {
        const onShootDown = ev => { ev.preventDefault(); input.mobileShooting = true; };
        const onShootUp   = ev => { ev.preventDefault(); input.mobileShooting = false; };
        btnShoot.addEventListener("touchstart",  onShootDown, { passive: false });
        btnShoot.addEventListener("touchend",    onShootUp,   { passive: false });
        btnShoot.addEventListener("touchcancel", onShootUp,   { passive: false });
        btnShoot.addEventListener("mousedown",   onShootDown);
        btnShoot.addEventListener("mouseup",     onShootUp);
        btnShoot.addEventListener("mouseleave",  onShootUp);
    }

    // ── Mobile: Analog stick (right side, aim only) ──────────────────────────
    // TWEAK: ANALOG_RADIUS controls how far you drag before hitting max aim angle.
    // Increase for a larger dead zone / slower response; decrease for hair-trigger.
    const ANALOG_RADIUS = 50; // px in screen space
    const stick = document.getElementById("analog-stick");
    const stickKnob = document.getElementById("analog-knob");
    let stickOrigin = null; // {x, y} of touch start

    const getStickPos = (touch, el) => {
        const r = el.getBoundingClientRect();
        return { x: touch.clientX - r.left - r.width / 2, y: touch.clientY - r.top - r.height / 2 };
    };

    if (stick && stickKnob) {
        stick.addEventListener("touchstart", ev => {
            ev.preventDefault();
            const t = ev.changedTouches[0];
            stickOrigin = { x: t.clientX, y: t.clientY };
            input.mobileAimActive = true;
        }, { passive: false });

        stick.addEventListener("touchmove", ev => {
            ev.preventDefault();
            if (!stickOrigin) return;
            const t = ev.changedTouches[0];
            const dx = t.clientX - stickOrigin.x;
            const dy = t.clientY - stickOrigin.y;
            const dist = Math.hypot(dx, dy) || 1;
            // Normalise aim direction
            input.mobileAimX = dx / dist;
            input.mobileAimY = dy / dist;
            // Move knob visually, clamped to radius
            const clampedDist = Math.min(dist, ANALOG_RADIUS);
            const angle = Math.atan2(dy, dx);
            stickKnob.style.transform = `translate(-50%, -50%) translate(${Math.cos(angle) * clampedDist}px, ${Math.sin(angle) * clampedDist}px)`;
        }, { passive: false });

        const onStickUp = ev => {
            ev.preventDefault();
            stickOrigin = null;
            input.mobileAimActive = false;
            // Default aim forward-right when released
            input.mobileAimX = 1;
            input.mobileAimY = 0;
            stickKnob.style.transform = "translate(-50%, -50%)";
        };
        stick.addEventListener("touchend",    onStickUp, { passive: false });
        stick.addEventListener("touchcancel", onStickUp, { passive: false });
    }

    // ── Pause button ─────────────────────────────────────────────────────────
    const pause = document.getElementById("btn-pause");
    if (pause) {
        pause.addEventListener("click", () => {
            if (world.state === GAME_STATE.PLAYING) world.state = GAME_STATE.PAUSED;
            else if (world.state === GAME_STATE.PAUSED) world.state = GAME_STATE.PLAYING;
        });
    }

    // ── Enter / start on tap (mobile menu) ───────────────────────────────────
    canvas.addEventListener("touchstart", ev => {
        ev.preventDefault();
        if (world.state === GAME_STATE.MENU) input.keys["Enter"] = true;
        if (world.state === GAME_STATE.GAME_OVER || world.state === GAME_STATE.VICTORY) input.keys["Enter"] = true;
    }, { passive: false });
    canvas.addEventListener("touchend", () => { input.keys["Enter"] = false; });
}

function setupResponsive() {
    const resize = () => {
        const w = clamp(Math.min(window.innerWidth - 16, BASE_W), 320, BASE_W);
        const h = Math.floor(w / (BASE_W / BASE_H));
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
    };
    window.addEventListener("resize", resize);
    resize();
}

loadData();
createStars();
setupInput();
setupResponsive();
gameLoop();