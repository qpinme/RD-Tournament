// ============================================
// FIREBASE CONFIGURATION
// ============================================
// REPLACE THIS WITH YOUR FIREBASE CONFIG FROM FIREBASE CONSOLE
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB1zUvkLhY--wd3QjjMI3_hn6d1iWqKmIc",
  authDomain: "rd-tournament-d7257.firebaseapp.com",
  databaseURL: "https://rd-tournament-d7257-default-rtdb.firebaseio.com",
  projectId: "rd-tournament-d7257",
  storageBucket: "rd-tournament-d7257.firebasestorage.app",
  messagingSenderId: "44554845474",
  appId: "1:44554845474:web:2569c71c0f3261fbbb397b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// ============================================
// ORGANIZER EMAIL WHITELIST
// ============================================
// ONLY THESE EMAILS CAN ACCESS TOURNAMENT SETUP
const AUTHORIZED_ORGANIZERS = [
    "qpinme@gmail.com",
    "rbalakr@gmail.com"
];

// ============================================
// FIREBASE INITIALIZATION
// ============================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getDatabase, ref, set, get, push, remove, onValue, update, query, orderByChild, equalTo } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

let app, auth, database;
let currentUser = null;
let userRole = null;
let userTeamId = null;

// Check if Firebase is configured
function isFirebaseConfigured() {
    return !firebaseConfig.apiKey.includes('YOUR_');
}

// Check if user is authorized organizer
function isAuthorizedOrganizer(email) {
    return AUTHORIZED_ORGANIZERS.map(e => e.toLowerCase()).includes(email.toLowerCase());
}

// Initialize app
document.addEventListener('DOMContentLoaded', async function() {
    if (!isFirebaseConfigured()) {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('config-error').classList.remove('hidden');
        return;
    }

    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        database = getDatabase(app);
        
        // Check for player token in URL
        const urlParams = new URLSearchParams(window.location.search);
        const playerToken = urlParams.get('player');
        
        if (playerToken) {
            await showPlayerView(playerToken);
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
        } else {
            // Check auth state
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    await handleAuthUser(user);
                } else {
                    showLoginView();
                }
                document.getElementById('loading-screen').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');
            });
        }
    } catch (error) {
        console.error('Firebase initialization error:', error);
        showToast('Error initializing app: ' + error.message, 'error');
        document.getElementById('loading-screen').classList.add('hidden');
    }
});

// ============================================
// AUTHENTICATION HANDLERS
// ============================================
async function handleAuthUser(user) {
    currentUser = user;
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('user-info').classList.remove('hidden');
    
    try {
        // Get user role from database
        const userRef = ref(database, `users/${user.uid}`);
        const userSnapshot = await get(userRef);
        
        if (userSnapshot.exists()) {
            const userData = userSnapshot.val();
            userRole = userData.role;
            userTeamId = userData.teamId;
            
            if (userRole === 'organizer') {
                await showOrganizerView();
            } else if (userRole === 'captain') {
                await showCaptainView();
            }
        } else {
            // New user - check if they're a registered captain or authorized organizer
            const captainQuery = query(ref(database, 'captains'), orderByChild('email'), equalTo(user.email));
            const captainSnapshot = await get(captainQuery);
            
            if (captainSnapshot.exists()) {
                const captainId = Object.keys(captainSnapshot.val())[0];
                const captainData = captainSnapshot.val()[captainId];
                
                await set(userRef, {
                    email: user.email,
                    role: 'captain',
                    teamId: captainData.teamId,
                    captainId: captainId
                });
                
                userRole = 'captain';
                userTeamId = captainData.teamId;
                await showCaptainView();
            } else if (isAuthorizedOrganizer(user.email)) {
                // Authorized organizer - create organizer account
                await set(userRef, {
                    email: user.email,
                    role: 'organizer',
                    createdAt: new Date().toISOString()
                });
                
                userRole = 'organizer';
                showToast('Welcome, organizer!', 'success');
                await showOrganizerView();
            } else {
                showToast('You are not registered. Please contact the organizer.', 'error');
                await signOut(auth);
            }
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
        showToast('Error loading user data', 'error');
    }
}

// ============================================
// LOGIN VIEW
// ============================================
function showLoginView() {
    hideAllViews();
    document.getElementById('login-view').classList.remove('hidden');
    
    document.getElementById('login-view').innerHTML = `
        <div class="max-w-md mx-auto mt-8 sm:mt-12 fade-in">
            <div class="bg-white rounded-lg shadow-xl p-6 sm:p-8">
                <h2 class="text-2xl font-bold text-center mb-6 text-gray-800">Tournament Login</h2>
                
                <div class="space-y-4 mb-6">
                    <button id="google-login-btn" class="w-full bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-2">
                        <svg class="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Sign in with Google
                    </button>
                    
                    <div class="text-center text-gray-500 text-sm">or</div>
                </div>

                <form id="email-login-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input type="email" id="login-email" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none" required placeholder="your@email.com">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                        <input type="password" id="login-password" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none" required placeholder="••••••••">
                    </div>

                    <button type="submit" class="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600 transition">
                        Login
                    </button>
                </form>

                <div class="mt-6 text-center">
                    <button id="show-setup-btn" class="text-sm text-orange-600 hover:text-orange-700 underline">
                        First Time Setup (Organizers Only)
                    </button>
                </div>

                <div class="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-gray-700">
                    <p class="font-semibold mb-2">For Captains:</p>
                    <p>Use the email you registered with or sign in with Google</p>
                </div>
            </div>
        </div>
    `;
    
    // Attach event listeners
    document.getElementById('google-login-btn').addEventListener('click', handleGoogleLogin);
    document.getElementById('email-login-form').addEventListener('submit', handleEmailLogin);
    document.getElementById('show-setup-btn').addEventListener('click', showSetupModal);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
}

async function handleGoogleLogin() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error('Google login error:', error);
        showToast('Google login failed: ' + error.message, 'error');
    }
}

async function handleEmailLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            showToast('Invalid email or password', 'error');
        } else {
            showToast('Login error: ' + error.message, 'error');
        }
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        currentUser = null;
        userRole = null;
        userTeamId = null;
        showLoginView();
    } catch (error) {
        showToast('Logout error: ' + error.message, 'error');
    }
}

// ============================================
// SETUP MODAL (FOR ORGANIZERS)
// ============================================
function showSetupModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
                <h3 class="text-xl font-bold text-gray-800">Tournament Setup</h3>
                <button id="close-setup" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
            </div>
            <div class="p-6">
                <div class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p class="text-sm text-yellow-800"><strong>Note:</strong> This is for first-time tournament setup only. You'll create an organizer account and register all team captains.</p>
                </div>
                
                <form id="setup-form" class="space-y-6">
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <h4 class="font-bold text-gray-800 mb-4">1. Create Organizer Account</h4>
                        <div class="space-y-3">
                            <input type="email" id="org-email" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="Organizer Email" required>
                            <input type="password" id="org-password" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="Password (min 6 characters)" required minlength="6">
                        </div>
                    </div>

                    <div class="bg-gray-50 p-4 rounded-lg">
                        <h4 class="font-bold text-gray-800 mb-4">2. Register Team Captains</h4>
                        <div id="captains-container" class="space-y-4"></div>
                        <button type="button" id="add-captain-btn" class="mt-3 w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600">
                            + Add Captain
                        </button>
                    </div>

                    <button type="submit" class="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600">
                        Complete Setup
                    </button>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add initial captain form
    addCaptainForm();
    
    document.getElementById('close-setup').addEventListener('click', () => modal.remove());
    document.getElementById('add-captain-btn').addEventListener('click', addCaptainForm);
    document.getElementById('setup-form').addEventListener('submit', handleSetupSubmit);
}

let captainCount = 0;

function addCaptainForm() {
    captainCount++;
    const container = document.getElementById('captains-container');
    const leagues = [
        { id: 'pro-volleyball', name: 'Professional Volleyball' },
        { id: 'regular-volleyball', name: 'Regular Volleyball' },
        { id: 'masters-volleyball', name: 'Volleyball 45+' },
        { id: 'women-throwball', name: 'Women Throwball' }
    ];
    
    const captainForm = document.createElement('div');
    captainForm.className = 'border border-gray-300 rounded-lg p-4 space-y-3';
    captainForm.innerHTML = `
        <div class="flex justify-between items-center">
            <span class="font-semibold text-gray-700">Captain ${captainCount}</span>
            <button type="button" class="remove-captain text-red-600 hover:text-red-700 text-sm">Remove</button>
        </div>
        <select class="captain-league w-full px-3 py-2 border border-gray-300 rounded-lg" required>
            ${leagues.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
        </select>
        <input type="text" class="captain-team w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Team Name" required>
        <input type="text" class="captain-name w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Captain Name" required>
        <input type="email" class="captain-email w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Captain Email" required>
        <input type="tel" class="captain-phone w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Phone (WhatsApp)" required>
        <input type="password" class="captain-password w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Password for Captain" required minlength="6">
    `;
    
    container.appendChild(captainForm);
    
    captainForm.querySelector('.remove-captain').addEventListener('click', () => captainForm.remove());
}

async function handleSetupSubmit(e) {
    e.preventDefault();
    
    const orgEmail = document.getElementById('org-email').value;
    const orgPassword = document.getElementById('org-password').value;
    
    try {
        showToast('Setting up tournament...', 'info');
        
        // Create organizer account
        const orgUserCredential = await createUserWithEmailAndPassword(auth, orgEmail, orgPassword);
        await set(ref(database, `users/${orgUserCredential.user.uid}`), {
            email: orgEmail,
            role: 'organizer',
            createdAt: new Date().toISOString()
        });
        
        // Get all captain forms
        const captainForms = document.querySelectorAll('#captains-container > div');
        
        for (const form of captainForms) {
            const leagueId = form.querySelector('.captain-league').value;
            const teamName = form.querySelector('.captain-team').value;
            const captainName = form.querySelector('.captain-name').value;
            const captainEmail = form.querySelector('.captain-email').value;
            const captainPhone = form.querySelector('.captain-phone').value;
            const captainPassword = form.querySelector('.captain-password').value;
            
            // Create team
            const teamRef = push(ref(database, 'teams'));
            await set(teamRef, {
                name: teamName,
                leagueId: leagueId,
                captain: {
                    name: captainName,
                    email: captainEmail,
                    phone: captainPhone
                },
                players: {},
                createdAt: new Date().toISOString()
            });
            
            // Create captain record
            const captainRef = push(ref(database, 'captains'));
            await set(captainRef, {
                name: captainName,
                email: captainEmail,
                phone: captainPhone,
                teamId: teamRef.key,
                leagueId: leagueId,
                teamName: teamName
            });
            
            // Create captain user account
            try {
                const captainUserCredential = await createUserWithEmailAndPassword(auth, captainEmail, captainPassword);
                await set(ref(database, `users/${captainUserCredential.user.uid}`), {
                    email: captainEmail,
                    role: 'captain',
                    teamId: teamRef.key,
                    captainId: captainRef.key
                });
            } catch (error) {
                console.error('Error creating captain account:', error);
                // Continue with other captains even if one fails
            }
        }
        
        showToast('Setup complete! Redirecting...', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 2000);
        
    } catch (error) {
        console.error('Setup error:', error);
        showToast('Setup failed: ' + error.message, 'error');
    }
}

// ============================================
// CAPTAIN VIEW
// ============================================
async function showCaptainView() {
    hideAllViews();
    document.getElementById('captain-view').classList.remove('hidden');
    
    const teamRef = ref(database, `teams/${userTeamId}`);
    const teamSnapshot = await get(teamRef);
    
    if (!teamSnapshot.exists()) {
        showToast('Team not found', 'error');
        return;
    }
    
    const teamData = teamSnapshot.val();
    const players = teamData.players || {};
    
    document.getElementById('captain-view').innerHTML = `
        <div class="space-y-4 sm:space-y-6 fade-in">
            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <h2 class="text-xl sm:text-2xl font-bold text-gray-800 mb-2">${teamData.name}</h2>
                <p class="text-sm sm:text-base text-gray-600">${teamData.captain.name}</p>
                <p class="text-xs sm:text-sm text-gray-500 mt-1">
                    ${getLeagueName(teamData.leagueId)}
                </p>
            </div>

            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <div class="flex justify-between items-center mb-4 sm:mb-6">
                    <div>
                        <h3 class="text-lg sm:text-xl font-bold text-gray-800">Team Roster</h3>
                        <p class="text-xs sm:text-sm text-gray-600">${Object.keys(players).length} players</p>
                    </div>
                    <button id="add-player-btn" class="bg-orange-500 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg hover:bg-orange-600 text-sm sm:text-base">
                        + Add
                    </button>
                </div>

                <div id="players-list" class="space-y-3 sm:space-y-4">
                    ${Object.keys(players).length === 0 ? `
                        <div class="text-center py-8 text-gray-500">
                            <p class="mb-2">No players added yet</p>
                            <p class="text-sm">Click "Add" to add your first player</p>
                        </div>
                    ` : Object.entries(players).map(([playerId, player]) => `
                        <div class="border border-gray-200 rounded-lg p-3 sm:p-4">
                            <div class="flex justify-between items-start gap-3">
                                <div class="flex-1 min-w-0">
                                    <h4 class="font-semibold text-gray-800 truncate">${player.name}</h4>
                                    <p class="text-xs sm:text-sm text-gray-600 truncate">${player.email}</p>
                                    <p class="text-xs sm:text-sm text-gray-600">${player.phone}</p>
                                    
                                    <div class="mt-2 sm:mt-3 flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
                                        <div class="flex items-center gap-1">
                                            ${player.waiverSigned ? 
                                                '<span class="text-green-600">✓ Waiver</span>' : 
                                                '<span class="text-red-600">✗ Waiver</span>'
                                            }
                                        </div>
                                        <div class="flex items-center gap-1">
                                            ${player.lunchChoice ? 
                                                `<span class="text-green-600">🍽️ ${player.lunchChoice === 'veg' ? 'Veg' : 'Non-Veg'}</span>` : 
                                                '<span class="text-red-600">🍽️ Pending</span>'
                                            }
                                        </div>
                                    </div>
                                </div>

                                <div class="flex flex-col gap-2">
                                    <button class="share-whatsapp bg-green-500 text-white px-3 py-1 rounded text-xs sm:text-sm hover:bg-green-600 whitespace-nowrap" data-player-id="${playerId}" data-player-name="${player.name}" data-player-phone="${player.phone}" data-player-email="${player.email}">
                                        WhatsApp
                                    </button>
                                    <button class="copy-link bg-blue-500 text-white px-3 py-1 rounded text-xs sm:text-sm hover:bg-blue-600 whitespace-nowrap" data-player-id="${playerId}">
                                        Copy Link
                                    </button>
                                    <button class="remove-player bg-red-500 text-white px-3 py-1 rounded text-xs sm:text-sm hover:bg-red-600 whitespace-nowrap" data-player-id="${playerId}">
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    // Attach event listeners
    document.getElementById('add-player-btn').addEventListener('click', () => showAddPlayerModal(userTeamId));
    
    document.querySelectorAll('.share-whatsapp').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const playerId = e.target.dataset.playerId;
            const playerName = e.target.dataset.playerName;
            const playerPhone = e.target.dataset.playerPhone;
            const playerEmail = e.target.dataset.playerEmail;
            shareViaWhatsApp(playerId, playerName, playerPhone, playerEmail, teamData.name);
        });
    });
    
    document.querySelectorAll('.copy-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const playerId = e.target.dataset.playerId;
            copyPlayerLink(playerId);
        });
    });
    
    document.querySelectorAll('.remove-player').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const playerId = e.target.dataset.playerId;
            if (confirm('Remove this player from your team?')) {
                await removePlayer(userTeamId, playerId);
                showCaptainView(); // Refresh view
            }
        });
    });
    
    // Real-time updates
    onValue(teamRef, (snapshot) => {
        if (snapshot.exists()) {
            showCaptainView(); // Refresh when data changes
        }
    });
}

function showAddPlayerModal(teamId) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-md w-full p-6">
            <h3 class="text-xl font-bold text-gray-800 mb-4">Add New Player</h3>
            
            <form id="add-player-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Player Name</label>
                    <input type="text" id="player-name" class="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" id="player-email" class="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone (WhatsApp)</label>
                    <input type="tel" id="player-phone" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="+1234567890" required>
                </div>

                <div class="flex gap-3">
                    <button type="button" id="cancel-add" class="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">
                        Cancel
                    </button>
                    <button type="submit" class="flex-1 bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600">
                        Add Player
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('cancel-add').addEventListener('click', () => modal.remove());
    document.getElementById('add-player-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const playerData = {
            name: document.getElementById('player-name').value,
            email: document.getElementById('player-email').value,
            phone: document.getElementById('player-phone').value,
            waiverSigned: false,
            lunchChoice: null,
            addedAt: new Date().toISOString()
        };
        
        try {
            const playerRef = push(ref(database, `teams/${teamId}/players`));
            await set(playerRef, playerData);
            showToast('Player added successfully!', 'success');
            modal.remove();
            showCaptainView(); // Refresh view
        } catch (error) {
            showToast('Error adding player: ' + error.message, 'error');
        }
    });
}

async function removePlayer(teamId, playerId) {
    try {
        await remove(ref(database, `teams/${teamId}/players/${playerId}`));
        showToast('Player removed', 'success');
    } catch (error) {
        showToast('Error removing player', 'error');
    }
}

function shareViaWhatsApp(playerId, playerName, playerPhone, playerEmail, teamName) {
    const link = `${window.location.origin}${window.location.pathname}?player=${playerId}`;
    const message = `Hi ${playerName}!

You've been added to *${teamName}* for the *Republic Day Tournament 2026* 🏐

*IMPORTANT: Complete Your Registration*

*Step 1:* Click this link to open the tournament app:
${link}

*Step 2:* Create your account or login using:
📧 Email: ${playerEmail}

*Step 3:* Sign the waiver form

*Step 4:* Select your lunch preference (Veg/Non-Veg)

*What you need to do:*
✅ Sign waiver (required for participation)
✅ Choose lunch option

Please complete this ASAP! See you on *January 26, 2026*! 🎉`;

    const whatsappUrl = `https://wa.me/${playerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    showToast('WhatsApp message opened!', 'success');
}

function copyPlayerLink(playerId) {
    const link = `${window.location.origin}${window.location.pathname}?player=${playerId}`;
    navigator.clipboard.writeText(link).then(() => {
        showToast('Link copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy link', 'error');
    });
}

// ============================================
// PLAYER VIEW
// ============================================
async function showPlayerView(playerId) {
    hideAllViews();
    document.getElementById('player-view').classList.remove('hidden');
    
    // Find player across all teams
    const teamsSnapshot = await get(ref(database, 'teams'));
    let playerData = null;
    let teamData = null;
    let playerTeamId = null;
    
    if (teamsSnapshot.exists()) {
        const teams = teamsSnapshot.val();
        for (const [teamId, team] of Object.entries(teams)) {
            if (team.players && team.players[playerId]) {
                playerData = team.players[playerId];
                teamData = team;
                playerTeamId = teamId;
                break;
            }
        }
    }
    
    if (!playerData) {
        document.getElementById('player-view').innerHTML = `
            <div class="text-center py-12">
                <div class="text-4xl mb-4">❌</div>
                <h2 class="text-xl font-bold text-red-600 mb-4">Invalid Link</h2>
                <p class="text-gray-600">This player link is not valid. Please contact your team captain.</p>
            </div>
        `;
        return;
    }
    
    // Check if player is authenticated
    const currentAuthUser = auth.currentUser;
    const isPlayerAuthenticated = currentAuthUser && currentAuthUser.email.toLowerCase() === playerData.email.toLowerCase();
    
    if (!isPlayerAuthenticated) {
        showPlayerAuthScreen(playerId, playerData, teamData, playerTeamId);
        return;
    }
    
    const alreadySubmitted = playerData.waiverSigned && playerData.lunchChoice;
    
    document.getElementById('player-view').innerHTML = `
        <div class="max-w-2xl mx-auto fade-in">
            ${alreadySubmitted ? `
                <div class="bg-white rounded-lg shadow-xl p-6 sm:p-8 text-center">
                    <div class="text-4xl sm:text-6xl mb-4">✓</div>
                    <h2 class="text-xl sm:text-2xl font-bold text-green-600 mb-4">Registration Complete!</h2>
                    <p class="text-gray-700 mb-2">Thank you, ${playerData.name}!</p>
                    <p class="text-gray-600 mb-4">Your registration for ${teamData.name} has been submitted.</p>
                    <div class="bg-green-50 p-4 rounded-lg">
                        <p class="text-sm text-gray-700">
                            <strong>Lunch Choice:</strong> ${playerData.lunchChoice === 'veg' ? 'Vegetarian' : 'Non-Vegetarian'}
                        </p>
                    </div>
                    <p class="text-sm text-gray-500 mt-4">See you at the tournament on January 26, 2026!</p>
                </div>
            ` : `
                <div class="bg-white rounded-lg shadow-xl p-6 sm:p-8">
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-green-600 text-xl">✓</span>
                            <span class="font-semibold text-green-800">Authenticated as ${currentAuthUser.email}</span>
                        </div>
                        <p class="text-xs text-gray-600">Your identity has been verified for legal waiver signing</p>
                    </div>

                    <h2 class="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Player Registration</h2>
                    <p class="text-gray-600 mb-6">
                        ${playerData.name} • ${teamData.name}
                    </p>

                    <form id="player-form" class="space-y-6">
                        <div class="bg-gray-50 p-4 sm:p-6 rounded-lg">
                            <h3 class="font-bold text-gray-800 mb-4">Tournament Waiver</h3>
                            <div class="text-sm text-gray-700 space-y-2 mb-4 max-h-60 overflow-y-auto border border-gray-200 p-4 rounded bg-white">
                                <p class="font-semibold">LIABILITY WAIVER AND RELEASE</p>
                                <p>I, <strong>${playerData.name}</strong> (<strong>${playerData.email}</strong>), acknowledge and agree to the following:</p>
                                <ol class="list-decimal ml-5 space-y-2">
                                    <li>I am voluntarily participating in the Republic Day Tournament 2026 with full knowledge of the risks involved.</li>
                                    <li>I understand that participation in volleyball and throwball activities involves inherent risks, including but not limited to physical injury, illness, or property damage.</li>
                                    <li>I hereby release, waive, discharge, and covenant not to sue the tournament organizers, sponsors, volunteers, and venue owners from any and all liability for any injury or damage that may occur during my participation.</li>
                                    <li>I certify that I am in good physical condition and have no medical conditions that would prevent my safe participation.</li>
                                    <li>I agree to follow all tournament rules and regulations and the instructions of tournament officials.</li>
                                    <li>I grant permission for the use of photographs or videos taken during the tournament for promotional purposes.</li>
                                </ol>
                                <p class="mt-4 font-semibold">By checking the box below and submitting this form, I electronically sign this waiver with my authenticated identity.</p>
                            </div>

                            <label class="flex items-start gap-3 cursor-pointer">
                                <input type="checkbox" id="waiver-checkbox" class="mt-1 w-5 h-5 text-orange-500" required>
                                <span class="text-sm text-gray-700">
                                    I, ${playerData.name}, have read and agree to the waiver terms above. I understand this is a legally binding electronic signature.
                                </span>
                            </label>
                        </div>

                        <div class="bg-gray-50 p-4 sm:p-6 rounded-lg">
                            <h3 class="font-bold text-gray-800 mb-4">Lunch Preference</h3>
                            <p class="text-sm text-gray-600 mb-4">We will be providing lunch during the tournament. Please select your preference:</p>
                            
                            <div class="space-y-3">
                                <label class="flex items-center gap-3 cursor-pointer p-3 border-2 border-gray-300 rounded-lg hover:bg-white ${playerData.lunchChoice === 'veg' ? 'border-orange-500 bg-orange-50' : ''}">
                                    <input type="radio" name="lunch" value="veg" class="w-4 h-4 text-orange-500" required ${playerData.lunchChoice === 'veg' ? 'checked' : ''}>
                                    <span class="text-gray-700">🥗 Vegetarian</span>
                                </label>

                                <label class="flex items-center gap-3 cursor-pointer p-3 border-2 border-gray-300 rounded-lg hover:bg-white ${playerData.lunchChoice === 'nonveg' ? 'border-orange-500 bg-orange-50' : ''}">
                                    <input type="radio" name="lunch" value="nonveg" class="w-4 h-4 text-orange-500" required ${playerData.lunchChoice === 'nonveg' ? 'checked' : ''}>
                                    <span class="text-gray-700">🍗 Non-Vegetarian</span>
                                </label>
                            </div>
                        </div>

                        <button type="submit" class="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600 transition">
                            Submit Registration
                        </button>
                    </form>
                </div>
            `}
        </div>
    `;
    
    if (!alreadySubmitted) {
        document.getElementById('player-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const waiverSigned = document.getElementById('waiver-checkbox').checked;
            const lunchChoice = document.querySelector('input[name="lunch"]:checked').value;
            
            if (!waiverSigned) {
                showToast('Please agree to the waiver to continue', 'error');
                return;
            }
            
            try {
                // Record authenticated waiver signature
                await update(ref(database, `teams/${playerTeamId}/players/${playerId}`), {
                    waiverSigned: true,
                    waiverSignedBy: currentAuthUser.email,
                    waiverSignedAt: new Date().toISOString(),
                    lunchChoice: lunchChoice,
                    submittedAt: new Date().toISOString()
                });
                
                showToast('Registration submitted successfully!', 'success');
                setTimeout(() => {
                    showPlayerView(playerId); // Refresh to show success message
                }, 1000);
            } catch (error) {
                showToast('Error submitting form: ' + error.message, 'error');
            }
        });
    }
}

// ============================================
// PLAYER AUTHENTICATION SCREEN
// ============================================
function showPlayerAuthScreen(playerId, playerData, teamData, playerTeamId) {
    document.getElementById('player-view').innerHTML = `
        <div class="max-w-md mx-auto mt-8 fade-in">
            <div class="bg-white rounded-lg shadow-xl p-6 sm:p-8">
                <div class="text-center mb-6">
                    <div class="text-4xl mb-3">🏐</div>
                    <h2 class="text-2xl font-bold text-gray-800 mb-2">Player Authentication Required</h2>
                    <p class="text-sm text-gray-600">To sign the waiver legally, you must verify your identity</p>
                </div>

                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <p class="text-sm text-gray-700"><strong>Player:</strong> ${playerData.name}</p>
                    <p class="text-sm text-gray-700"><strong>Email:</strong> ${playerData.email}</p>
                    <p class="text-sm text-gray-700"><strong>Team:</strong> ${teamData.name}</p>
                </div>

                <div class="mb-6">
                    <div class="flex gap-2 mb-4">
                        <button id="show-login-tab" class="flex-1 py-2 px-4 rounded-lg font-semibold bg-orange-500 text-white">
                            Login
                        </button>
                        <button id="show-signup-tab" class="flex-1 py-2 px-4 rounded-lg font-semibold bg-gray-200 text-gray-700">
                            Sign Up
                        </button>
                    </div>

                    <!-- Login Form -->
                    <form id="player-login-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                            <input type="email" id="player-login-email" value="${playerData.email}" class="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100" readonly>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                            <input type="password" id="player-login-password" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none" required placeholder="Enter your password">
                        </div>

                        <button type="submit" class="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600 transition">
                            Login to Sign Waiver
                        </button>
                    </form>

                    <!-- Signup Form -->
                    <form id="player-signup-form" class="space-y-4 hidden">
                        <div>
                            <button type="button" id="google-signup-btn" class="w-full bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-2 mb-4">
                                <svg class="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                </svg>
                                Sign up with Google
                            </button>
                        </div>

                        <div class="text-center text-gray-500 text-sm">or</div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                            <input type="text" id="player-signup-name" value="${playerData.name}" class="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100" readonly>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                            <input type="email" id="player-signup-email" value="${playerData.email}" class="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100" readonly>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Create Password</label>
                            <input type="password" id="player-signup-password" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none" required placeholder="Min 6 characters" minlength="6">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                            <input type="password" id="player-signup-confirm" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none" required placeholder="Re-enter password">
                        </div>

                        <button type="submit" class="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600 transition">
                            Create Account & Continue
                        </button>
                    </form>
                </div>

                <div class="text-xs text-gray-500 text-center">
                    <p>🔒 Your email is used to verify your identity for legal waiver purposes.</p>
                </div>
            </div>
        </div>
    `;

    // Tab switching
    document.getElementById('show-login-tab').addEventListener('click', function() {
        this.classList.add('bg-orange-500', 'text-white');
        this.classList.remove('bg-gray-200', 'text-gray-700');
        document.getElementById('show-signup-tab').classList.remove('bg-orange-500', 'text-white');
        document.getElementById('show-signup-tab').classList.add('bg-gray-200', 'text-gray-700');
        document.getElementById('player-login-form').classList.remove('hidden');
        document.getElementById('player-signup-form').classList.add('hidden');
    });

    document.getElementById('show-signup-tab').addEventListener('click', function() {
        this.classList.add('bg-orange-500', 'text-white');
        this.classList.remove('bg-gray-200', 'text-gray-700');
        document.getElementById('show-login-tab').classList.remove('bg-orange-500', 'text-white');
        document.getElementById('show-login-tab').classList.add('bg-gray-200', 'text-gray-700');
        document.getElementById('player-signup-form').classList.remove('hidden');
        document.getElementById('player-login-form').classList.add('hidden');
    });

    // Login form handler
    document.getElementById('player-login-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const email = document.getElementById('player-login-email').value;
        const password = document.getElementById('player-login-password').value;
        
        try {
            await signInWithEmailAndPassword(auth, email, password);
            showToast('Login successful!', 'success');
            // Will trigger onAuthStateChanged which will reload player view
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                showToast('No account found. Please sign up first.', 'error');
                document.getElementById('show-signup-tab').click();
            } else if (error.code === 'auth/wrong-password') {
                showToast('Invalid password', 'error');
            } else {
                showToast('Login error: ' + error.message, 'error');
            }
        }
    });

    // Google signup handler
    document.getElementById('google-signup-btn').addEventListener('click', async function() {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            
            // Check if email matches
            if (result.user.email.toLowerCase() !== playerData.email.toLowerCase()) {
                await signOut(auth);
                showToast(`Please use Google account with email: ${playerData.email}`, 'error');
                return;
            }
            
            // Create player user record
            await set(ref(database, `users/${result.user.uid}`), {
                email: result.user.email,
                role: 'player',
                name: playerData.name
            });
            
            showToast('Account created successfully!', 'success');
            // Will trigger onAuthStateChanged which will reload player view
        } catch (error) {
            showToast('Google signup error: ' + error.message, 'error');
        }
    });

    // Signup form handler
    document.getElementById('player-signup-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const password = document.getElementById('player-signup-password').value;
        const confirm = document.getElementById('player-signup-confirm').value;
        
        if (password !== confirm) {
            showToast('Passwords do not match!', 'error');
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, playerData.email, password);
            
            // Create player user record
            await set(ref(database, `users/${userCredential.user.uid}`), {
                email: playerData.email,
                role: 'player',
                name: playerData.name
            });
            
            showToast('Account created successfully!', 'success');
            // Will trigger onAuthStateChanged which will reload player view
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                showToast('Account already exists. Please login instead.', 'error');
                document.getElementById('show-login-tab').click();
            } else {
                showToast('Signup error: ' + error.message, 'error');
            }
        }
    });
}

// ============================================
// ORGANIZER VIEW
// ============================================
async function showOrganizerView() {
    hideAllViews();
    document.getElementById('organizer-view').classList.remove('hidden');
    
    const teamsSnapshot = await get(ref(database, 'teams'));
    const hasTeams = teamsSnapshot.exists() && Object.keys(teamsSnapshot.val()).length > 0;
    
    if (!hasTeams) {
        // Show setup page
        showSetupPage();
    } else {
        // Show dashboard
        showOrganizerDashboard();
    }
}

// Setup Page for First-Time Tournament Setup
function showSetupPage() {
    document.getElementById('organizer-view').innerHTML = `
        <div class="max-w-4xl mx-auto fade-in">
            <div class="bg-white rounded-lg shadow-xl p-6 sm:p-8">
                <h2 class="text-2xl font-bold text-gray-800 mb-4">Tournament Setup</h2>
                <p class="text-gray-600 mb-6">Register all team captains for the tournament</p>
                
                <div class="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p class="text-sm text-green-800">✅ You are authorized to setup the tournament</p>
                    <p class="text-xs text-green-700 mt-1">Logged in as: ${currentUser.email}</p>
                </div>

                <form id="setup-form" class="space-y-6">
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <div class="flex justify-between items-center mb-4">
                            <h4 class="font-bold text-gray-800">Register Team Captains</h4>
                            <button type="button" id="add-captain-btn" class="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 text-sm">
                                + Add Captain
                            </button>
                        </div>
                        <div id="captains-container" class="space-y-4"></div>
                    </div>

                    <button type="submit" id="submit-setup-btn" class="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600">
                        Complete Setup
                    </button>
                </form>
            </div>
        </div>
    `;
    
    // Add initial captain form
    addCaptainFormToSetup();
    
    document.getElementById('add-captain-btn').addEventListener('click', addCaptainFormToSetup);
    document.getElementById('setup-form').addEventListener('submit', handleSetupSubmit);
}

let captainFormCount = 0;

function addCaptainFormToSetup() {
    captainFormCount++;
    const container = document.getElementById('captains-container');
    const leagues = [
        { id: 'pro-volleyball', name: 'Professional Volleyball' },
        { id: 'regular-volleyball', name: 'Regular Volleyball' },
        { id: 'masters-volleyball', name: 'Volleyball 45+' },
        { id: 'women-throwball', name: 'Women Throwball' }
    ];
    
    const captainForm = document.createElement('div');
    captainForm.className = 'border border-gray-300 rounded-lg p-4 space-y-3 captain-form';
    captainForm.innerHTML = `
        <div class="flex justify-between items-center">
            <span class="font-semibold text-gray-700">Captain ${captainFormCount}</span>
            <button type="button" class="remove-captain text-red-600 hover:text-red-700 text-sm">Remove</button>
        </div>
        <select class="captain-league w-full px-3 py-2 border border-gray-300 rounded-lg" required>
            ${leagues.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
        </select>
        <input type="text" class="captain-team w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Team Name" required>
        <input type="text" class="captain-name w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Captain Name" required>
        <input type="email" class="captain-email w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Captain Email" required>
        <input type="tel" class="captain-phone w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Phone (WhatsApp)" required>
        <input type="password" class="captain-password w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Password for Captain" required minlength="6">
    `;
    
    container.appendChild(captainForm);
    
    captainForm.querySelector('.remove-captain').addEventListener('click', () => {
        if (container.querySelectorAll('.captain-form').length > 1) {
            captainForm.remove();
        } else {
            showToast('You must have at least one captain', 'error');
        }
    });
}

async function handleSetupSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-setup-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Setting up...';
    
    try {
        const captainForms = document.querySelectorAll('.captain-form');
        
        for (const form of captainForms) {
            const leagueId = form.querySelector('.captain-league').value;
            const teamName = form.querySelector('.captain-team').value;
            const captainName = form.querySelector('.captain-name').value;
            const captainEmail = form.querySelector('.captain-email').value;
            const captainPhone = form.querySelector('.captain-phone').value;
            const captainPassword = form.querySelector('.captain-password').value;
            
            // Create team
            const teamRef = push(ref(database, 'teams'));
            await set(teamRef, {
                name: teamName,
                leagueId: leagueId,
                captain: {
                    name: captainName,
                    email: captainEmail,
                    phone: captainPhone
                },
                players: {},
                createdAt: new Date().toISOString()
            });
            
            // Create captain record
            const captainRef = push(ref(database, 'captains'));
            await set(captainRef, {
                name: captainName,
                email: captainEmail,
                phone: captainPhone,
                teamId: teamRef.key,
                leagueId: leagueId,
                teamName: teamName
            });
            
            // Create captain user account
            try {
                const captainUserCredential = await createUserWithEmailAndPassword(auth, captainEmail, captainPassword);
                await set(ref(database, `users/${captainUserCredential.user.uid}`), {
                    email: captainEmail,
                    role: 'captain',
                    teamId: teamRef.key,
                    captainId: captainRef.key
                });
            } catch (error) {
                if (error.code !== 'auth/email-already-in-use') {
                    console.error('Error creating captain account:', error);
                }
                // Continue with other captains even if one fails
            }
        }
        
        showToast('Setup complete! Showing dashboard...', 'success');
        setTimeout(() => {
            showOrganizerDashboard();
        }, 1500);
        
    } catch (error) {
        console.error('Setup error:', error);
        showToast('Setup failed: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Complete Setup';
    }
}

async function showOrganizerDashboard() {
    const teamsSnapshot = await get(ref(database, 'teams'));
    
    if (!teamsSnapshot.exists()) {
        showSetupPage();
        return;
    }
    
    const teams = teamsSnapshot.val();
    const stats = calculateStats(teams);
    
    document.getElementById('organizer-view').innerHTML = `
        <div class="space-y-4 sm:space-y-6 fade-in">
            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <div class="flex justify-between items-center">
                    <div>
                        <h2 class="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Organizer Dashboard</h2>
                        <p class="text-sm sm:text-base text-gray-600">Republic Day Tournament 2026 - Overview</p>
                    </div>
                    <button id="add-more-teams-btn" class="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 text-sm">
                        + Add More Teams
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div class="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-4 sm:p-6 shadow-lg">
                    <div class="text-2xl sm:text-3xl font-bold">${stats.totalTeams}</div>
                    <div class="text-xs sm:text-sm opacity-90">Total Teams</div>
                </div>

                <div class="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-4 sm:p-6 shadow-lg">
                    <div class="text-2xl sm:text-3xl font-bold">${stats.totalPlayers}</div>
                    <div class="text-xs sm:text-sm opacity-90">Total Players</div>
                </div>

                <div class="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg p-4 sm:p-6 shadow-lg">
                    <div class="text-2xl sm:text-3xl font-bold">${stats.completedWaivers}</div>
                    <div class="text-xs sm:text-sm opacity-90">Waivers Signed</div>
                </div>

                <div class="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-4 sm:p-6 shadow-lg">
                    <div class="text-2xl sm:text-3xl font-bold">${stats.completedLunch}</div>
                    <div class="text-xs sm:text-sm opacity-90">Lunch Choices</div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Lunch Summary</h3>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center p-3 bg-green-50 rounded">
                            <span class="text-gray-700 text-sm sm:text-base">🥗 Vegetarian</span>
                            <span class="font-bold text-green-600 text-lg">${stats.vegCount}</span>
                        </div>
                        <div class="flex justify-between items-center p-3 bg-red-50 rounded">
                            <span class="text-gray-700 text-sm sm:text-base">🍗 Non-Vegetarian</span>
                            <span class="font-bold text-red-600 text-lg">${stats.nonVegCount}</span>
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Progress</h3>
                    <div class="space-y-4">
                        <div>
                            <div class="flex justify-between text-xs sm:text-sm mb-1">
                                <span>Waivers Completion</span>
                                <span>${stats.totalPlayers > 0 ? Math.round((stats.completedWaivers / stats.totalPlayers) * 100) : 0}%</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div class="bg-orange-500 h-2 rounded-full transition-all" style="width: ${stats.totalPlayers > 0 ? (stats.completedWaivers / stats.totalPlayers) * 100 : 0}%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between text-xs sm:text-sm mb-1">
                                <span>Lunch Selection</span>
                                <span>${stats.totalPlayers > 0 ? Math.round((stats.completedLunch / stats.totalPlayers) * 100) : 0}%</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div class="bg-purple-500 h-2 rounded-full transition-all" style="width: ${stats.totalPlayers > 0 ? (stats.completedLunch / stats.totalPlayers) * 100 : 0}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <h3 class="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6">Teams by League</h3>
                ${Object.entries(groupByLeague(teams)).map(([leagueId, leagueTeams]) => `
                    <div class="mb-6 last:mb-0">
                        <h4 class="text-base sm:text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <span class="text-xl sm:text-2xl">🏐</span>
                            ${getLeagueName(leagueId)}
                        </h4>
                        <div class="space-y-3">
                            ${leagueTeams.map(team => {
                                const playerCount = team.players ? Object.keys(team.players).length : 0;
                                const waiverCount = team.players ? Object.values(team.players).filter(p => p.waiverSigned).length : 0;
                                const lunchCount = team.players ? Object.values(team.players).filter(p => p.lunchChoice).length : 0;
                                
                                return `
                                    <div class="border border-gray-200 rounded-lg p-3 sm:p-4">
                                        <div class="flex justify-between items-start mb-2">
                                            <div class="flex-1">
                                                <h5 class="font-bold text-gray-800">${team.name}</h5>
                                                <p class="text-xs sm:text-sm text-gray-600">
                                                    Captain: ${team.captain.name} (${team.captain.email})
                                                </p>
                                            </div>
                                            <div class="text-right ml-2">
                                                <div class="text-base sm:text-lg font-bold text-gray-800">${playerCount}</div>
                                                <div class="text-xs text-gray-500">players</div>
                                            </div>
                                        </div>
                                        
                                        ${playerCount > 0 ? `
                                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs">
                                                <div class="bg-gray-50 p-2 rounded text-center">
                                                    <div class="font-semibold">${waiverCount}/${playerCount}</div>
                                                    <div class="text-gray-600">Waivers</div>
                                                </div>
                                                <div class="bg-gray-50 p-2 rounded text-center">
                                                    <div class="font-semibold">${lunchCount}/${playerCount}</div>
                                                    <div class="text-gray-600">Lunch</div>
                                                </div>
                                                <div class="bg-gray-50 p-2 rounded text-center col-span-2 sm:col-span-1">
                                                    <div class="font-semibold">${Math.round((waiverCount / playerCount) * 100)}%</div>
                                                    <div class="text-gray-600">Complete</div>
                                                </div>
                                            </div>
                                        ` : `
                                            <p class="text-xs sm:text-sm text-gray-500 mt-2">No players added yet</p>
                                        `}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Add More Teams button
    document.getElementById('add-more-teams-btn').addEventListener('click', () => {
        showSetupPage();
    });
    
    // Real-time updates
    onValue(ref(database, 'teams'), () => {
        showOrganizerDashboard(); // Refresh when data changes
    });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function hideAllViews() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('captain-view').classList.add('hidden');
    document.getElementById('organizer-view').classList.add('hidden');
    document.getElementById('player-view').classList.add('hidden');
}

function getLeagueName(leagueId) {
    const names = {
        'pro-volleyball': 'Professional Volleyball League',
        'regular-volleyball': 'Regular Volleyball League',
        'masters-volleyball': 'Volleyball 45+ League',
        'women-throwball': 'Women Throwball League'
    };
    return names[leagueId] || leagueId;
}

function calculateStats(teams) {
    let totalTeams = 0;
    let totalPlayers = 0;
    let completedWaivers = 0;
    let completedLunch = 0;
    let vegCount = 0;
    let nonVegCount = 0;
    
    Object.values(teams).forEach(team => {
        totalTeams++;
        if (team.players) {
            Object.values(team.players).forEach(player => {
                totalPlayers++;
                if (player.waiverSigned) completedWaivers++;
                if (player.lunchChoice) {
                    completedLunch++;
                    if (player.lunchChoice === 'veg') vegCount++;
                    else nonVegCount++;
                }
            });
        }
    });
    
    return {
        totalTeams,
        totalPlayers,
        completedWaivers,
        completedLunch,
        vegCount,
        nonVegCount
    };
}

function groupByLeague(teams) {
    const grouped = {};
    Object.entries(teams).forEach(([teamId, team]) => {
        if (!grouped[team.leagueId]) {
            grouped[team.leagueId] = [];
        }
        grouped[team.leagueId].push({ ...team, id: teamId });
    });
    return grouped;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
        warning: 'bg-yellow-500'
    };
    
    toast.className = `${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in`;
    toast.innerHTML = `
        <span class="flex-1">${message}</span>
        <button class="text-white hover:text-gray-200" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}
