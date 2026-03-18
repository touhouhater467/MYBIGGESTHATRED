const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvasCtx = canvasElement.getContext('2d');
const loadingText = document.getElementById('loading');

// Game State
let frameCount = 0;
let score = 0;

// Player (The Finger) State
const player = {
    hp: 5,
    maxHp: 5,
    iFrames: 0,
    hitboxRadius: 4, // Tiny hitbox for tight dodges!
    auraRadius: 20   // Visual representation of the finger
};

// Entities Arrays
let enemies = [];
let bullets = [];

// Setup MediaPipe
const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

// Bind the onResults function
hands.onResults(onResults);

// Initialize the camera
const camera = new Camera(videoElement, {
    onFrame: async () => { await hands.send({image: videoElement}); },
    width: 800, height: 600
});

// Start the camera and hide loading text
camera.start().then(() => { loadingText.style.display = 'none'; });

function spawnEnemy() {
    enemies.push({
        x: 100 + Math.random() * (canvasElement.width - 200),
        y: 100 + Math.random() * 150, // Spawn in the upper quadrant
        radius: 25,
        angle: 0,
        moveAngle: Math.random() * Math.PI * 2,
        type: Math.random() > 0.5 ? 'spiral' : 'ring' // Two pattern types
    });
}

// Spawn initial enemy
spawnEnemy();

function onResults(results) {
    frameCount++;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw webcam feed slightly darkened so bullets pop out
    canvasCtx.globalAlpha = 0.6;
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.globalAlpha = 1.0;

    // Check for Game Over
    if (player.hp <= 0) {
        canvasCtx.fillStyle = '#ff0000';
        canvasCtx.font = 'bold 50px sans-serif';
        canvasCtx.textAlign = 'center';
        canvasCtx.fillText("GAME OVER", canvasElement.width / 2, canvasElement.height / 2);
        canvasCtx.fillStyle = '#ffffff';
        canvasCtx.font = '20px sans-serif';
        canvasCtx.fillText(`Enemies Destroyed: ${score}`, canvasElement.width / 2, canvasElement.height / 2 + 40);
        canvasCtx.restore();
        return;
    }

    // Decrease I-frames
    if (player.iFrames > 0) player.iFrames--;

    // Handle Hand Tracking & Collisions
    let fingerX = null;
    let fingerY = null;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const indexFingerTip = results.multiHandLandmarks[0][8];
        fingerX = indexFingerTip.x * canvasElement.width;
        fingerY = indexFingerTip.y * canvasElement.height;

        // Draw Player Finger Aura
        canvasCtx.beginPath();
        canvasCtx.arc(fingerX, fingerY, player.auraRadius, 0, 2 * Math.PI);
        canvasCtx.fillStyle = player.iFrames > 0 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 255, 255, 0.4)';
        canvasCtx.fill();

        // Draw Player Core Hitbox
        canvasCtx.beginPath();
        canvasCtx.arc(fingerX, fingerY, player.hitboxRadius, 0, 2 * Math.PI);
        canvasCtx.fillStyle = '#ffffff'; 
        canvasCtx.shadowBlur = 10;
        canvasCtx.shadowColor = '#ffffff';
        canvasCtx.fill();
        canvasCtx.shadowBlur = 0;
    }

    // Update & Draw Enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        
        // Slow floating movement
        e.x += Math.cos(e.moveAngle) * 1;
        e.y += Math.sin(e.moveAngle) * 0.5;
        if (e.x < 50 || e.x > canvasElement.width - 50) e.moveAngle = Math.PI - e.moveAngle;
        if (e.y < 50 || e.y > 300) e.moveAngle = -e.moveAngle;

        // Shooting Logic
        if (e.type === 'spiral' && frameCount % 3 === 0) {
            e.angle += 0.25;
            for (let j = 0; j < 4; j++) {
                let a = e.angle + (Math.PI / 2) * j;
                bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, radius: 5, color: '#ff3366' });
            }
        } else if (e.type === 'ring' && frameCount % 60 === 0) {
            for (let j = 0; j < 24; j++) {
                let a = (Math.PI * 2 / 24) * j + e.angle;
                bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, radius: 6, color: '#33ffcc' });
            }
            e.angle += 0.1;
        }

        // Collision: Finger vs Enemy (Destroy Enemy)
        if (fingerX !== null && fingerY !== null) {
            const dx = fingerX - e.x;
            const dy = fingerY - e.y;
            if (Math.sqrt(dx * dx + dy * dy) < player.auraRadius + e.radius) {
                enemies.splice(i, 1);
                score++;
                setTimeout(spawnEnemy, 1000); 
                continue;
            }
        }

        // Draw Enemy
        canvasCtx.beginPath();
        canvasCtx.arc(e.x, e.y, e.radius, 0, 2 * Math.PI);
        canvasCtx.fillStyle = '#8800ff';
        canvasCtx.shadowBlur = 20;
        canvasCtx.shadowColor = '#ff00ff';
        canvasCtx.fill();
        canvasCtx.shadowBlur = 0;
    }

    // Update & Draw Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        // Remove off-screen bullets
        if (b.x < -20 || b.x > canvasElement.width + 20 || b.y < -20 || b.y > canvasElement.height + 20) {
            bullets.splice(i, 1);
            continue;
        }

        // Collision: Bullet vs Finger Hitbox (Take Damage)
        if (fingerX !== null && fingerY !== null && player.iFrames === 0) {
            const dx = fingerX - b.x;
            const dy = fingerY - b.y;
            if (Math.sqrt(dx * dx + dy * dy) < player.hitboxRadius + b.radius) {
                player.hp--;
                player.iFrames = 60; // 2 seconds of invulnerability
            }
        }

        // Draw Bullet
        canvasCtx.beginPath();
        canvasCtx.arc(b.x, b.y, b.radius, 0, 2 * Math.PI);
        canvasCtx.fillStyle = '#ffffff';
        canvasCtx.fill();
        
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = b.color;
        canvasCtx.stroke();
    }

    // Draw HUD
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.font = '24px sans-serif';
    canvasCtx.textAlign = 'left';
    canvasCtx.fillText(`HP: ${player.hp} / ${player.maxHp}`, 20, 40);
    
    canvasCtx.textAlign = 'right';
    canvasCtx.fillText(`Score: ${score}`, canvasElement.width - 20, 40);

    canvasCtx.restore();
}