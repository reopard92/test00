// ==========================================
// CODE NAME: 48 - INTEGRATED LOGIC
// ==========================================

// --- CONFIGURATION ---
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzoybbIaxOq4EtWaBkvdPNzkN1_7lmFRnAQLbnu6A40YUQdbzX6gTfIY5CznZs13GYxZw/exec";
const SCHEDULE_GAS_URL = "https://script.google.com/macros/s/AKfycbxkywDklSyaMf93hYhG-ULAyAEQ1qHGgaYjNewTxX34pfySOZKYsbwehygCccEvnchB/exec";
const COIN_MANAGER_URL = "https://script.google.com/macros/s/AKfycbyMTW3WIJmSDQUmGq6GDVAz0AkKIaghNcFf5mEsfS4skWJM2YTTh65Pt85vVnJqwklq/exec";

// Auth Sheet Info
const AUTH_SHEET_ID = '18J_8wm-Qc3yRV-eEwdtB_55CYOAsVGy26AIU7aCvSQw';
const AUTH_SHEET_GID = '835965305';

const members = ["周平", "すが", "凌矢", "祐介", "志村", "カトケン", "小田"];
const STORAGE_KEY = 'tennis_match_data_v7_holo';
const LOGIN_KEY = 'tennis_user_auth';
const CREW_RANKS = [
    { name: '候補生',     min: 0,   icon: '🌑' },
    { name: 'パイロット', min: 100,  icon: '🛸' },
    { name: '士官',       min: 300,  icon: '🛰️' },
    { name: '指揮官',     min: 600,  icon: '🚀' },
    { name: '艦長',       min: 1000, icon: '🪐' },
    { name: '提督',       min: 2000, icon: '🌌' }
];

// --- GLOBAL VARIABLES ---
let isEditMode = false;
let isLoading = false;
let playerStatsGlobal = {};
let radarChartInstance = null;
let historyChartInstance = null;
let winRateChartInstance = null;
let currentCourtCost = 4500;

let rawAnalysisRankings = [];
let rawAnalysisMatches = [];
let currentSector = 'ALL';

// Schedule & User Data
let globalScheduleData = [];
let currentUser = null;

// Game Data
let globalCoinBalances = {};
let pendingBalance = 0; // Batch variable for slots

// --- INITIALIZATION ---
window.onload = function() {
    initAuth();
    initSelectors();
    
    // Set Date
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateEl = document.getElementById('matchDate');
    if(dateEl) dateEl.textContent = `${yyyy}-${mm}-${dd}`;
    
    // Fetch All Data
    fetchAnalysisData();
    fetchScheduleData();
    fetchWeather();
    fetchCoinData();
    
    // Restore last view
    const lastView = sessionStorage.getItem('lastView');
    if (lastView) {
        switchMainView(lastView);
    } else {
        switchMainView('top'); 
    }

    setTimeout(() => {
        const ls = document.getElementById('loadingScreen');
        if(ls) {
            ls.style.opacity = 0;
            setTimeout(() => { ls.style.display = 'none'; }, 800);
        }
    }, 1000);
    
    // Event Listeners
    setupSwipeGestures();
    
    // Game Event Listeners
    window.addEventListener('deviceorientation', handleCardTilt);
    document.addEventListener('mousemove', handleCardMouseTilt);
    
    // Page Leave Event (Flush Coins)
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushPendingCoins();
        }
    });
};

function setupSwipeGestures() {
    let touchStartX = 0;
    document.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, {passive: true});

    document.addEventListener('touchend', e => {
        const touchEndX = e.changedTouches[0].screenX;
        // Right to Left Swipe (Open Menu)
        if(touchStartX > window.innerWidth - 100 && touchStartX - touchEndX > 50) {
            document.getElementById('sideMenu').classList.add('open');
            updateSideMenuActiveState();
        }
        // Left to Right Swipe (Close Menu)
        if(touchEndX - touchStartX > 50) {
            document.getElementById('sideMenu').classList.remove('open');
        }
    }, {passive: true});
}

// --- AUTHENTICATION LOGIC ---
window.onAuthDataLoaded = function(json) {
    const pass = document.getElementById('loginPassInput').value;
    const btn = document.querySelector('.btn-login');
    const script = document.getElementById('authScript');
    if(script) script.remove();

    if (!json || !json.table || !json.table.rows) {
        console.error("Auth Data Error:", json);
        alert("ACCESS DENIED: DATA LOAD FAILED");
        btn.textContent = "AUTHENTICATE";
        btn.disabled = false;
        return;
    }

    const rows = json.table.rows;
    let foundUser = null;
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.c[0] || !row.c[1]) continue;
        const name = row.c[0].v;
        const dbPass = String(row.c[1].v); 
        
        if (String(pass) === dbPass) {
            foundUser = { name: name };
            break;
        }
    }

    if (foundUser) {
        currentUser = foundUser;
        localStorage.setItem(LOGIN_KEY, JSON.stringify(currentUser));
        updateUserDisplay();
        document.getElementById('loginModal').style.display = 'none';
        showToast(`WELCOME, ${currentUser.name}`);
        
        if(document.getElementById('view-mypage').classList.contains('active')) {
            renderMyPage();
        }
        fetchCoinData();
    } else {
        alert("ACCESS DENIED: INVALID PASSCODE");
    }
    
    btn.textContent = "AUTHENTICATE";
    btn.disabled = false;
};

function initAuth() {
    const storedUser = localStorage.getItem(LOGIN_KEY);
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
    } else {
        currentUser = null;
    }
    updateUserDisplay();
}

function updateUserDisplay() {
    const disp = document.getElementById('currentUserDisplay');
    if (!disp) return;

    if (currentUser) {
        const name = currentUser.name;
        let coins = getUserTotalCoins(name);
        disp.textContent = `${name} : 🪙${coins.toLocaleString()}`;
        disp.className = 'user-status-display status-user';
    } else {
        disp.textContent = 'GUEST';
        disp.className = 'user-status-display status-guest';
    }
}

function attemptLogin() {
    const pass = document.getElementById('loginPassInput').value;
    if (!pass) return;
    
    const btn = document.querySelector('.btn-login');
    btn.textContent = "VERIFYING...";
    btn.disabled = true;

    const script = document.createElement('script');
    script.id = 'authScript';
    script.src = `https://docs.google.com/spreadsheets/d/${AUTH_SHEET_ID}/gviz/tq?tqx=responseHandler:onAuthDataLoaded&gid=${AUTH_SHEET_GID}`;
    script.onerror = function() {
        alert("AUTH ERROR");
        btn.textContent = "AUTHENTICATE";
        btn.disabled = false;
    };
    document.body.appendChild(script);
}

function enableGuestMode() {
    document.getElementById('loginModal').style.display = 'none';
    if (!currentUser) {
        showToast("GUEST MODE ACTIVE");
    }
}

function handleLogout() {
    if (confirm("LOGOUT / CHANGE USER?")) {
        localStorage.removeItem(LOGIN_KEY);
        currentUser = null;
        location.reload();
    }
}

// --- COIN & GAME LOGIC ---
async function fetchCoinData() {
    try {
        const res = await fetch(COIN_MANAGER_URL);
        globalCoinBalances = await res.json();
        updateUserDisplay();
        renderCoinRanking();
    } catch(e) { console.error("Coin Data Error", e); }
}

function getUserTotalCoins(name) {
    if(!name) return 0;
    const pStats = playerStatsGlobal[name] || { wins: 0, games: 0 };
    const variable = globalCoinBalances[name] || 0;
    return (pStats.wins * 50) + (pStats.games * 10) + variable;
}

function sendCoinTransaction(name, amount, reason, isBatch = true) {
    if(!globalCoinBalances[name]) globalCoinBalances[name]=0;
    globalCoinBalances[name] += amount;
    
    updateUserDisplay();
    if(document.getElementById('view-mypage').classList.contains('active')) renderMyPage();
    renderCoinRanking();
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
}

function renderCoinRanking() {
    const container = document.getElementById('coinRankingList');
    if(!container) return;
    
    if(Object.keys(playerStatsGlobal).length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#666;">LOADING...</div>';
        return;
    }

    const rankingData = [];
    Object.keys(playerStatsGlobal).forEach(name => {
        if (name === '_max') return;
        const total = getUserTotalCoins(name);
        rankingData.push({ name: name, coins: total });
    });

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

// --- MY PAGE RENDERER ---
function renderMyPage() {
    if (!currentUser) return;
    
    const name = currentUser.name;
    const pStats = playerStatsGlobal[name] || { wins: 0, losses: 0, games: 0, mvpCount: 0, matches: 0 };
    
    const rankInfo = getRankInfo(pStats.games);
    const nextRank = rankInfo.next;
    let expText = "MAX RANK";
    let barW = 100;
    
    if (nextRank) {
        const range = nextRank.min - rankInfo.current.min;
        const currentExp = pStats.games - rankInfo.current.min;
        barW = Math.min((currentExp / range) * 100, 100);
        expText = `NEXT RANK: ${nextRank.min - pStats.games} EXP`;
    }
    
    const coins = getUserTotalCoins(name);
    
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

// --- CARD VIEW ---
function showCard() { document.getElementById('cardViewModal').style.display = 'flex'; }
function closeCardView() { 
    document.getElementById('cardViewModal').style.display = 'none'; 
    const card = document.getElementById('holoCard');
    if(card) card.style.transform = `rotateY(0deg) rotateX(0deg)`;
}

function handleCardTilt(event) {
    if(document.getElementById('cardViewModal').style.display !== 'flex') return;
    const card = document.getElementById('holoCard');
    const glare = document.querySelector('.holo-glare');
    let x = event.beta; let y = event.gamma;
    if (x > 45) x = 45; if (x < -45) x = -45;
    if (y > 45) y = 45; if (y < -45) y = -45;
    card.style.transform = `rotateY(${y}deg) rotateX(${-x}deg)`;
    glare.style.backgroundPosition = `${50+(y*2)}% ${50+(x*2)}%`;
}

function handleCardMouseTilt(e) {
    if(document.getElementById('cardViewModal').style.display !== 'flex') return;
    const card = document.getElementById('holoCard');
    const glare = document.querySelector('.holo-glare');
    const w = window.innerWidth; const h = window.innerHeight;
    const yRotation = ((e.clientX - w / 2) / w) * 60;
    const xRotation = ((e.clientY - h / 2) / h) * 60;
    card.style.transform = `rotateY(${yRotation}deg) rotateX(${-xRotation}deg)`;
    glare.style.backgroundPosition = `${50+(yRotation*2)}% ${50+(xRotation*2)}%`;
}

// --- NAVIGATION ---
function toggleSideMenu() {
    const menu = document.getElementById('sideMenu');
    menu.classList.toggle('open');
    if(menu.classList.contains('open')) updateSideMenuActiveState();
}

function updateSideMenuActiveState() {
    const currentView = sessionStorage.getItem('lastView') || 'top';
    const items = document.querySelectorAll('.side-menu-content .menu-item');
    items.forEach(i => i.classList.remove('active'));
    if(currentView === 'mypage') items[2].classList.add('active');
    else if (currentView === 'game') items[1].classList.add('active');
    else items[0].classList.add('active');
}

function closeSideMenu(e) {
    if(e.target.id === 'sideMenu') document.getElementById('sideMenu').classList.remove('open');
}

function selectAppMode(mode) {
    document.getElementById('sideMenu').classList.remove('open');
    const bottomNav = document.getElementById('bottomNav');
    const subTitle = document.querySelector('.subtitle');

    if (mode === 'tennis') {
        switchMainView('top'); 
        bottomNav.classList.remove('hidden');
        subTitle.textContent = "DEEP SPACE INTEGRATED SYSTEM";
    } else if (mode === 'game') {
        switchMainView('game');
        bottomNav.classList.add('hidden');
        document.getElementById('pageTitle').textContent = "GAME ARCHIVE";
        subTitle.textContent = "TACTICAL SIMULATION MODULES";
    }
}

function switchMainView(viewName) {
    sessionStorage.setItem('lastView', viewName);
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const navs = document.querySelectorAll('.nav-item');
    
    if(viewName === 'top') navs[0].classList.add('active');
    if(viewName === 'match') navs[1].classList.add('active');
    if(viewName === 'dashboard') navs[2].classList.add('active');
    if(viewName === 'ranking') navs[3].classList.add('active');
    if(viewName === 'schedule') navs[4].classList.add('active');
    
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    
    const titles = { 'top': 'HOME', 'match': 'MATCH INPUT', 'dashboard': 'DASHBOARD', 'ranking': 'RANKING', 'schedule': 'MISSION SCHEDULE', 'mypage': 'MY PAGE', 'game': 'GAME ARCHIVE' };
    document.getElementById('pageTitle').textContent = titles[viewName] || 'TENNIS CHRONICLES';
    
    const bottomNav = document.getElementById('bottomNav');
    if (viewName === 'game') bottomNav.classList.add('hidden');
    else bottomNav.classList.remove('hidden');
}

function manualReload() { location.reload(); }

// --- GAMES ---
function openCoinGame() { 
    document.getElementById('coinGameModal').style.display='flex'; 
    const c = document.getElementById('gameCoin');
    if(c) { c.classList.remove('spinning'); c.textContent="TAP"; }
}

function closeGameModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    if (modalId === 'slotGameModal') flushPendingCoins();
}

function playCoinToss() {
    const c = document.getElementById('gameCoin');
    if(!c || c.classList.contains('spinning')) return;
    c.classList.add('spinning'); c.textContent="";
    setTimeout(() => { c.classList.remove('spinning'); c.textContent = Math.random() < 0.5 ? "HEAD" : "TAIL"; }, 1000);
}

// --- SLOT ---
const slotSymbols = ['🍒', '🔔', '💎', '7️⃣', '❌', '🌙'];
let isSpinning = false;
let reelIntervals = [null, null, null];
let reelStopped = [true, true, true];
let reelResults = [null, null, null];
let isMoonWinRound = false;

function openSlotGame() { 
    document.getElementById('slotGameModal').style.display='flex';
    updateSlotCreditUI();
}

function updateSlotCreditUI() {
    if(!currentUser) return;
    const current = getUserTotalCoins(currentUser.name);
    const el = document.getElementById('slotCredit');
    if(el) el.textContent = `CREDIT: ${current.toLocaleString()}`;
}

function spinSlot() {
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
    
    for(let i=1; i<=3; i++) document.getElementById(`stop${i}`).disabled = false;
    
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

function stopReel(index) {
    if(reelStopped[index]) return;
    clearInterval(reelIntervals[index]);
    const el = document.getElementById(`reel${index+1}`);
    const sym = isMoonWinRound ? '🌙' : slotSymbols[Math.floor(Math.random()*slotSymbols.length)];
    el.textContent = sym;
    reelResults[index] = sym;
    reelStopped[index] = true;
    document.getElementById(`stop${index+1}`).disabled = true;
    if(reelStopped[0] && reelStopped[1] && reelStopped[2]) finishSlot(reelResults);
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

// --- SHOP ---
let holdTimer = null;
function openShop() { document.getElementById('shopModal').style.display='flex'; }
function startHold(btn, e) {
    if(e && e.type === 'touchstart') e.preventDefault();
    btn.classList.add('holding');
    holdTimer = setTimeout(() => buyItem(), 1500); 
}
function endHold(btn) { clearTimeout(holdTimer); btn.classList.remove('holding'); }

function buyItem() {
    document.querySelector('.hold-btn').classList.remove('holding');
    if(!currentUser) return showToast("LOGIN REQUIRED");
    if(getUserTotalCoins(currentUser.name) < 10000) return showToast(`NOT ENOUGH COINS`);
    if(localStorage.getItem(`has_imada_card_${currentUser.name}`)) return showToast("ALREADY OWNED");

    sendCoinTransaction(currentUser.name, -10000, "Buy Card: Imada", false);
    localStorage.setItem(`has_imada_card_${currentUser.name}`, 'true');
    showToast("PURCHASE SUCCESSFUL!");
    setTimeout(() => {
        document.getElementById('shopModal').style.display='none';
        if(document.getElementById('view-mypage').classList.contains('active')) renderMyPage();
    }, 1000);
}

// --- ANALYSIS FUNCTIONS ---
// (Rest of the standard functions - kept compact for integration)
function getRankInfo(games) {
    for(let i=CREW_RANKS.length-1; i>=0; i--) { if(games>=CREW_RANKS[i].min) return {current:CREW_RANKS[i], next:CREW_RANKS[i+1]||null}; }
    return {current:CREW_RANKS[0], next:CREW_RANKS[1]};
}
function getMedals(p, m) {
    let h = "";
    const r = (p.wins+p.losses)>0 ? p.wins/(p.wins+p.losses) : 0;
    const cr = p.clutchTotal>0 ? p.clutchWins/p.clutchTotal : 0;
    if(r===m.bestWR && p.matches>0) h+='<span class="medal-icon">👑</span>';
    if(r>=0.7 && p.matches>0) h+='<span class="medal-icon">🔥</span>';
    if(p.matches===m.matches && m.matches>0) h+='<span class="medal-icon">💪🏼</span>';
    for(let i=0; i<Math.min(p.mvpCount,3); i++) h+='<span class="medal-icon">⭐</span>';
    if(p.sniperCount===m.sniper && m.sniper>0) h+='<span class="medal-icon">🎯</span>';
    if(cr===m.clutchR && m.clutchR>0 && p.clutchTotal>0) h+='<span class="medal-icon">❤️‍🔥</span>';
    return h;
}
function fetchWeather() { /* ... weather fetch logic from prev ... */ }
function weatherCodeToIcon(code) { /* ... icon logic ... */ return "☀"; }
async function fetchAnalysisData() { /* ... */ }
function filterRanking(sector) { /* ... */ }
function processAnalysisData() { /* ... process and render analysis ... */ }
function renderAnalysisRanking(players) { /* ... */ }
function renderAnalysisPairs(ps) { /* ... */ }
function renderAnalysisLogs(logs) { /* ... */ }
function renderAnalysisChart(players) { /* ... */ }
function showModal(name) { /* ... */ }
function closeModal(e) { if(e.target.id==='playerModal'||e.target.className==='close-btn') document.getElementById('playerModal').style.display='none'; }
function showToast(msg) { const t=document.getElementById("toast"); t.textContent=msg; t.className="show"; setTimeout(()=>{t.className=t.className.replace("show","")},3000); }
// ... Rest of input logic ...
