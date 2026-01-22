// ==========================================
// GAME LOGIC & MINIGAMES
// ==========================================

const COIN_MANAGER_URL = "https://script.google.com/macros/s/AKfycbyMTW3WIJmSDQUmGq6GDVAz0AkKIaghNcFf5mEsfS4skWJM2YTTh65Pt85vVnJqwklq/exec";

// Init Game Logic called from window.onload in tennis_logic.js
function initGameLogic() {
    fetchCoinData();
    
    // Event Listeners for Game
    if (typeof handleCardTilt === 'function') {
        window.addEventListener('deviceorientation', handleCardTilt);
    }
    if (typeof handleCardMouseTilt === 'function') {
        document.addEventListener('mousemove', handleCardMouseTilt);
    }
    
    // Page Leave Event (Flush Coins)
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushPendingCoins();
        }
    });
}

// --- COIN DATA ---
async function fetchCoinData() {
    try {
        const res = await fetch(COIN_MANAGER_URL);
        globalCoinBalances = await res.json();
        // Function from tennis_logic.js
        if(typeof updateUserDisplay === 'function') updateUserDisplay();
        
        // Update Ranking if data is ready
        if (typeof renderCoinRanking === 'function') renderCoinRanking();
    } catch(e) { console.error("Coin Data Error", e); }
}

function getUserTotalCoins(name) {
    if(!name) return 0;
    // playerStatsGlobal comes from tennis_logic.js
    const pStats = (typeof playerStatsGlobal !== 'undefined' ? playerStatsGlobal[name] : null) || { wins: 0, games: 0 };
    const variable = globalCoinBalances[name] || 0;
    return (pStats.wins * 50) + (pStats.games * 10) + variable;
}

// Render Coin Ranking in Game Page
function renderCoinRanking() {
    const container = document.getElementById('coinRankingList');
    if(!container) return; // Not on page or element missing
    
    // Check if we have player data (Global var from tennis_logic.js)
    if(typeof playerStatsGlobal === 'undefined' || Object.keys(playerStatsGlobal).length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#666;">LOADING...</div>';
        return;
    }

    const rankingData = [];
    Object.keys(playerStatsGlobal).forEach(name => {
        if (name === '_max') return;
        const total = getUserTotalCoins(name);
        rankingData.push({ name: name, coins: total });
    });

    // Sort desc
    rankingData.sort((a, b) => b.coins - a.coins);

    let html = '';
    rankingData.forEach((p, i) => {
        const rankClass = i === 0 ? 'top1' : '';
        const rankIcon = i === 0 ? '👑' : (i+1) + '.';
        html += `
            <div class="coin-ranking-item ${rankClass}">
                <div class="coin-ranking-rank">${rankIcon}</div>
                <div class="coin-ranking-name">${p.name}</div>
                <div class="coin-ranking-val">${p.coins.toLocaleString()}</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

/**
 * Transaction Logic
 */
function sendCoinTransaction(name, amount, reason, isBatch = true) {
    if(!globalCoinBalances[name]) globalCoinBalances[name]=0;
    globalCoinBalances[name] += amount;
    
    // UI Update
    if(typeof updateUserDisplay === 'function') updateUserDisplay();
    if(document.getElementById('view-mypage').classList.contains('active')) renderMyPage();
    // Update Ranking realtime
    renderCoinRanking();
    
    // Update Slot Credit UI if open
    updateSlotCreditUI();

    if (isBatch) {
        pendingBalance += amount;
    } else {
        fetch(COIN_MANAGER_URL, {
            method: 'POST', mode: 'no-cors',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: name, amount: amount, reason: reason})
        });
    }
}

function flushPendingCoins() {
    if (pendingBalance === 0 || !currentUser) return;
    
    const amountToSend = pendingBalance;
    pendingBalance = 0;
    
    fetch(COIN_MANAGER_URL, {
        method: 'POST', mode: 'no-cors',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: currentUser.name, amount: amountToSend, reason: "Game Session (Batch)"})
    });
    console.log(`Flushed: ${amountToSend}`);
}

// --- MY PAGE RENDERER (Overwrites tennis_logic.js default if loaded) ---
function renderMyPage() {
    if (!currentUser) return;
    
    const name = currentUser.name;
    const pStats = (typeof playerStatsGlobal !== 'undefined' ? playerStatsGlobal[name] : null) || { wins: 0, losses: 0, games: 0, mvpCount: 0, matches: 0 };
    
    // Function from tennis_logic.js
    const rankInfo = (typeof getRankInfo === 'function') ? getRankInfo(pStats.games) : {current:{icon:'?',name:'?'}, next:null};
    const nextRank = rankInfo.next;
    let expText = "MAX RANK";
    let barW = 100;
    
    if (nextRank) {
        const range = nextRank.min - rankInfo.current.min;
        const currentExp = pStats.games - rankInfo.current.min;
        barW = Math.min((currentExp / range) * 100, 100);
        expText = `NEXT RANK: ${nextRank.min - pStats.games} EXP`;
    }
    
    const variable = globalCoinBalances[name] || 0;
    const coins = (pStats.wins * 50) + (pStats.games * 10) + variable;
    
    const storedAvatar = localStorage.getItem(`avatar_${name}`);
    let avatarStyle = '';
    let avatarContent = name.charAt(0);
    
    if(storedAvatar) {
        avatarStyle = `background-image: url(${storedAvatar}); background-size: cover; background-position: center; color: transparent;`;
        avatarContent = '';
    }
    
    // Inventory
    const hasCard = localStorage.getItem(`has_imada_card_${name}`);
    let inventoryHtml = '';
    if(hasCard) {
        inventoryHtml = `
            <div class="inventory-area">
                <div style="font-size:0.8rem; color:#00ffff; letter-spacing:2px; margin-bottom:10px;">INVENTORY</div>
                <div class="inv-grid">
                    <div class="inv-item" style="background-image:url('./今田美桜.png');" onclick="showCard()"></div>
                </div>
            </div>
        `;
    }

    // Daily Bonus
    const lastBonus = localStorage.getItem(`last_bonus_date_${name}`);
    const todayStr = new Date().toDateString();
    const canClaim = lastBonus !== todayStr;
    const btnDisabled = canClaim ? '' : 'disabled';
    const btnText = canClaim ? 'DAILY BONUS (+500)' : 'BONUS CLAIMED';
    
    const html = `
        <div class="mypage-header">
            <div class="mypage-avatar-large" style="${avatarStyle}" onclick="document.getElementById('avatarInput').click()">
                ${avatarContent}
            </div>
            <div class="mypage-name">${name}</div>
            <div class="mypage-title">${rankInfo.current.icon} ${rankInfo.current.name}</div>
        </div>
        
        <div class="rank-info-area">
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:5px; color:#aaa;">
                <span>EXP: ${pStats.games}</span>
                <span>${expText}</span>
            </div>
            <div class="rank-bar-bg"><div class="rank-bar-fill" style="width:${barW}%"></div></div>
        </div>
        
        <div class="mypage-coin-area">
            <div class="coin-val">${coins.toLocaleString()}</div>
            <div class="coin-label">CRYPTO COINS</div>
            <button class="daily-bonus-btn" onclick="claimDailyBonus()" ${btnDisabled}>${btnText}</button>
        </div>
        
        ${inventoryHtml}
        
        <div class="section-title" style="margin-top:30px;">COMBAT STATS</div>
        <div class="dashboard-grid">
            <div class="stat-card"><div class="stat-label">VICTORIES</div><div class="stat-value highlight">${pStats.wins}</div></div>
            <div class="stat-card"><div class="stat-label">MATCHES</div><div class="stat-value">${pStats.matches}</div></div>
            <div class="stat-card"><div class="stat-label">WIN RATE</div><div class="stat-value">${pStats.matches > 0 ? ((pStats.wins/pStats.matches)*100).toFixed(1) : 0}%</div></div>
            <div class="stat-card"><div class="stat-label">MVP</div><div class="stat-value">${pStats.mvpCount}</div></div>
        </div>
        
        <div style="text-align:center;">
            <button class="btn-logout" onclick="handleLogout()">LOGOUT</button>
        </div>
    `;
    
    document.getElementById('myPageContent').innerHTML = html;
    document.getElementById('pageTitle').textContent = "MY PAGE";
}

function claimDailyBonus() {
    if(!currentUser) return;
    const name = currentUser.name;
    const todayStr = new Date().toDateString();
    localStorage.setItem(`last_bonus_date_${name}`, todayStr);
    sendCoinTransaction(name, 500, "Daily Bonus", false);
    showToast("BONUS RECEIVED: +500");
    renderMyPage();
}

function handleAvatarUpload(input) {
    if (input.files && input.files[0] && currentUser) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result;
            localStorage.setItem(`avatar_${currentUser.name}`, base64);
            renderMyPage();
            showToast("AVATAR UPDATED");
        }
        reader.readAsDataURL(input.files[0]);
    }
}

// --- CARD VIEW LOGIC ---
function showCard() {
    document.getElementById('cardViewModal').style.display = 'flex';
}
function closeCardView() {
    document.getElementById('cardViewModal').style.display = 'none';
    const card = document.getElementById('holoCard');
    if(card) card.style.transform = `rotateY(0deg) rotateX(0deg)`;
}

function handleCardTilt(event) {
    if(document.getElementById('cardViewModal').style.display !== 'flex') return;
    const card = document.getElementById('holoCard');
    const glare = document.querySelector('.holo-glare');
    
    let x = event.beta; 
    let y = event.gamma;
    if (x > 45) x = 45; if (x < -45) x = -45;
    if (y > 45) y = 45; if (y < -45) y = -45;
    
    card.style.transform = `rotateY(${y}deg) rotateX(${-x}deg)`;
    const gx = 50 + (y * 2);
    const gy = 50 + (x * 2);
    glare.style.backgroundPosition = `${gx}% ${gy}%`;
}

function handleCardMouseTilt(e) {
    if(document.getElementById('cardViewModal').style.display !== 'flex') return;
    const card = document.getElementById('holoCard');
    const glare = document.querySelector('.holo-glare');
    
    const w = window.innerWidth;
    const h = window.innerHeight;
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    const yRotation = ((mouseX - w / 2) / w) * 60;
    const xRotation = ((mouseY - h / 2) / h) * 60;
    
    card.style.transform = `rotateY(${yRotation}deg) rotateX(${-xRotation}deg)`;
    const gx = 50 + (yRotation * 2);
    const gy = 50 + (xRotation * 2);
    glare.style.backgroundPosition = `${gx}% ${gy}%`;
}

// --- COIN GAME ---
window.openCoinGame = function() { 
    document.getElementById('coinGameModal').style.display='flex'; 
    const c = document.getElementById('gameCoin');
    if(c) {
        c.classList.remove('spinning'); 
        c.textContent="TAP";
    }
}

window.closeGameModal = function(modalId) {
    const el = document.getElementById(modalId);
    if(el) el.style.display = 'none';
    if (modalId === 'slotGameModal') {
        flushPendingCoins(); 
    }
}

window.playCoinToss = function() {
    const c = document.getElementById('gameCoin');
    if(!c || c.classList.contains('spinning')) return;
    c.classList.add('spinning'); 
    c.textContent="";
    setTimeout(() => { 
        c.classList.remove('spinning'); 
        c.textContent = Math.random() < 0.5 ? "HEAD" : "TAIL"; 
    }, 1000);
}

// --- SLOT GAME ---
const slotSymbols = ['🍒', '🔔', '💎', '7️⃣', '❌', '🌙'];
let isSpinning = false;
let reelIntervals = [null, null, null];
let reelStopped = [true, true, true];
let reelResults = [null, null, null];
let isMoonWinRound = false; // Flag for forced win

window.openSlotGame = function() { 
    document.getElementById('slotGameModal').style.display='flex';
    updateSlotCreditUI();
}

function updateSlotCreditUI() {
    if(!currentUser) return;
    const current = getUserTotalCoins(currentUser.name);
    const el = document.getElementById('slotCredit');
    if(el) el.textContent = `CREDIT: ${current.toLocaleString()}`;
}

window.spinSlot = function() {
    if(isSpinning) return;
    if(!currentUser) return showToast("LOGIN REQUIRED");
    
    const currentCoins = getUserTotalCoins(currentUser.name);
    if(currentCoins < 20) return showToast(`NO COINS (REQ: 20)`);

    sendCoinTransaction(currentUser.name, -20, "Slot Spin", true);
    
    isMoonWinRound = Math.random() < 0.2; 
    
    isSpinning = true;
    document.getElementById('slotMsg').textContent = isMoonWinRound ? "CHANCE MODE!" : "SPINNING...";
    reelStopped = [false, false, false];
    reelResults = [null, null, null];
    
    const stop1 = document.getElementById('stop1');
    const stop2 = document.getElementById('stop2');
    const stop3 = document.getElementById('stop3');
    if(stop1) stop1.disabled = false;
    if(stop2) stop2.disabled = false;
    if(stop3) stop3.disabled = false;
    
    const lever = document.querySelector('.lever-container');
    if(lever) {
        lever.classList.add('pull-lever');
        setTimeout(() => lever.classList.remove('pull-lever'), 600);
    }
    
    [0, 1, 2].forEach(i => {
        const el = document.getElementById(`reel${i+1}`);
        if(reelIntervals[i]) clearInterval(reelIntervals[i]);
        reelIntervals[i] = setInterval(() => { 
            el.textContent = slotSymbols[Math.floor(Math.random()*slotSymbols.length)]; 
        }, 80);
    });
}

window.stopReel = function(index) {
    if(reelStopped[index]) return;
    
    clearInterval(reelIntervals[index]);
    const el = document.getElementById(`reel${index+1}`);
    
    let sym;
    if (isMoonWinRound) {
        sym = '🌙';
    } else {
        sym = slotSymbols[Math.floor(Math.random()*slotSymbols.length)];
    }
    
    el.textContent = sym;
    reelResults[index] = sym;
    reelStopped[index] = true;
    
    document.getElementById(`stop${index+1}`).disabled = true;
    
    if(reelStopped[0] && reelStopped[1] && reelStopped[2]) {
        finishSlot(reelResults);
    }
}

function finishSlot(res) {
    isSpinning = false;
    let r=0, m="NO LUCK";
    
    if(res[0]==='🌙'&&res[1]==='🌙'&&res[2]==='🌙') { r=100; m="MOON BONUS!"; }
    else if(res[0]==='7️⃣'&&res[1]==='7️⃣'&&res[2]==='7️⃣'){ r=7777; m="JACKPOT!!"; }
    else if(res[0]==='💎'&&res[1]==='💎'&&res[2]==='💎'){ r=1000; m="BIG WIN!"; }
    else if(res[0]==='🔔'&&res[1]==='🔔'&&res[2]==='🔔'){ r=500; m="NICE!"; }
    else if(res[0]==='🍒'&&res[1]==='🍒'&&res[2]==='🍒'){ r=300; m="GOOD!"; }
    else if(res.includes('7️⃣')){ r=50; m="REPLAY"; }
    
    document.getElementById('slotMsg').textContent = m + (r>0 ? ` +${r} COINS` : "");
    if(r>0) {
        sendCoinTransaction(currentUser.name, r, "Slot Win", true);
        showToast(m + ` (+${r})`);
    }
}

// --- SHOP LOGIC ---
let holdTimer = null;
window.openShop = function() { document.getElementById('shopModal').style.display='flex'; }

window.startHold = function(btn, e) {
    if(e && e.type === 'touchstart') e.preventDefault();
    btn.classList.add('holding');
    holdTimer = setTimeout(() => buyItem(), 1500); 
}

window.endHold = function(btn) { 
    clearTimeout(holdTimer); 
    btn.classList.remove('holding'); 
}

function buyItem() {
    const btn = document.querySelector('.hold-btn');
    btn.classList.remove('holding');
    
    if(!currentUser) return showToast("LOGIN REQUIRED");
    const currentCoins = getUserTotalCoins(currentUser.name);
    
    if(currentCoins < 10000) return showToast(`NOT ENOUGH COINS`);
    
    if(localStorage.getItem(`has_imada_card_${currentUser.name}`)) {
        return showToast("ALREADY OWNED");
    }

    sendCoinTransaction(currentUser.name, -10000, "Buy Card: Imada", false);
    localStorage.setItem(`has_imada_card_${currentUser.name}`, 'true');
    showToast("PURCHASE SUCCESSFUL!");
    
    setTimeout(() => {
        document.getElementById('shopModal').style.display='none';
        if(document.getElementById('view-mypage').classList.contains('active')) renderMyPage();
    }, 1000);
}
