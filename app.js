// ============================================
// ORGANIZER EMAIL WHITELIST
// ============================================
// ONLY THESE EMAILS CAN ACCESS TOURNAMENT SETUP
const AUTHORIZED_ORGANIZERS = [
    "qpinme@gmail.com",
    "rbalakr@gmail.com",
    "droidment@gmail.com"
];

// ============================================
// FIREBASE INITIALIZATION
// ============================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getDatabase, ref, set, get, push, remove, onValue, update, query, orderByChild, equalTo } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

// ============================================
// FIREBASE CONFIGURATION
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyB1zUvkLhY--wd3QjjMI3_hn6d1iWqKmIc",
  authDomain: "rd-tournament-d7257.firebaseapp.com",
  databaseURL: "https://rd-tournament-d7257-default-rtdb.firebaseio.com",
  projectId: "rd-tournament-d7257",
  storageBucket: "rd-tournament-d7257.firebasestorage.app",
  messagingSenderId: "44554845474",
  appId: "1:44554845474:web:2569c71c0f3261fbbb397b"
};

let app, auth, database;
let currentUser = null;
let userRole = null;
let userTeamId = null;
let userTeamIds = []; // Array to store all team IDs for captains with multiple teams

// Expose to window for debugging - attach to window immediately
window.debugTeamInfo = function() {
    console.log('═══════════════════════════════════════');
    console.log('DEBUG INFO:');
    console.log('Current User:', currentUser?.email || 'Not logged in');
    console.log('User Role:', userRole || 'None');
    console.log('Current Team ID:', userTeamId || 'None');
    console.log('All Team IDs:', userTeamIds);
    console.log('Number of Teams:', userTeamIds.length);
    console.log('═══════════════════════════════════════');
    return {
        email: currentUser?.email,
        role: userRole,
        currentTeamId: userTeamId,
        allTeamIds: userTeamIds,
        teamCount: userTeamIds.length
    };
};

// Also expose variables directly for easier console access
window.getTeamCount = function() {
    return userTeamIds.length;
};

window.getAllTeamIds = function() {
    return userTeamIds;
};

// Check if Firebase is configured
function isFirebaseConfigured() {
    return !firebaseConfig.apiKey.includes('YOUR_');
}

// Check if user is authorized organizer
async function isAuthorizedOrganizer(email) {
    // Defensive check - ensure email is valid
    if (!email || typeof email !== 'string') {
        console.warn('isAuthorizedOrganizer called with invalid email:', email);
        return false;
    }
    
    // Check hardcoded list first
    if (AUTHORIZED_ORGANIZERS.map(e => e.toLowerCase()).includes(email.toLowerCase())) {
        return true;
    }
    
    // Check database for dynamically added organizers
    try {
        const organizersRef = ref(database, 'organizers');
        const organizersSnapshot = await get(organizersRef);
        
        if (organizersSnapshot.exists()) {
            const organizers = organizersSnapshot.val();
            return Object.values(organizers).some(org => 
                org.email && org.email.toLowerCase() === email.toLowerCase()
            );
        }
    } catch (error) {
        console.error('Error checking organizer status:', error);
    }
    
    return false;
}


function askForRole() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-lg max-w-md w-full p-6">
                <h3 class="text-xl font-bold text-gray-800 mb-4">Choose Your Role</h3>
                <p class="text-gray-600 mb-6">You are registered as both an organizer and a team captain. Which role would you like to use?</p>
                <div class="flex gap-3">
                    <button class="choose-organizer flex-1 bg-blue-100 text-gray-800 py-3 rounded-lg hover:bg-blue-200">
                        Organizer Dashboard
                    </button>
                    <button class="choose-captain flex-1 bg-cyan-100 text-gray-800 py-3 rounded-lg hover:bg-cyan-200">
                        My Team (Captain)
                    </button>
                </div>
                <p class="text-xs text-gray-500 mt-3 text-center">You can switch roles anytime using the button in the header</p>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.querySelector('.choose-organizer').addEventListener('click', () => {
            modal.remove();
            resolve('organizer');
        });
        
        modal.querySelector('.choose-captain').addEventListener('click', () => {
            modal.remove();
            resolve('captain');
        });
    });
}

function showRoleSwitcher(currentRole, captainSnapshot) {
    const userInfo = document.getElementById('user-info');
    
    // Remove existing switcher if present
    const existingSwitcher = document.getElementById('role-switcher');
    if (existingSwitcher) existingSwitcher.remove();
    
    const switcher = document.createElement('button');
    switcher.id = 'role-switcher';
    switcher.className = 'ml-3 bg-indigo-100 text-gray-800 px-3 py-1 rounded text-sm hover:bg-indigo-200';
    switcher.textContent = currentRole === 'organizer' ? '🏐 Switch to Captain' : '⚙️ Switch to Organizer';
    
    switcher.addEventListener('click', async () => {
        const newRole = currentRole === 'organizer' ? 'captain' : 'organizer';
        
        // Update role in database
        const updates = { role: newRole };
        
        if (newRole === 'captain' && captainSnapshot.exists()) {
            const captainId = Object.keys(captainSnapshot.val())[0];
            const captainData = captainSnapshot.val()[captainId];
            updates.teamId = captainData.teamId;
            updates.captainId = captainId;
        }
        
        await update(ref(database, `users/${currentUser.uid}`), updates);
        
        showToast(`Switched to ${newRole} view`, 'success');
        window.location.reload();
    });
    
    userInfo.appendChild(switcher);
}

// Initialize app
document.addEventListener('DOMContentLoaded', async function() {
    // Detect WhatsApp browser
    const isWhatsApp = /whatsapp/i.test(navigator.userAgent);
    
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
        
        document.getElementById('loading-screen').classList.add('hidden');
        
        // Show WhatsApp-specific message if detected
        if (isWhatsApp) {
            showWhatsAppBrowserError();
        } else {
            showToast('Error initializing app: ' + error.message, 'error');
        }
    }
});

// ============================================
// AUTHENTICATION HANDLERS
// ============================================
async function handleAuthUser(user) {
    currentUser = user;
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('user-info').classList.remove('hidden');
    
    // Attach logout button event listener
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    try {
        // Validate user has email
        if (!user.email) {
            console.error('User authenticated but has no email:', user);
            showToast('Authentication error: No email found. Please try logging in again.', 'error');
            await signOut(auth);
            return;
        }
        
        // Get user role from database
        const userRef = ref(database, `users/${user.uid}`);
        const userSnapshot = await get(userRef);
        
        console.log('🔍 Debug - User email:', user.email);
        console.log('🔍 Debug - User exists in DB:', userSnapshot.exists());
        
        // Check if user is both organizer and captain
        const isOrganizer = await isAuthorizedOrganizer(user.email);
        
        // Find ALL teams where this user is captain
        const allTeamsRef = ref(database, 'teams');
        const allTeamsSnapshot = await get(allTeamsRef);
        const captainTeams = [];
        
        if (allTeamsSnapshot.exists()) {
            const teams = allTeamsSnapshot.val();
            const currentEmail = user.email.toLowerCase().trim();
            
            console.log('═══════════════════════════════════════');
            console.log('🔐 AUTH - TEAM DETECTION DEBUG');
            console.log('═══════════════════════════════════════');
            console.log('User email:', user.email);
            console.log('Normalized:', currentEmail);
            console.log('Total teams:', Object.keys(teams).length);
            console.log('───────────────────────────────────────');
            
            Object.entries(teams).forEach(([teamId, team]) => {
                const teamCaptainEmail = team.captain?.email?.toLowerCase().trim() || 'NO EMAIL';
                const isMatch = team.captain && team.captain.email && teamCaptainEmail === currentEmail;
                
                console.log(`Team: ${team.name}`);
                console.log(`  Captain: ${team.captain?.email || 'MISSING'}`);
                console.log(`  Match? ${isMatch ? '✅' : '❌'}`);
                
                if (isMatch) {
                    captainTeams.push({
                        id: teamId,
                        name: team.name,
                        leagueId: team.leagueId,
                        captain: team.captain
                    });
                }
            });
            
            console.log('───────────────────────────────────────');
            console.log('Teams found:', captainTeams.length);
            console.log('Teams:', captainTeams.map(t => t.name));
            console.log('═══════════════════════════════════════');
        }
        
        const isCaptain = captainTeams.length > 0;
        userTeamIds = captainTeams.map(t => t.id);
        
        console.log('🔍 Debug - Is organizer:', isOrganizer);
        console.log('🔍 Debug - Is captain:', isCaptain);
        console.log('🔍 Debug - Captain teams:', captainTeams);
        
        if (userSnapshot.exists()) {
            const userData = userSnapshot.val();
            userRole = userData.role;
            
            // If user is captain and has team info, verify it's valid
            if (userRole === 'captain' && userData.teamId) {
                userTeamId = userData.teamId;
            } else if (userRole === 'captain' && captainTeams.length > 0) {
                // Set to first team if no team ID stored
                userTeamId = captainTeams[0].id;
            }
            
            console.log('🔍 Debug - User role:', userRole);
            console.log('🔍 Debug - Team ID:', userTeamId);
            console.log('🔍 Debug - All Team IDs:', userTeamIds);
            console.log('🔍 Debug - About to show captain view with', userTeamIds.length, 'total teams');
            
            // If user is both organizer and captain, show role switcher
            if (isOrganizer && isCaptain) {
                showRoleSwitcher(userRole, captainTeams);
            }
            
            if (userRole === 'organizer') {
                await showOrganizerView();
            } else if (userRole === 'captain') {
                console.log('🎯 Calling showCaptainView() - should find', userTeamIds.length, 'teams');
                await showCaptainView();
            }
        } else {
            console.log('🔍 Debug - New user, checking registration...');
            // New user - check if they're a registered captain or authorized organizer
            if (isCaptain) {
                console.log('🔍 Debug - Captain data:', captainTeams);
                
                // If they're also an organizer, ask which role they want
                if (isOrganizer) {
                    const role = await askForRole();
                    if (role === 'organizer') {
                        await set(userRef, {
                            email: user.email,
                            role: 'organizer',
                            createdAt: new Date().toISOString()
                        });
                        userRole = 'organizer';
                        await showOrganizerView();
                    } else {
                        await set(userRef, {
                            email: user.email,
                            role: 'captain',
                            teamId: captainTeams[0].id // Default to first team
                        });
                        userRole = 'captain';
                        userTeamId = captainTeams[0].id;
                        await showCaptainView();
                    }
                    showRoleSwitcher(userRole, captainTeams);
                } else {
                    console.log('🔍 Debug - Creating captain user record...');
                    await set(userRef, {
                        email: user.email,
                        role: 'captain',
                        teamId: captainTeams[0].id // Default to first team
                    });
                    
                    userRole = 'captain';
                    userTeamId = captainTeams[0].id;
                    await showCaptainView();
                }
            } else if (isOrganizer) {
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
                console.log('🔍 Debug - User not registered as captain or organizer');
                showToast('You are not registered. Please contact the organizer.', 'error');
                await signOut(auth);
            }
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
        console.error('Error details:', error.message, error.code);
        showToast('Error loading user data: ' + error.message, 'error');
        
        // If permission denied, might be Firebase rules issue
        if (error.code === 'PERMISSION_DENIED' || error.message.includes('permission')) {
            showToast('Database permission error. Please check Firebase rules.', 'error');
        }
    }
}

// ============================================
// LOGIN VIEW
// ============================================
function showWhatsAppBrowserError() {
    hideAllViews();
    
    // Get current URL to copy
    const currentUrl = window.location.href;
    
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('login-view').innerHTML = `
        <div class="max-w-md mx-auto mt-8 fade-in">
            <div class="bg-white rounded-lg shadow-xl p-6 sm:p-8">
                <div class="text-center mb-6">
                    <div class="text-4xl mb-3">⚠️</div>
                    <h2 class="text-2xl font-bold text-orange-600 mb-2">WhatsApp Browser Not Supported</h2>
                    <p class="text-sm text-gray-600">Please open this link in your regular browser</p>
                </div>

                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                    <p class="text-sm text-gray-700 mb-3">
                        WhatsApp's built-in browser blocks certain features needed for registration.
                    </p>
                    <p class="text-sm text-gray-700 font-semibold">
                        Please open this link in:
                    </p>
                    <ul class="text-sm text-gray-700 mt-2 space-y-1 list-disc list-inside">
                        <li>Chrome</li>
                        <li>Safari</li>
                        <li>Firefox</li>
                        <li>Any other browser</li>
                    </ul>
                </div>

                <div class="space-y-3">
                    <button onclick="navigator.clipboard.writeText('${currentUrl}').then(() => alert('Link copied! Now paste it in your browser.'))" class="w-full bg-blue-100 text-gray-800 py-3 rounded-lg font-semibold hover:bg-blue-200 transition">
                        📋 Copy Link
                    </button>
                    
                    <button onclick="window.location.href = '${currentUrl}'" class="w-full bg-cyan-100 text-gray-800 py-3 rounded-lg font-semibold hover:bg-cyan-200 transition">
                        🔄 Try Opening Anyway
                    </button>
                </div>

                <div class="mt-6 p-4 bg-gray-50 rounded-lg">
                    <p class="text-xs text-gray-600 font-semibold mb-2">How to open in browser:</p>
                    <ol class="text-xs text-gray-600 space-y-2 list-decimal list-inside">
                        <li>Tap the three dots (⋮) at the top of WhatsApp</li>
                        <li>Select "Open in browser" or "Open in Chrome/Safari"</li>
                        <li>Or copy the link and paste it in your browser</li>
                    </ol>
                </div>

                <div class="text-xs text-gray-500 text-center mt-4">
                    <p>Need help? Contact your team captain</p>
                </div>
            </div>
        </div>
    `;
}

function showLoginView() {
    hideAllViews();
    document.getElementById('login-view').classList.remove('hidden');
    
    document.getElementById('login-view').innerHTML = `
        <div class="max-w-md mx-auto mt-8 sm:mt-12 fade-in">
            <div class="bg-white rounded-lg shadow-xl p-6 sm:p-8">
                <h2 class="text-2xl font-bold text-center mb-6 text-gray-800">Tournament Login</h2>
                
                <form id="email-login-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input type="email" id="login-email" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none" required placeholder="your@email.com">
                        <p class="text-xs text-gray-500 mt-1">Use the email you registered with</p>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                        <input type="password" id="login-password" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none" required placeholder="Min 6 characters" minlength="6">
                        <p class="text-xs text-gray-500 mt-1">First time? Create a new password (min 6 characters)</p>
                    </div>

                    <button type="submit" class="w-full bg-blue-100 text-gray-800 py-3 rounded-lg font-semibold hover:bg-blue-200 transition">
                        Login / Sign Up
                    </button>
                </form>
                
                <div class="mt-6 text-center">
                    <div class="text-gray-500 text-sm mb-3">or</div>
                    <button id="google-login-btn" class="w-full bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-2">
                        <svg class="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Sign in with Google
                    </button>
                </div>

                <div class="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-gray-700">
                    <p class="font-semibold mb-2">📧 For Captains & Organizers:</p>
                    <ul class="text-xs space-y-1 ml-4 list-disc">
                        <li>Enter your registered email and create a password</li>
                        <li>First time? Just type a password and it will create your account</li>
                        <li>Have Gmail? Use "Sign in with Google" button above</li>
                    </ul>
                </div>
                
                <div class="mt-4 p-4 bg-green-50 rounded-lg text-sm text-gray-700">
                    <p class="font-semibold mb-2">👥 For Players:</p>
                    <p class="text-xs">Click the registration link sent by your captain via WhatsApp</p>
                </div>
            </div>
        </div>
    `;
    
    // Attach event listeners
    document.getElementById('google-login-btn').addEventListener('click', handleGoogleLogin);
    document.getElementById('email-login-form').addEventListener('submit', handleEmailLogin);
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
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        // Try to sign in first
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Login successful!', 'success');
    } catch (error) {
        console.log('Login error code:', error.code); // Debug logging
        
        // If user not found or invalid credentials, try to create account
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            try {
                showToast('Creating your account...', 'info');
                await createUserWithEmailAndPassword(auth, email, password);
                showToast('Account created successfully!', 'success');
            } catch (signupError) {
                console.log('Signup error code:', signupError.code); // Debug logging
                
                if (signupError.code === 'auth/email-already-in-use') {
                    showToast('Email already in use. Try logging in with your existing password.', 'error');
                } else if (signupError.code === 'auth/weak-password') {
                    showToast('Password is too weak. Use at least 6 characters.', 'error');
                } else {
                    showToast('Signup error: ' + signupError.message, 'error');
                }
            }
        } else if (error.code === 'auth/wrong-password') {
            showToast('Incorrect password. Please try again.', 'error');
        } else if (error.code === 'auth/invalid-email') {
            showToast('Invalid email format', 'error');
        } else if (error.code === 'auth/too-many-requests') {
            showToast('Too many failed attempts. Please try again later.', 'error');
        } else {
            showToast('Login error: ' + error.message + ' (Code: ' + error.code + ')', 'error');
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
                        <button type="button" id="add-captain-btn" class="mt-3 w-full bg-teal-100 text-gray-800 py-2 rounded-lg hover:bg-teal-200">
                            + Add Captain
                        </button>
                    </div>

                    <button type="submit" class="w-full bg-blue-100 text-gray-800 py-3 rounded-lg font-semibold hover:bg-blue-200">
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
    
    const submitBtn = document.getElementById('submit-setup-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Setting up...';
    }
    
    try {
        showToast('Setting up tournament...', 'info');
        
        // Check if this is from modal (has org-email) or setup page (no org-email)
        const orgEmailInput = document.getElementById('org-email');
        
        if (orgEmailInput) {
            // From modal - need to create organizer account first
            const orgEmail = orgEmailInput.value;
            const orgPassword = document.getElementById('org-password').value;
            
            // Create organizer account
            const orgUserCredential = await createUserWithEmailAndPassword(auth, orgEmail, orgPassword);
            await set(ref(database, `users/${orgUserCredential.user.uid}`), {
                email: orgEmail,
                role: 'organizer',
                createdAt: new Date().toISOString()
            });
        }
        
        // Get all captain forms (works for both modal and setup page)
        const captainForms = document.querySelectorAll('.captain-form');
        
        if (captainForms.length === 0) {
            showToast('Please add at least one team', 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Complete Setup';
            }
            return;
        }
        
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
    
    // Get all captain teams for the selector
    const allTeamsRef = ref(database, 'teams');
    const allTeamsSnapshot = await get(allTeamsRef);
    const captainTeams = [];
    
    if (allTeamsSnapshot.exists() && currentUser) {
        const teams = allTeamsSnapshot.val();
        const currentEmail = currentUser.email.toLowerCase().trim();
        
        console.log('═══════════════════════════════════════');
        console.log('🔍 TEAM DETECTION DEBUG');
        console.log('═══════════════════════════════════════');
        console.log('Current user email:', currentUser.email);
        console.log('Normalized email:', currentEmail);
        console.log('Total teams in database:', Object.keys(teams).length);
        console.log('───────────────────────────────────────');
        
        Object.entries(teams).forEach(([teamId, team]) => {
            const teamCaptainEmail = team.captain?.email?.toLowerCase().trim() || 'NO EMAIL';
            const isMatch = team.captain && team.captain.email && teamCaptainEmail === currentEmail;
            
            console.log(`Team: ${team.name}`);
            console.log(`  Captain email: ${team.captain?.email || 'MISSING'}`);
            console.log(`  Normalized: ${teamCaptainEmail}`);
            console.log(`  Match? ${isMatch ? '✅ YES' : '❌ NO'}`);
            
            if (isMatch) {
                console.log(`  ✅ ADDING TO CAPTAIN'S LIST`);
                captainTeams.push({
                    id: teamId,
                    name: team.name,
                    leagueId: team.leagueId
                });
            }
            console.log('───────────────────────────────────────');
        });
        
        console.log('═══════════════════════════════════════');
        console.log('FINAL RESULTS:');
        console.log('Teams found:', captainTeams.length);
        console.log('Team list:', captainTeams.map(t => t.name));
        console.log('Dropdown will show?', captainTeams.length > 1 ? 'YES ✅' : 'NO ❌');
        console.log('═══════════════════════════════════════');
    }
    
    // Check if captain is already registered as a player
    const captainEmail = teamData.captain && teamData.captain.email ? teamData.captain.email.toLowerCase() : '';
    const captainAsPlayer = Object.entries(players).find(([_, p]) => 
        p.email && captainEmail && p.email.toLowerCase() === captainEmail
    );
    
    document.getElementById('captain-view').innerHTML = `
        <div class="space-y-4 sm:space-y-6 fade-in">
            ${captainTeams.length > 1 ? `
                <div class="bg-gradient-to-r from-blue-100 to-cyan-100 rounded-lg shadow-lg p-4">
                    <div class="flex items-center justify-between gap-4">
                        <div class="flex items-center gap-3">
                            <div class="text-2xl">👥</div>
                            <div>
                                <p class="text-xs text-gray-600 font-semibold">You captain ${captainTeams.length} teams!</p>
                                <p class="text-xs text-gray-500">Select team to manage:</p>
                            </div>
                        </div>
                        <select id="team-selector" class="px-4 py-2 border-2 border-blue-300 rounded-lg bg-white text-gray-800 font-semibold focus:ring-2 focus:ring-blue-500">
                            ${captainTeams.map(team => `
                                <option value="${team.id}" ${team.id === userTeamId ? 'selected' : ''}>
                                    ${team.name} (${getLeagueName(team.leagueId).replace(' Volleyball', '').replace(' Throwball', '')})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
            ` : ''}
            
            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <h2 class="text-xl sm:text-2xl font-bold text-gray-800 mb-2">${teamData.name}</h2>
                <p class="text-sm sm:text-base text-gray-600">${teamData.captain.name}</p>
                <p class="text-xs sm:text-sm text-gray-500 mt-1">
                    ${getLeagueName(teamData.leagueId)}
                </p>
                
                ${!captainAsPlayer ? `
                    <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p class="text-sm text-gray-700 mb-3">
                            ⚠️ <strong>Captain:</strong> You're not registered as a player yet! 
                            You need to sign the waiver and select lunch preference to play.
                        </p>
                        <button id="register-captain-btn" class="bg-cyan-100 text-gray-800 px-4 py-2 rounded-lg hover:bg-cyan-200 text-sm">
                            Register Myself as Player
                        </button>
                    </div>
                ` : captainAsPlayer[1].waiverSigned ? `
                    <div class="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p class="text-sm text-green-800">
                            ✓ You're registered as a player | Lunch: ${getLunchChoiceDisplay(captainAsPlayer[1].lunchChoice)}
                        </p>
                    </div>
                ` : `
                    <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p class="text-sm text-yellow-800">
                            ⚠️ You're added as a player but haven't signed the waiver yet!
                        </p>
                        <button class="complete-registration-btn bg-yellow-100 text-gray-800 px-3 py-2 rounded-lg hover:bg-yellow-200 text-sm mt-2" data-player-id="${captainAsPlayer[0]}">
                            Complete Registration
                        </button>
                    </div>
                `}
            </div>

            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
                    <div>
                        <h3 class="text-lg sm:text-xl font-bold text-gray-800">Team Roster</h3>
                        <p class="text-xs sm:text-sm text-gray-600">${Object.keys(players).length} players</p>
                    </div>
                    <div class="flex gap-2">
                        ${Object.keys(players).length > 0 ? `
                            <button id="message-players-btn" class="bg-indigo-100 text-gray-800 px-3 py-2 rounded-lg hover:bg-indigo-200 text-xs sm:text-sm whitespace-nowrap">
                                📱 Message Players
                            </button>
                        ` : ''}
                        <button id="add-player-btn" class="bg-blue-100 text-gray-800 px-3 py-2 sm:px-4 sm:py-2 rounded-lg hover:bg-blue-200 text-sm sm:text-base whitespace-nowrap">
                            + Add
                        </button>
                    </div>
                </div>

                <div id="players-list" class="space-y-3 sm:space-y-4">
                    ${Object.keys(players).length === 0 ? `
                        <div class="text-center py-8 text-gray-500">
                            <p class="mb-2">No players added yet</p>
                            <p class="text-sm">Click "Add" to add your first player</p>
                        </div>
                    ` : Object.entries(players).map(([playerId, player]) => {
                        const displayEmail = player.email && player.email !== 'undefined' && player.email.trim() !== '' 
                            ? player.email 
                            : '📧 Not provided yet';
                        const emailClass = player.email && player.email !== 'undefined' && player.email.trim() !== ''
                            ? 'text-gray-600'
                            : 'text-yellow-600 italic';
                        
                        return `
                        <div class="border border-gray-200 rounded-lg p-3 sm:p-4 hover:border-blue-300 transition">
                            <div class="flex justify-between items-start gap-3">
                                <div class="flex-1 min-w-0">
                                    <h4 class="font-semibold text-gray-800 truncate">${player.name}</h4>
                                    <p class="text-xs sm:text-sm ${emailClass} truncate">${displayEmail}</p>
                                    <p class="text-xs sm:text-sm text-gray-600">${player.phone}</p>
                                    
                                    <div class="mt-2 sm:mt-3 flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
                                        <div class="flex items-center gap-1">
                                            ${player.waiverSigned ? 
                                                '<span class="text-green-600 font-semibold">✅ Waiver</span>' : 
                                                '<span class="text-red-600 font-semibold">❌ Waiver</span>'
                                            }
                                        </div>
                                        <div class="flex items-center gap-1">
                                            ${player.lunchChoice ? 
                                                `<span class="text-green-600 font-semibold">🍽️ ${getLunchChoiceDisplay(player.lunchChoice)}</span>` : 
                                                '<span class="text-orange-600 font-semibold">⏳ Lunch Pending</span>'
                                            }
                                        </div>
                                    </div>
                                </div>

                                <div class="flex flex-col gap-2">
                                    <button class="edit-player bg-cyan-100 text-gray-800 px-3 py-1 rounded text-xs sm:text-sm hover:bg-cyan-200 whitespace-nowrap" data-player-id="${playerId}">
                                        ✏️ Edit
                                    </button>
                                    <button class="share-whatsapp bg-teal-100 text-gray-800 px-3 py-1 rounded text-xs sm:text-sm hover:bg-teal-200 whitespace-nowrap" data-player-id="${playerId}" data-player-name="${player.name}" data-player-phone="${player.phone}" data-player-email="${player.email || ''}">
                                        📱 WhatsApp
                                    </button>
                                    <button class="copy-link bg-gray-300 text-gray-800 px-3 py-1 rounded text-xs sm:text-sm hover:bg-gray-400 whitespace-nowrap" data-player-id="${playerId}">
                                        🔗 Copy Link
                                    </button>
                                    <button class="remove-player bg-red-100 text-gray-800 px-3 py-1 rounded text-xs sm:text-sm hover:bg-red-200 whitespace-nowrap" data-player-id="${playerId}">
                                        🗑️ Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
    
    // Team selector event listener
    const teamSelector = document.getElementById('team-selector');
    if (teamSelector) {
        teamSelector.addEventListener('change', async (e) => {
            userTeamId = e.target.value;
            // Update user's teamId in database
            if (currentUser) {
                await update(ref(database, `users/${currentUser.uid}`), {
                    teamId: userTeamId
                });
            }
            showToast('Switched teams!', 'success');
            await showCaptainView(); // Reload view with new team
        });
    }
    
    // Attach event listeners
    document.getElementById('add-player-btn').addEventListener('click', () => showAddPlayerModal(userTeamId));
    
    // Message Players button
    const messagePlayersBtn = document.getElementById('message-players-btn');
    if (messagePlayersBtn) {
        messagePlayersBtn.addEventListener('click', () => {
            messageCaptainPlayers(teamData, players);
        });
    }
    
    // Captain self-registration button
    const registerCaptainBtn = document.getElementById('register-captain-btn');
    if (registerCaptainBtn) {
        registerCaptainBtn.addEventListener('click', async () => {
            const playerData = {
                name: teamData.captain.name,
                email: teamData.captain.email,
                phone: teamData.captain.phone,
                waiverSigned: false,
                lunchChoice: null,
                addedAt: new Date().toISOString()
            };
            
            try {
                const playerRef = push(ref(database, `teams/${userTeamId}/players`));
                await set(playerRef, playerData);
                
                // Generate the registration link
                const link = `${window.location.origin}${window.location.pathname}?player=${playerRef.key}`;
                
                showToast('You have been added as a player!', 'success');
                
                // Show modal with link
                const modal = document.createElement('div');
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
                modal.innerHTML = `
                    <div class="bg-white rounded-lg max-w-md w-full p-6">
                        <h3 class="text-xl font-bold text-gray-800 mb-4">Complete Your Registration</h3>
                        <p class="text-gray-700 mb-4">Click the button below to complete your registration (sign waiver & select lunch):</p>
                        <a href="${link}" class="block w-full bg-blue-100 text-gray-800 py-3 rounded-lg text-center hover:bg-blue-200 mb-3">
                            Complete Registration Now
                        </a>
                        <button class="close-modal w-full bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">
                            I'll Do It Later
                        </button>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.querySelector('.close-modal').addEventListener('click', () => {
                    modal.remove();
                    showCaptainView();
                });
            } catch (error) {
                showToast('Error adding you as player: ' + error.message, 'error');
            }
        });
    }
    
    // Complete registration button (if captain added but not signed waiver)
    document.querySelectorAll('.complete-registration-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const playerId = e.target.dataset.playerId;
            const link = `${window.location.origin}${window.location.pathname}?player=${playerId}`;
            window.location.href = link;
        });
    });
    
    // Edit player button
    document.querySelectorAll('.edit-player').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const playerId = e.target.dataset.playerId;
            showEditPlayerModal(userTeamId, playerId, players[playerId]);
        });
    });
    
    document.querySelectorAll('.share-whatsapp').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const playerId = e.target.dataset.playerId;
            const playerName = e.target.dataset.playerName;
            const playerPhone = e.target.dataset.playerPhone;
            const playerEmail = e.target.dataset.playerEmail || '';
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
            const playerName = players[playerId].name;
            if (confirm(`Remove ${playerName} from your team?`)) {
                await removePlayer(userTeamId, playerId);
                showCaptainView(); // Refresh view
            }
        });
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
                    <label class="block text-sm font-medium text-gray-700 mb-1">Player Name *</label>
                    <input type="text" id="player-name" class="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone (WhatsApp) *</label>
                    <input type="tel" id="player-phone" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="+1234567890" required>
                </div>
                
                <p class="text-xs text-gray-500">* Email will be collected when the player signs the waiver</p>

                <div class="flex gap-3">
                    <button type="button" id="cancel-add" class="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">
                        Cancel
                    </button>
                    <button type="submit" class="flex-1 bg-blue-100 text-gray-800 py-2 rounded-lg hover:bg-blue-200">
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
            email: null, // Email will be filled when they sign waiver
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

function showEditPlayerModal(teamId, playerId, playerData) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-md w-full p-6">
            <h3 class="text-xl font-bold text-gray-800 mb-4">✏️ Edit Player</h3>
            
            <form id="edit-player-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Player Name *</label>
                    <input type="text" id="edit-player-name" value="${playerData.name}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" required>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone (WhatsApp) *</label>
                    <input type="tel" id="edit-player-phone" value="${playerData.phone}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="+1234567890" required>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
                    <input type="email" id="edit-player-email" value="${playerData.email || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="player@example.com">
                    <p class="text-xs text-gray-500 mt-1">Email will be collected when player signs waiver if not provided</p>
                </div>

                <div class="flex gap-3">
                    <button type="button" id="cancel-edit" class="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 font-semibold">
                        Cancel
                    </button>
                    <button type="submit" class="flex-1 bg-cyan-100 text-gray-800 py-2 rounded-lg hover:bg-cyan-200 font-semibold">
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('cancel-edit').addEventListener('click', () => modal.remove());
    
    document.getElementById('edit-player-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const updatedName = document.getElementById('edit-player-name').value.trim();
        const updatedPhone = document.getElementById('edit-player-phone').value.trim();
        const updatedEmail = document.getElementById('edit-player-email').value.trim();
        
        if (!updatedName || !updatedPhone) {
            showToast('Name and phone are required', 'error');
            return;
        }
        
        const updates = {
            name: updatedName,
            phone: updatedPhone
        };
        
        // Only update email if provided
        if (updatedEmail) {
            updates.email = updatedEmail;
        }
        
        try {
            await update(ref(database, `teams/${teamId}/players/${playerId}`), updates);
            showToast('✅ Player updated successfully!', 'success');
            modal.remove();
            showCaptainView(); // Refresh view
        } catch (error) {
            console.error('Error updating player:', error);
            showToast('Error updating player: ' + error.message, 'error');
        }
    });
    
    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
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

function messageCaptainPlayers(teamData, players) {
    const playersList = Object.entries(players);
    
    if (playersList.length === 0) {
        showToast('No players to message', 'error');
        return;
    }
    
    // Filter options
    const pendingWaiverPlayers = playersList.filter(([_, p]) => !p.waiverSigned);
    const pendingLunchPlayers = playersList.filter(([_, p]) => !p.lunchChoice);
    const completePlayers = playersList.filter(([_, p]) => p.waiverSigned && p.lunchChoice);
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 class="text-xl font-bold text-gray-800 mb-4">Message Your Players</h3>
            
            <div class="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <p class="text-sm text-gray-700 mb-2">
                    <strong>Select which players to message:</strong>
                </p>
                <div class="space-y-2">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="player-filter" value="all" checked class="w-4 h-4">
                        <span class="text-sm">All Players (${playersList.length})</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="player-filter" value="pending-waiver" class="w-4 h-4">
                        <span class="text-sm">⚠️ Pending Waiver Only (${pendingWaiverPlayers.length})</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="player-filter" value="pending-lunch" class="w-4 h-4">
                        <span class="text-sm">🍽️ Pending Lunch Only (${pendingLunchPlayers.length})</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="player-filter" value="complete" class="w-4 h-4">
                        <span class="text-sm">✅ Completed Only (${completePlayers.length})</span>
                    </label>
                </div>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">Message Template:</label>
                <textarea id="player-message" class="w-full px-3 py-2 border border-gray-300 rounded-lg h-40 text-sm">Hi {name}!

Reminder from your captain for Republic Day Tournament 2026 🏐

*Team:* ${teamData.name}

Please complete your registration ASAP:
✅ Sign the waiver
✅ Select lunch preference

*Tournament Date:* January 24, 2026

Click your registration link to complete!

See you at the tournament! 🎉</textarea>
            </div>
            
            <div class="flex gap-3">
                <button class="close-modal flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">
                    Cancel
                </button>
                <button id="send-to-players" class="flex-1 bg-indigo-100 text-gray-800 py-2 rounded-lg hover:bg-indigo-200">
                    Open WhatsApp for Selected Players
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    
    modal.querySelector('#send-to-players').addEventListener('click', () => {
        const messageTemplate = document.getElementById('player-message').value;
        const filter = document.querySelector('input[name="player-filter"]:checked').value;
        
        let selectedPlayers = playersList;
        if (filter === 'pending-waiver') selectedPlayers = pendingWaiverPlayers;
        if (filter === 'pending-lunch') selectedPlayers = pendingLunchPlayers;
        if (filter === 'complete') selectedPlayers = completePlayers;
        
        if (selectedPlayers.length === 0) {
            showToast('No players match the selected filter', 'error');
            return;
        }
        
        let successCount = 0;
        selectedPlayers.forEach(([playerId, player], index) => {
            setTimeout(() => {
                const personalizedMessage = messageTemplate.replace('{name}', player.name);
                const whatsappUrl = `https://wa.me/${player.phone.replace(/\D/g, '')}?text=${encodeURIComponent(personalizedMessage)}`;
                window.open(whatsappUrl, '_blank');
                successCount++;
                
                if (successCount === selectedPlayers.length) {
                    showToast(`Opened WhatsApp for ${selectedPlayers.length} players!`, 'success');
                }
            }, index * 1000);
        });
        
        modal.remove();
    });
}

function shareViaWhatsApp(playerId, playerName, playerPhone, playerEmail, teamName) {
    const link = `${window.location.origin}${window.location.pathname}?player=${playerId}`;
    
    // Handle undefined or null email
    const emailText = playerEmail && playerEmail !== 'undefined' && playerEmail.trim() !== '' 
        ? playerEmail 
        : 'You will provide your email when you register';
    
    const message = `Hi ${playerName}!

You've been added to *${teamName}* for the *Republic Day Tournament 2026* 🏐

*IMPORTANT: Complete Your Registration*

*Step 1:* Click this link to open the tournament app:
${link}

*Step 2:* Create your account or login using:
📧 Email: ${emailText}

*Step 3:* Sign the waiver form

*Step 4:* Select your lunch preference (Veg/Non-Veg)

*What you need to do:*
✅ Sign waiver (required for participation)
✅ Choose lunch option

Please complete this ASAP! See you on *January 24, 2026*! 🎉`;

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
    const isPlayerAuthenticated = currentAuthUser && 
                                  currentAuthUser.email && 
                                  playerData.email && 
                                  currentAuthUser.email.toLowerCase() === playerData.email.toLowerCase();
    
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
                    
                    <div class="space-y-3">
                        <div class="bg-green-50 p-4 rounded-lg">
                            <p class="text-sm text-gray-700">
                                <strong>Lunch Choice:</strong> ${getLunchChoiceDisplay(playerData.lunchChoice)}
                            </p>
                        </div>
                        
                        ${teamData.leagueId === 'masters-volleyball' && playerData.ageVerified ? `
                            <div class="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                                <p class="text-sm text-gray-700">
                                    <strong class="text-yellow-800">✓ Age Verified:</strong> 45+ League
                                </p>
                            </div>
                        ` : ''}
                        
                        ${playerData.waiverFullName ? `
                            <div class="bg-gray-50 p-4 rounded-lg">
                                <p class="text-sm text-gray-700 mb-2">
                                    <strong>Signed by:</strong> ${playerData.waiverFullName}
                                </p>
                                ${playerData.waiverSignature ? `
                                    <img src="${playerData.waiverSignature}" alt="Signature" class="mx-auto border border-gray-300 rounded" style="max-width: 300px; height: auto;">
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                    
                    <p class="text-sm text-gray-500 mt-4">See you at the tournament on January 24, 2026!</p>
                    
                    <button onclick="window.location.href='${window.location.origin}${window.location.pathname}'" class="mt-6 bg-blue-100 text-gray-800 px-6 py-3 rounded-lg hover:bg-blue-200 font-semibold">
                        Return to Main Page
                    </button>
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
                                <p class="font-semibold text-center mb-3">REPUBLIC DAY TOURNAMENT WAIVER AND RELEASE OF LIABILITY</p>
                                <p class="font-semibold mb-2">READ BEFORE SIGNING</p>
                                <p class="mb-3">In consideration of being allowed to participate in any way in the <strong>Republic Day Volleyball and Throwball Tournament</strong>, related events and activities, the undersigned acknowledges, appreciates, and agrees that:</p>
                                <ol class="list-decimal ml-5 space-y-2">
                                    <li>The risks of injury and illness (ex: communicable diseases such as MRSA, influenza, and COVID-19) from the activities involved in this program are significant, including the potential for permanent paralysis and death, and while particular rules, equipment, and personal discipline may reduce these risks, the risks of serious injury and illness do exist; and,</li>
                                    <li>I understand that it is my personal responsibility to inspect the playing area and determine whether or not it is safe. By participating in the tournament, I acknowledge that I have inspected the area and I take full responsibility for my decision to participate in the tournament.</li>
                                    <li>I KNOWINGLY AND FREELY ASSUME ALL SUCH RISKS, both known and unknown, EVEN IF ARISING FROM THE NEGLIGENCE OF THE RELEASEES or others, and assume full responsibility for my participation; and,</li>
                                    <li>I willingly agree to comply with the stated and customary terms and conditions for participation. If, however, I observe any unusual significant hazard during my presence or participation, I will remove myself from participation and bring such to the attention of the nearest official immediately; and,</li>
                                    <li>I, for myself and on behalf of my heirs, assigns, personal representatives and next of kin, HEREBY RELEASE AND HOLD HARMLESS <strong>Republic Day Volleyball and Throwball Tournament, Katy Whackers Club, Empower Her foundation & Faith West Incorporated</strong> their officers, officials, agents, and/or employees, other participants, sponsoring agencies, sponsors, advertisers, and if applicable, owners and lessors of premises used to conduct the event ("RELEASEES"), WITH RESPECT TO ANY AND ALL INJURY, ILLNESS, DISABILITY, DEATH, or loss or damage to person or property, WHETHER ARISING FROM THE NEGLIGENCE OF THE RELEASEES OR OTHERWISE, to the fullest extent permitted by law.</li>
                                </ol>
                                <p class="mt-4 font-semibold">I HAVE READ THIS RELEASE OF LIABILITY AND ASSUMPTION OF RISK AGREEMENT, FULLY UNDERSTAND ITS TERMS, UNDERSTAND THAT I HAVE GIVEN UP SUBSTANTIAL RIGHTS BY SIGNING IT, AND SIGN IT FREELY AND VOLUNTARILY WITHOUT ANY INDUCEMENT.</p>
                            </div>
                            
                            <div class="mt-6 space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Full Legal Name *</label>
                                    <input type="text" id="full-name" class="w-full px-3 py-2 border-2 border-gray-300 rounded-lg" placeholder="Enter your full legal name" required>
                                    <p class="text-xs text-gray-500 mt-1">This must match your legal identification</p>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Signature *</label>
                                    <div class="border-2 border-gray-300 rounded-lg bg-white" style="cursor: crosshair;">
                                        <canvas id="signature-canvas" width="600" height="150" style="display: block; width: 100%; height: 150px; touch-action: none;"></canvas>
                                    </div>
                                    <div class="flex justify-between items-center mt-2">
                                        <p class="text-xs text-gray-500">Sign with your finger or mouse</p>
                                        <button type="button" id="clear-signature" class="text-xs text-red-600 hover:text-red-700 underline">
                                            Clear Signature
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <label class="flex items-start gap-3 cursor-pointer mt-6">
                                <input type="checkbox" id="waiver-checkbox" class="mt-1 w-5 h-5 text-orange-500" required>
                                <span class="text-sm text-gray-700">
                                    I certify that the name and signature above are mine. I have read and agree to all waiver terms. I understand this is a legally binding electronic signature.
                                </span>
                            </label>
                            
                            ${teamData.leagueId === 'masters-volleyball' ? `
                                <label class="flex items-start gap-3 cursor-pointer mt-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                                    <input type="checkbox" id="age-verification-checkbox" class="mt-1 w-5 h-5 text-yellow-500" required>
                                    <span class="text-sm text-gray-700">
                                        <strong class="text-yellow-800">45+ League Age Verification:</strong><br>
                                        I certify that I am 45 years of age or older. I understand that participation in the 45+ league is restricted to players who meet this age requirement.
                                    </span>
                                </label>
                            ` : ''}
                        </div>

                        <div class="bg-gray-50 p-4 sm:p-6 rounded-lg">
                            <h3 class="font-bold text-gray-800 mb-4">Lunch Preference</h3>
                            <p class="text-sm text-gray-600 mb-4">We will be providing lunch during the tournament. Please select your preference:</p>
                            
                            <div class="space-y-3">
                                <label class="flex items-start gap-3 cursor-pointer p-3 border-2 border-gray-300 rounded-lg hover:bg-white ${playerData.lunchChoice === 'veg' ? 'border-orange-500 bg-orange-50' : ''}">
                                    <input type="radio" name="lunch" value="veg" class="w-4 h-4 text-orange-500 mt-1" required ${playerData.lunchChoice === 'veg' ? 'checked' : ''}>
                                    <div>
                                        <div class="text-gray-800 font-semibold">🥗 Vegetarian Menu</div>
                                        <div class="text-xs text-gray-600 mt-1">
                                            • Veg Appetizer<br>
                                            • Veg Biryani<br>
                                            • Gulab Jamun
                                        </div>
                                    </div>
                                </label>

                                <label class="flex items-start gap-3 cursor-pointer p-3 border-2 border-gray-300 rounded-lg hover:bg-white ${playerData.lunchChoice === 'nonveg' ? 'border-orange-500 bg-orange-50' : ''}">
                                    <input type="radio" name="lunch" value="nonveg" class="w-4 h-4 text-orange-500 mt-1" required ${playerData.lunchChoice === 'nonveg' ? 'checked' : ''}>
                                    <div>
                                        <div class="text-gray-800 font-semibold">🍗 Non-Vegetarian Menu</div>
                                        <div class="text-xs text-gray-600 mt-1">
                                            • Non-Veg Appetizer<br>
                                            • Chicken Biryani<br>
                                            • Gulab Jamun
                                        </div>
                                    </div>
                                </label>
                                
                                <label class="flex items-start gap-3 cursor-pointer p-3 border-2 border-gray-300 rounded-lg hover:bg-white ${playerData.lunchChoice === 'none' ? 'border-orange-500 bg-orange-50' : ''}">
                                    <input type="radio" name="lunch" value="none" class="w-4 h-4 text-orange-500 mt-1" required ${playerData.lunchChoice === 'none' ? 'checked' : ''}>
                                    <div>
                                        <div class="text-gray-800 font-semibold">🚫 No Food</div>
                                        <div class="text-xs text-gray-600 mt-1">
                                            I will arrange my own lunch
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <button type="submit" class="w-full bg-blue-100 text-gray-800 py-3 rounded-lg font-semibold hover:bg-blue-200 transition">
                            Submit Registration
                        </button>
                    </form>
                </div>
            `}
        </div>
    `;
    
    if (!alreadySubmitted) {
        // Setup signature canvas
        const canvas = document.getElementById('signature-canvas');
        if (!canvas) {
            console.error('Canvas not found!');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        let isDrawing = false;
        let hasSignature = false;
        
        // Canvas is already sized in HTML (width="600" height="150")
        // Just configure the drawing context
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Get mouse/touch position relative to canvas
        function getPosition(e) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            let clientX, clientY;
            
            if (e.type.includes('touch')) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            
            return {
                x: (clientX - rect.left) * scaleX,
                y: (clientY - rect.top) * scaleY
            };
        }
        
        // Start drawing
        function handleStart(e) {
            e.preventDefault();
            isDrawing = true;
            hasSignature = true;
            const pos = getPosition(e);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        }
        
        // Continue drawing
        function handleMove(e) {
            if (!isDrawing) return;
            e.preventDefault();
            const pos = getPosition(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        }
        
        // Stop drawing
        function handleEnd(e) {
            if (!isDrawing) return;
            e.preventDefault();
            isDrawing = false;
            ctx.closePath();
        }
        
        // Mouse events
        canvas.addEventListener('mousedown', handleStart, false);
        canvas.addEventListener('mousemove', handleMove, false);
        canvas.addEventListener('mouseup', handleEnd, false);
        canvas.addEventListener('mouseleave', handleEnd, false);
        
        // Touch events
        canvas.addEventListener('touchstart', handleStart, false);
        canvas.addEventListener('touchmove', handleMove, false);
        canvas.addEventListener('touchend', handleEnd, false);
        canvas.addEventListener('touchcancel', handleEnd, false);
        
        // Clear signature button
        document.getElementById('clear-signature').addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            hasSignature = false;
            showToast('Signature cleared', 'info');
        });
        
        document.getElementById('player-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fullName = document.getElementById('full-name').value.trim();
            const waiverSigned = document.getElementById('waiver-checkbox').checked;
            const lunchChoice = document.querySelector('input[name="lunch"]:checked').value;
            
            // Check if age verification is required (45+ league)
            const ageVerificationCheckbox = document.getElementById('age-verification-checkbox');
            const ageVerified = ageVerificationCheckbox ? ageVerificationCheckbox.checked : true;
            
            // Validation
            if (!fullName) {
                showToast('Please enter your full legal name', 'error');
                return;
            }
            
            if (!hasSignature) {
                showToast('Please sign the waiver form', 'error');
                return;
            }
            
            if (!waiverSigned) {
                showToast('Please check the waiver agreement box to continue', 'error');
                return;
            }
            
            if (ageVerificationCheckbox && !ageVerified) {
                showToast('Please confirm you are 45 years or older to participate in the 45+ league', 'error');
                return;
            }
            
            try {
                // Convert signature to base64
                const signatureData = canvas.toDataURL('image/png');
                
                // Prepare data to save
                const playerUpdateData = {
                    waiverSigned: true,
                    waiverSignedBy: currentAuthUser.email,
                    waiverSignedAt: new Date().toISOString(),
                    waiverFullName: fullName,
                    waiverSignature: signatureData,
                    lunchChoice: lunchChoice,
                    submittedAt: new Date().toISOString()
                };
                
                // Add age verification if applicable
                if (ageVerificationCheckbox) {
                    playerUpdateData.ageVerified = true;
                    playerUpdateData.ageVerifiedAt = new Date().toISOString();
                }
                
                // Record authenticated waiver signature
                await update(ref(database, `teams/${playerTeamId}/players/${playerId}`), playerUpdateData);
                
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
    const hasEmail = playerData.email && playerData.email.trim() !== '';
    
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
                    <p class="text-sm text-gray-700"><strong>Team:</strong> ${teamData.name}</p>
                    ${hasEmail ? `<p class="text-sm text-gray-700"><strong>Email:</strong> ${playerData.email}</p>` : ''}
                </div>

                <div class="mb-6">
                    <!-- Google Sign-In Option (Always Available) -->
                    <button id="google-auth-btn" class="w-full bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-2 mb-4">
                        <svg class="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Sign in with Google
                    </button>

                    <div class="text-center text-gray-500 text-sm mb-4">or</div>

                    <!-- Email/Password Form -->
                    <form id="player-email-auth-form" class="space-y-4">
                        ${!hasEmail ? `
                            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                                <p class="text-xs text-yellow-800">
                                    <strong>Note:</strong> Your captain didn't provide your email. Please enter it below.
                                </p>
                            </div>
                        ` : ''}
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Your Email Address</label>
                            <input 
                                type="email" 
                                id="player-auth-email" 
                                value="${hasEmail ? playerData.email : ''}" 
                                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none ${hasEmail ? 'bg-gray-100' : ''}" 
                                ${hasEmail ? 'readonly' : 'required'}
                                placeholder="${hasEmail ? '' : 'your@email.com'}"
                            >
                            ${hasEmail ? '<p class="text-xs text-gray-500 mt-1">This is your registered email</p>' : '<p class="text-xs text-gray-500 mt-1">Enter your email address to continue</p>'}
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                            <input 
                                type="password" 
                                id="player-auth-password" 
                                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none" 
                                required 
                                placeholder="Min 6 characters"
                                minlength="6"
                            >
                            <p class="text-xs text-gray-500 mt-1">
                                ${hasEmail ? 'Enter your password, or create one if this is your first time' : 'Create a password (min 6 characters)'}
                            </p>
                        </div>

                        <button type="submit" class="w-full bg-blue-100 text-gray-800 py-3 rounded-lg font-semibold hover:bg-blue-200 transition">
                            ${hasEmail ? 'Login / Sign Up' : 'Continue with Email'}
                        </button>
                    </form>
                </div>

                <div class="text-xs text-gray-500 text-center space-y-1">
                    <p>🔒 Your email is used to verify your identity for legal waiver purposes.</p>
                    <p>First time? We'll create your account automatically!</p>
                </div>
            </div>
        </div>
    `;

    // Google Auth Handler
    document.getElementById('google-auth-btn').addEventListener('click', async function() {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            
            if (!result.user.email) {
                await signOut(auth);
                showToast('Could not get email from Google account', 'error');
                return;
            }
            
            // Update player email if not set
            if (!hasEmail) {
                await update(ref(database, `teams/${playerTeamId}/players/${playerId}`), {
                    email: result.user.email
                });
            } else {
                // Verify email matches if email was already set
                if (result.user.email.toLowerCase() !== playerData.email.toLowerCase()) {
                    await signOut(auth);
                    showToast(`Please use Google account with email: ${playerData.email}`, 'error');
                    return;
                }
            }
            
            // Create player user record
            await set(ref(database, `users/${result.user.uid}`), {
                email: result.user.email,
                role: 'player',
                name: playerData.name
            });
            
            showToast('Signed in successfully!', 'success');
            
            // Reload player view to show waiver form
            setTimeout(() => {
                showPlayerView(playerId);
            }, 500);
        } catch (error) {
            console.error('Google auth error:', error);
            showToast('Google sign-in error: ' + error.message, 'error');
        }
    });

    // Email/Password Auth Handler
    document.getElementById('player-email-auth-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('player-auth-email').value.trim().toLowerCase();
        const password = document.getElementById('player-auth-password').value;
        
        if (!email) {
            showToast('Please enter your email address', 'error');
            return;
        }
        
        if (password.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }
        
        try {
            // Try to sign in first
            await signInWithEmailAndPassword(auth, email, password);
            
            // Update player email if not set
            if (!hasEmail) {
                await update(ref(database, `teams/${playerTeamId}/players/${playerId}`), {
                    email: email
                });
            }
            
            showToast('Login successful!', 'success');
            
            // Reload player view to show waiver form
            setTimeout(() => {
                showPlayerView(playerId);
            }, 500);
        } catch (error) {
            // If user not found or invalid credentials, try to create account
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                try {
                    showToast('Creating your account...', 'info');
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    
                    // Update player email in database
                    await update(ref(database, `teams/${playerTeamId}/players/${playerId}`), {
                        email: email
                    });
                    
                    // Create player user record
                    await set(ref(database, `users/${userCredential.user.uid}`), {
                        email: email,
                        role: 'player',
                        name: playerData.name
                    });
                    
                    showToast('Account created successfully!', 'success');
                    
                    // Reload player view to show waiver form
                    setTimeout(() => {
                        showPlayerView(playerId);
                    }, 500);
                } catch (signupError) {
                    console.error('Signup error:', signupError);
                    if (signupError.code === 'auth/email-already-in-use') {
                        showToast('Email already in use. Please try logging in with your password.', 'error');
                    } else if (signupError.code === 'auth/weak-password') {
                        showToast('Password is too weak. Use at least 6 characters.', 'error');
                    } else {
                        showToast('Error: ' + signupError.message, 'error');
                    }
                }
            } else if (error.code === 'auth/wrong-password') {
                showToast('Incorrect password. Please try again.', 'error');
            } else if (error.code === 'auth/invalid-email') {
                showToast('Invalid email format', 'error');
            } else {
                showToast('Authentication error: ' + error.message, 'error');
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
                            <button type="button" id="add-captain-btn" class="bg-teal-100 text-gray-800 px-4 py-2 rounded-lg hover:bg-teal-200 text-sm">
                                + Add Captain
                            </button>
                        </div>
                        <div id="captains-container" class="space-y-4"></div>
                    </div>

                    <button type="submit" id="submit-setup-btn" class="w-full bg-blue-100 text-gray-800 py-3 rounded-lg font-semibold hover:bg-blue-200">
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

async function showOrganizerDashboard() {
    const teamsSnapshot = await get(ref(database, 'teams'));
    
    if (!teamsSnapshot.exists()) {
        showSetupPage();
        return;
    }
    
    const teams = teamsSnapshot.val();
    const stats = calculateStats(teams);
    const leagueStats = calculateLeagueStats(teams);
    const leaderboard = calculateTeamLeaderboard(teams);
    
    // Calculate days until tournament
    const tournamentDate = new Date('2026-01-24');
    const today = new Date();
    const daysUntil = Math.ceil((tournamentDate - today) / (1000 * 60 * 60 * 24));
    const hoursUntil = Math.ceil((tournamentDate - today) / (1000 * 60 * 60));
    
    // Calculate overall readiness percentage
    const waiverProgress = stats.totalPlayers > 0 ? (stats.completedWaivers / stats.totalPlayers) * 100 : 0;
    const lunchProgress = stats.totalPlayers > 0 ? (stats.completedLunch / stats.totalPlayers) * 100 : 0;
    const overallReadiness = Math.round((waiverProgress + lunchProgress) / 2);
    
    // Identify urgent items
    const pendingWaivers = stats.totalPlayers - stats.completedWaivers;
    const pendingLunch = stats.totalPlayers - stats.completedLunch;
    
    document.getElementById('organizer-view').innerHTML = `
        <div class="space-y-4 sm:space-y-6 fade-in">
            <!-- Header -->
            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                        <h2 class="text-xl sm:text-2xl font-bold text-gray-800 mb-2">🏐 Organizer Dashboard</h2>
                        <p class="text-sm sm:text-base text-gray-600">Republic Day Tournament 2026</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button id="manage-organizers-btn" class="bg-red-100 text-gray-800 px-3 py-2 rounded-lg hover:bg-red-200 text-xs sm:text-sm whitespace-nowrap">
                            👥 Manage Organizers
                        </button>
                        <button id="add-more-teams-btn" class="bg-teal-100 text-gray-800 px-3 py-2 rounded-lg hover:bg-teal-200 text-xs sm:text-sm whitespace-nowrap">
                            + Add More Teams
                        </button>
                    </div>
                </div>
            </div>

            <!-- Tournament Readiness Card -->
            <div class="bg-gradient-to-br from-blue-100 to-blue-200 text-gray-800 rounded-lg shadow-xl p-6">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h3 class="text-2xl font-bold">Tournament Readiness</h3>
                        <p class="text-sm opacity-90">Overall completion status</p>
                    </div>
                    <div class="text-right">
                        <div class="text-5xl font-bold">${overallReadiness}%</div>
                        <div class="text-sm opacity-90">Complete</div>
                    </div>
                </div>
                
                <div class="w-full bg-white/20 rounded-full h-4 mb-4">
                    <div class="bg-white h-4 rounded-full transition-all duration-500" style="width: ${overallReadiness}%"></div>
                </div>
                
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="bg-white/10 rounded-lg p-3">
                        <div class="text-3xl font-bold">${stats.totalTeams}</div>
                        <div class="text-sm opacity-90">Teams Registered</div>
                    </div>
                    <div class="bg-white/10 rounded-lg p-3">
                        <div class="text-3xl font-bold">${stats.totalPlayers}</div>
                        <div class="text-sm opacity-90">Total Players</div>
                    </div>
                    <div class="bg-white/10 rounded-lg p-3">
                        <div class="text-3xl font-bold">${stats.completedWaivers}</div>
                        <div class="text-sm opacity-90">Waivers Signed (${Math.round(waiverProgress)}%)</div>
                    </div>
                    <div class="bg-white/10 rounded-lg p-3">
                        <div class="text-3xl font-bold">${stats.completedLunch}</div>
                        <div class="text-sm opacity-90">Lunch Selected (${Math.round(lunchProgress)}%)</div>
                    </div>
                </div>
                
                <div class="border-t border-white/20 pt-4 mt-4">
                    <div class="flex justify-between items-center">
                        <div>
                            <div class="text-2xl font-bold">⏰ ${daysUntil} Days</div>
                            <div class="text-sm opacity-90">${hoursUntil} hours until tournament</div>
                        </div>
                        <div class="text-right">
                            <div class="text-lg font-bold">January 24, 2026</div>
                            <div class="text-sm opacity-90">Tournament Day</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Urgent Alerts -->
            ${pendingWaivers > 0 || pendingLunch > 0 ? `
            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">🔔 Action Required</h3>
                <div class="space-y-3">
                    ${pendingWaivers > 0 ? `
                    <div class="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div class="text-2xl">🔴</div>
                        <div class="flex-1">
                            <div class="font-semibold text-red-800">URGENT: ${pendingWaivers} players haven't signed waivers</div>
                            <div class="text-sm text-red-600">Legal requirement - need immediate follow-up</div>
                        </div>
                        <button id="message-pending-waivers-btn" class="bg-red-600 text-gray-800 px-4 py-2 rounded-lg hover:bg-red-700 text-sm whitespace-nowrap">
                            Send Reminder
                        </button>
                    </div>
                    ` : ''}
                    ${pendingLunch > 0 ? `
                    <div class="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div class="text-2xl">🟡</div>
                        <div class="flex-1">
                            <div class="font-semibold text-yellow-800">WARNING: ${pendingLunch} players haven't selected lunch</div>
                            <div class="text-sm text-yellow-600">Needed for catering order - ${daysUntil} days remaining</div>
                        </div>
                        <button id="message-pending-lunch-btn" class="bg-yellow-100 text-gray-800 px-4 py-2 rounded-lg hover:bg-yellow-200 text-sm whitespace-nowrap">
                            Send Reminder
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
            ` : `
            <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                <div class="flex items-center gap-3">
                    <div class="text-3xl">✅</div>
                    <div>
                        <div class="font-bold text-green-800 text-lg">All Set!</div>
                        <div class="text-green-600">All players have completed registration</div>
                    </div>
                </div>
            </div>
            `}

            <!-- Quick Actions Toolbar -->
            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">⚡ Quick Actions</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <button id="export-all-btn" class="flex flex-col items-center gap-2 p-4 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition">
                        <div class="text-2xl">📊</div>
                        <div class="text-sm font-semibold text-blue-800 text-center">Export All Data</div>
                    </button>
                    <button id="message-captains-btn" class="flex flex-col items-center gap-2 p-4 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition">
                        <div class="text-2xl">📱</div>
                        <div class="text-sm font-semibold text-purple-800 text-center">Message Captains</div>
                    </button>
                    <button id="message-players-btn" class="flex flex-col items-center gap-2 p-4 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition">
                        <div class="text-2xl">💬</div>
                        <div class="text-sm font-semibold text-green-800 text-center">Message Players</div>
                    </button>
                    <button id="export-food-btn" class="flex flex-col items-center gap-2 p-4 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition">
                        <div class="text-2xl">🍽️</div>
                        <div class="text-sm font-semibold text-orange-800 text-center">Food Orders</div>
                    </button>
                </div>
            </div>

            <!-- Team Leaderboard -->
            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">🏆 Team Completion Leaderboard</h3>
                <div class="space-y-2">
                    ${leaderboard.slice(0, 10).map((team, index) => {
                        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}️⃣`;
                        const bgColor = team.completionRate === 100 ? 'bg-green-50 border-green-200' : 
                                       team.completionRate >= 75 ? 'bg-blue-50 border-blue-200' :
                                       team.completionRate >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
                        return `
                        <div class="flex items-center gap-3 p-3 ${bgColor} border rounded-lg">
                            <div class="text-2xl w-10 text-center">${medal}</div>
                            <div class="flex-1">
                                <div class="font-semibold text-gray-800">${team.name}</div>
                                <div class="text-xs text-gray-600">${getLeagueName(team.leagueId)} • ${team.playerCount} players</div>
                            </div>
                            <div class="text-right">
                                <div class="text-2xl font-bold ${team.completionRate === 100 ? 'text-green-600' : 'text-gray-800'}">${team.completionRate}%</div>
                                <div class="text-xs text-gray-600">${team.waiverCount}/${team.playerCount} waivers</div>
                            </div>
                            ${team.completionRate === 100 ? '<div class="text-2xl">✅</div>' : ''}
                        </div>
                        `;
                    }).join('')}
                </div>
                ${leaderboard.length > 10 ? `
                <button id="show-all-teams-btn" class="w-full mt-3 py-2 text-sm text-blue-600 hover:text-blue-700 font-semibold">
                    Show All ${leaderboard.length} Teams →
                </button>
                ` : ''}
            </div>

            <!-- League Analytics -->
            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">📊 League Breakdown</h3>
                <div class="space-y-4">
                    ${Object.entries(leagueStats).map(([leagueId, league]) => {
                        const progress = league.totalPlayers > 0 ? (league.completedWaivers / league.totalPlayers) * 100 : 0;
                        const progressColor = progress >= 90 ? 'bg-teal-100' : progress >= 70 ? 'bg-cyan-100' : progress >= 50 ? 'bg-yellow-500' : 'bg-red-100';
                        return `
                        <div class="border border-gray-200 rounded-lg p-4">
                            <div class="flex justify-between items-start mb-3">
                                <div>
                                    <h4 class="font-bold text-gray-800">${getLeagueName(leagueId)}</h4>
                                    <div class="text-sm text-gray-600">
                                        ${league.teamCount} teams • ${league.totalPlayers} players
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="text-2xl font-bold ${progress >= 90 ? 'text-green-600' : 'text-gray-800'}">${Math.round(progress)}%</div>
                                    <div class="text-xs text-gray-600">Ready</div>
                                </div>
                            </div>
                            
                            <div class="w-full bg-gray-200 rounded-full h-3 mb-3">
                                <div class="${progressColor} h-3 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                            </div>
                            
                            <div class="grid grid-cols-3 gap-2 text-xs">
                                <div class="text-center p-2 bg-gray-50 rounded">
                                    <div class="font-semibold">${league.completedWaivers}/${league.totalPlayers}</div>
                                    <div class="text-gray-600">Waivers</div>
                                </div>
                                <div class="text-center p-2 bg-gray-50 rounded">
                                    <div class="font-semibold">${league.completedLunch}/${league.totalPlayers}</div>
                                    <div class="text-gray-600">Lunch</div>
                                </div>
                                <div class="text-center p-2 bg-gray-50 rounded">
                                    <div class="font-semibold">${league.teamCount}</div>
                                    <div class="text-gray-600">Teams</div>
                                </div>
                            </div>
                            
                            ${leagueId === 'masters-volleyball' && league.ageVerified !== undefined ? `
                            <div class="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                                ✅ ${league.ageVerified} players age verified (45+ league)
                            </div>
                            ` : ''}
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Food Summary -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">🍽️ Lunch Summary</h3>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                            <span class="text-gray-700 font-semibold">🥗 Vegetarian</span>
                            <span class="font-bold text-green-600 text-2xl">${stats.vegCount}</span>
                        </div>
                        <div class="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-200">
                            <span class="text-gray-700 font-semibold">🍗 Non-Vegetarian</span>
                            <span class="font-bold text-red-600 text-2xl">${stats.nonVegCount}</span>
                        </div>
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <span class="text-gray-700 font-semibold">🚫 No Food</span>
                            <span class="font-bold text-gray-600 text-2xl">${stats.noFoodCount}</span>
                        </div>
                        <div class="flex justify-between items-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                            <span class="text-gray-700 font-semibold">⏳ Pending</span>
                            <span class="font-bold text-yellow-600 text-2xl">${pendingLunch}</span>
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">📈 Progress Details</h3>
                    <div class="space-y-4">
                        <div>
                            <div class="flex justify-between text-sm mb-2">
                                <span class="font-semibold">Waiver Completion</span>
                                <span class="font-bold">${Math.round(waiverProgress)}%</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-3">
                                <div class="bg-blue-100 h-3 rounded-full transition-all" style="width: ${waiverProgress}%"></div>
                            </div>
                            <div class="text-xs text-gray-600 mt-1">${stats.completedWaivers} of ${stats.totalPlayers} completed</div>
                        </div>
                        <div>
                            <div class="flex justify-between text-sm mb-2">
                                <span class="font-semibold">Lunch Selection</span>
                                <span class="font-bold">${Math.round(lunchProgress)}%</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-3">
                                <div class="bg-indigo-100 h-3 rounded-full transition-all" style="width: ${lunchProgress}%"></div>
                            </div>
                            <div class="text-xs text-gray-600 mt-1">${stats.completedLunch} of ${stats.totalPlayers} completed</div>
                        </div>
                        <div>
                            <div class="flex justify-between text-sm mb-2">
                                <span class="font-semibold">Overall Readiness</span>
                                <span class="font-bold">${overallReadiness}%</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-3">
                                <div class="bg-teal-100 h-3 rounded-full transition-all" style="width: ${overallReadiness}%"></div>
                            </div>
                            <div class="text-xs text-gray-600 mt-1">Combined completion metric</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- All Teams List -->
            <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <h3 class="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6">📋 All Teams (${stats.totalTeams})</h3>
                ${Object.entries(groupByLeague(teams)).map(([leagueId, leagueTeams]) => `
                    <div class="mb-6 last:mb-0">
                        <h4 class="text-base sm:text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <span class="text-xl sm:text-2xl">🏐</span>
                            ${getLeagueName(leagueId)} (${leagueTeams.length} teams)
                        </h4>
                        <div class="space-y-3">
                            ${leagueTeams.map(team => {
                                const playerCount = team.players ? Object.keys(team.players).length : 0;
                                const waiverCount = team.players ? Object.values(team.players).filter(p => p.waiverSigned).length : 0;
                                const lunchCount = team.players ? Object.values(team.players).filter(p => p.lunchChoice).length : 0;
                                const completion = playerCount > 0 ? Math.round((waiverCount / playerCount) * 100) : 0;
                                
                                return `
                                    <div class="border border-gray-200 rounded-lg p-3 sm:p-4 hover:border-blue-300 transition">
                                        <div class="flex justify-between items-start mb-2">
                                            <div class="flex-1">
                                                <h5 class="font-bold text-gray-800">${team.name}</h5>
                                                <p class="text-xs sm:text-sm text-gray-600">
                                                    Captain: ${team.captain.name} (${team.captain.email})
                                                </p>
                                                <p class="text-xs text-gray-500">Phone: ${team.captain.phone}</p>
                                            </div>
                                            <div class="text-right ml-2">
                                                <div class="text-base sm:text-lg font-bold ${completion === 100 ? 'text-green-600' : 'text-gray-800'}">${completion}%</div>
                                                <div class="text-xs text-gray-500">${playerCount} players</div>
                                            </div>
                                        </div>
                                        
                                        ${playerCount > 0 ? `
                                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs mb-3">
                                                <div class="bg-gray-50 p-2 rounded text-center">
                                                    <div class="font-semibold">${waiverCount}/${playerCount}</div>
                                                    <div class="text-gray-600">Waivers</div>
                                                </div>
                                                <div class="bg-gray-50 p-2 rounded text-center">
                                                    <div class="font-semibold">${lunchCount}/${playerCount}</div>
                                                    <div class="text-gray-600">Lunch</div>
                                                </div>
                                                <div class="bg-gray-50 p-2 rounded text-center col-span-2 sm:col-span-1">
                                                    <div class="font-semibold ${completion === 100 ? 'text-green-600' : ''}">${completion}%</div>
                                                    <div class="text-gray-600">Complete</div>
                                                </div>
                                            </div>
                                        ` : `
                                            <p class="text-xs sm:text-sm text-gray-500 mt-2 mb-3">No players added yet</p>
                                        `}
                                        
                                        <div class="flex flex-wrap gap-2">
                                            <button class="view-players-btn bg-cyan-100 text-gray-800 px-3 py-1 rounded text-xs hover:bg-cyan-200" data-team-id="${team.id}">
                                                👥 View Players
                                            </button>
                                            <button class="edit-team-btn bg-teal-100 text-gray-800 px-3 py-1 rounded text-xs hover:bg-teal-200" data-team-id="${team.id}">
                                                ✏️ Edit
                                            </button>
                                            <button class="delete-team-btn bg-red-100 text-gray-800 px-3 py-1 rounded text-xs hover:bg-red-200" data-team-id="${team.id}">
                                                🗑️ Delete
                                            </button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Attach event listeners
    attachOrganizerDashboardListeners(teams, stats);
}

function attachOrganizerDashboardListeners(teams, stats) {
    // Manage Organizers button
    const manageOrganizersBtn = document.getElementById('manage-organizers-btn');
    if (manageOrganizersBtn) {
        manageOrganizersBtn.addEventListener('click', async () => {
            try {
                await showManageOrganizersModal();
            } catch (error) {
                console.error('Error showing manage organizers modal:', error);
                showToast('Error opening organizers management: ' + error.message, 'error');
            }
        });
    }
    
    // Add More Teams button
    const addMoreTeamsBtn = document.getElementById('add-more-teams-btn');
    if (addMoreTeamsBtn) {
        addMoreTeamsBtn.addEventListener('click', () => {
            showSetupPage();
        });
    }
    
    // Message buttons
    const messageCaptainsBtn = document.getElementById('message-captains-btn');
    if (messageCaptainsBtn) {
        messageCaptainsBtn.addEventListener('click', () => {
            messageAllCaptains(teams);
        });
    }
    
    const messagePlayersBtn = document.getElementById('message-players-btn');
    if (messagePlayersBtn) {
        messagePlayersBtn.addEventListener('click', () => {
            messageAllPlayers(teams);
        });
    }
    
    const messagePendingWaiversBtn = document.getElementById('message-pending-waivers-btn');
    if (messagePendingWaiversBtn) {
        messagePendingWaiversBtn.addEventListener('click', () => {
            messagePlayersWithFilter(teams, 'pendingWaiver');
        });
    }
    
    const messagePendingLunchBtn = document.getElementById('message-pending-lunch-btn');
    if (messagePendingLunchBtn) {
        messagePendingLunchBtn.addEventListener('click', () => {
            messagePlayersWithFilter(teams, 'pendingLunch');
        });
    }
    
    // Export buttons
    const exportAllBtn = document.getElementById('export-all-btn');
    if (exportAllBtn) {
        exportAllBtn.addEventListener('click', () => {
            exportAllData(teams, stats);
        });
    }
    
    const exportFoodBtn = document.getElementById('export-food-btn');
    if (exportFoodBtn) {
        exportFoodBtn.addEventListener('click', () => {
            exportFoodOrders(teams, stats);
        });
    }
    
    // Show all teams button
    const showAllTeamsBtn = document.getElementById('show-all-teams-btn');
    if (showAllTeamsBtn) {
        showAllTeamsBtn.addEventListener('click', () => {
            showAllTeamsModal(teams);
        });
    }
    
    // View/Edit/Delete team buttons
    document.querySelectorAll('.view-players-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const teamId = e.target.dataset.teamId;
            showTeamPlayersModal(teamId, teams[teamId]);
        });
    });
    
    document.querySelectorAll('.edit-team-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const teamId = e.target.dataset.teamId;
            showEditTeamModal(teamId, teams[teamId]);
        });
    });
    
    document.querySelectorAll('.delete-team-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const teamId = e.target.dataset.teamId;
            const teamName = teams[teamId].name;
            
            if (confirm(`Are you sure you want to delete team "${teamName}"? This cannot be undone.`)) {
                try {
                    await remove(ref(database, `teams/${teamId}`));
                    
                    // Also remove captain
                    const captainEmail = teams[teamId].captain.email;
                    const captainsSnapshot = await get(ref(database, 'captains'));
                    if (captainsSnapshot.exists()) {
                        const captains = captainsSnapshot.val();
                        const captainEntry = Object.entries(captains).find(([_, c]) => c.email === captainEmail);
                        if (captainEntry) {
                            await remove(ref(database, `captains/${captainEntry[0]}`));
                        }
                    }
                    
                    showToast(`Team "${teamName}" deleted successfully`, 'success');
                    showOrganizerDashboard(); // Reload dashboard
                } catch (error) {
                    console.error('Error deleting team:', error);
                    showToast('Error deleting team: ' + error.message, 'error');
                }
            }
        });
    });
}

// ============================================
// ORGANIZER MANAGEMENT FUNCTIONS
// ============================================

async function showManageOrganizersModal() {
    console.log('🚀 showManageOrganizersModal called');
    
    try {
        // Get current organizers from database
        console.log('📊 Fetching organizers from database...');
        const organizersRef = ref(database, 'organizers');
        const organizersSnapshot = await get(organizersRef);
        const organizers = organizersSnapshot.exists() ? organizersSnapshot.val() : {};
        console.log('📊 Organizers from DB:', organizers);
        
        // Also include the hardcoded ones
        const allOrganizers = new Set([...AUTHORIZED_ORGANIZERS]);
        Object.values(organizers).forEach(org => allOrganizers.add(org.email));
        console.log('📊 All organizers:', Array.from(allOrganizers));
        
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 class="text-xl font-bold text-gray-800 mb-4">Manage Organizers</h3>
            
            <div class="mb-6">
                <p class="text-sm text-gray-600 mb-4">
                    Add or remove organizer email addresses. Organizers have full access to manage teams, players, and settings.
                </p>
                
                <form id="add-organizer-form" class="flex gap-2">
                    <input 
                        type="email" 
                        id="new-organizer-email" 
                        class="flex-1 px-3 py-2 border border-gray-300 rounded-lg" 
                        placeholder="organizer@example.com"
                        required
                    >
                    <button type="submit" class="bg-teal-100 text-gray-800 px-4 py-2 rounded-lg hover:bg-teal-200 whitespace-nowrap">
                        + Add
                    </button>
                </form>
            </div>
            
            <div class="space-y-2 mb-6">
                <h4 class="font-semibold text-gray-700 mb-2">Current Organizers (${allOrganizers.size})</h4>
                ${Array.from(allOrganizers).map((email, index) => {
                    const isHardcoded = AUTHORIZED_ORGANIZERS.includes(email);
                    const organizerId = Object.keys(organizers).find(key => organizers[key].email === email);
                    return `
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <div>
                                <span class="text-gray-800">${email}</span>
                                ${isHardcoded ? '<span class="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Default</span>' : ''}
                            </div>
                            ${!isHardcoded && organizerId ? `
                                <button class="delete-organizer bg-red-100 text-gray-800 px-3 py-1 rounded text-sm hover:bg-red-200" data-organizer-id="${organizerId}">
                                    Delete
                                </button>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="flex gap-3">
                <button class="close-modal flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">
                    Close
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    
    // Add organizer form
    modal.querySelector('#add-organizer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('new-organizer-email').value.trim().toLowerCase();
        
        if (allOrganizers.has(email)) {
            showToast('This email is already an organizer', 'error');
            return;
        }
        
        try {
            const newOrganizerRef = push(ref(database, 'organizers'));
            await set(newOrganizerRef, {
                email: email,
                addedBy: currentUser.email,
                addedAt: new Date().toISOString()
            });
            
            showToast('Organizer added successfully!', 'success');
            modal.remove();
            showManageOrganizersModal(); // Refresh the modal
        } catch (error) {
            showToast('Error adding organizer: ' + error.message, 'error');
        }
    });
    
    // Delete organizer buttons
    modal.querySelectorAll('.delete-organizer').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const organizerId = e.target.dataset.organizerId;
            const email = organizers[organizerId].email;
            
            if (confirm(`Remove ${email} as an organizer?`)) {
                try {
                    await remove(ref(database, `organizers/${organizerId}`));
                    showToast('Organizer removed successfully', 'success');
                    modal.remove();
                    showManageOrganizersModal(); // Refresh the modal
                } catch (error) {
                    showToast('Error removing organizer: ' + error.message, 'error');
                }
            }
        });
    });
    
    } catch (error) {
        console.error('Error in showManageOrganizersModal:', error);
        showToast('Error loading organizers: ' + error.message, 'error');
    }
}

// ============================================
// MESSAGING FUNCTIONS (FOR ORGANIZER)
// ============================================

function messageAllCaptains(teams) {
    const captains = [];
    
    Object.values(teams).forEach(team => {
        const playerCount = team.players ? Object.keys(team.players).length : 0;
        const waiverCount = team.players ? Object.values(team.players).filter(p => p.waiverSigned).length : 0;
        const completionRate = playerCount > 0 ? Math.round((waiverCount / playerCount) * 100) : 0;
        
        captains.push({
            name: team.captain.name,
            phone: team.captain.phone,
            email: team.captain.email,
            team: team.name,
            leagueId: team.leagueId,
            playerCount: playerCount,
            completionRate: completionRate
        });
    });
    
    if (captains.length === 0) {
        showToast('No captains to message', 'error');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 class="text-2xl font-bold text-gray-800 mb-4">📱 Message Captains</h3>
            
            <!-- Selection Controls -->
            <div class="mb-4 flex flex-wrap gap-2">
                <button id="select-all-captains" class="px-4 py-2 bg-cyan-100 text-gray-800 rounded-lg hover:bg-cyan-200 text-sm">
                    ✅ Select All (${captains.length})
                </button>
                <button id="deselect-all-captains" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 text-sm">
                    ❌ Deselect All
                </button>
                <button id="select-incomplete-captains" class="px-4 py-2 bg-blue-100 text-gray-800 rounded-lg hover:bg-blue-200 text-sm">
                    ⚠️ Select Incomplete (<100%)
                </button>
                <div class="flex-1"></div>
                <div class="px-3 py-2 bg-blue-50 rounded-lg text-sm font-semibold text-blue-700">
                    Selected: <span id="selected-count">0</span>
                </div>
            </div>
            
            <!-- Captain List with Checkboxes -->
            <div class="mb-4 border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
                <div class="sticky top-0 bg-gray-50 border-b border-gray-300 p-2 text-xs font-semibold text-gray-700 grid grid-cols-12 gap-2">
                    <div class="col-span-1 text-center">Select</div>
                    <div class="col-span-3">Captain</div>
                    <div class="col-span-3">Team</div>
                    <div class="col-span-2">League</div>
                    <div class="col-span-2">Players</div>
                    <div class="col-span-1 text-center">Status</div>
                </div>
                ${captains.map((captain, index) => {
                    const statusColor = captain.completionRate === 100 ? 'text-green-600' : 
                                       captain.completionRate >= 75 ? 'text-blue-600' :
                                       captain.completionRate >= 50 ? 'text-yellow-600' : 'text-red-600';
                    const statusIcon = captain.completionRate === 100 ? '✅' : 
                                      captain.completionRate >= 75 ? '🔵' :
                                      captain.completionRate >= 50 ? '🟡' : '🔴';
                    return `
                    <div class="p-2 border-b border-gray-200 hover:bg-gray-50 text-xs grid grid-cols-12 gap-2 items-center">
                        <div class="col-span-1 text-center">
                            <input type="checkbox" class="captain-checkbox w-4 h-4 cursor-pointer" 
                                   data-index="${index}" 
                                   data-completion="${captain.completionRate}">
                        </div>
                        <div class="col-span-3">
                            <div class="font-semibold">${captain.name}</div>
                            <div class="text-gray-500 text-xs">${captain.phone}</div>
                        </div>
                        <div class="col-span-3 font-medium">${captain.team}</div>
                        <div class="col-span-2 text-gray-600">${getLeagueName(captain.leagueId).replace(' Volleyball', '').replace(' Throwball', '')}</div>
                        <div class="col-span-2 text-center text-gray-700">${captain.playerCount}</div>
                        <div class="col-span-1 text-center">
                            <span class="${statusColor} font-bold" title="${captain.completionRate}% complete">${statusIcon}</span>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
            
            <!-- Message Template -->
            <div class="mb-4">
                <label class="block text-sm font-semibold text-gray-700 mb-2">Message Template:</label>
                <textarea id="captain-message-template" class="w-full px-3 py-2 border border-gray-300 rounded-lg h-48 text-sm font-mono">Hi {name}! 👋

This is the organizer of Republic Day Tournament 2026 🏐

*IMPORTANT UPDATE for Team {team}:*

🔗 *Tournament App:* https://rd-tournament.vercel.app

Please login using: {email}

*Your Tasks:*
✅ Add all your players to the app
✅ Share registration links with them
✅ Ensure they sign waivers (REQUIRED!)
✅ Track their lunch preferences

*Current Status:*
Team Progress: {completion}% complete
Players Added: {players}

*Tournament Date:* January 24, 2026

Need help? Reply to this message!

Let's make this tournament amazing! 🎉</textarea>
                <p class="text-xs text-gray-500 mt-1">
                    Variables: {name}, {team}, {email}, {completion}, {players}
                </p>
            </div>
            
            <!-- Send Options -->
            <div class="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div class="flex items-start gap-2 mb-3">
                    <div class="text-2xl">⚠️</div>
                    <div class="flex-1">
                        <p class="text-sm font-semibold text-yellow-800 mb-1">Auto-Send Method:</p>
                        <p class="text-xs text-yellow-700">
                            WhatsApp Web API requires each message to be sent from a separate tab. 
                            The app will automatically open WhatsApp for each selected captain with a 2-second delay between each.
                        </p>
                    </div>
                </div>
                
                <div class="flex items-center gap-3 text-sm">
                    <label class="flex items-center gap-2">
                        <input type="radio" name="send-method" value="auto" checked class="w-4 h-4">
                        <span>Auto-Open (2 sec delay)</span>
                    </label>
                    <label class="flex items-center gap-2">
                        <input type="radio" name="send-method" value="manual" class="w-4 h-4">
                        <span>Manual (I'll click Send in each tab)</span>
                    </label>
                </div>
            </div>
            
            <!-- Action Buttons -->
            <div class="flex gap-3">
                <button id="close-captain-modal" class="px-6 bg-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-400">
                    Cancel
                </button>
                <button id="preview-messages-btn" class="flex-1 bg-indigo-100 text-gray-800 py-3 rounded-lg font-semibold hover:bg-indigo-200">
                    👁️ Preview Messages
                </button>
                <button id="send-captain-messages" class="flex-1 bg-green-600 text-gray-800 py-3 rounded-lg font-semibold hover:bg-green-700">
                    📱 Send to Selected (<span id="send-count">0</span>)
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Update selected count
    function updateSelectedCount() {
        const checkboxes = modal.querySelectorAll('.captain-checkbox:checked');
        const count = checkboxes.length;
        modal.querySelector('#selected-count').textContent = count;
        modal.querySelector('#send-count').textContent = count;
    }
    
    // Select All
    modal.querySelector('#select-all-captains').addEventListener('click', () => {
        modal.querySelectorAll('.captain-checkbox').forEach(cb => cb.checked = true);
        updateSelectedCount();
    });
    
    // Deselect All
    modal.querySelector('#deselect-all-captains').addEventListener('click', () => {
        modal.querySelectorAll('.captain-checkbox').forEach(cb => cb.checked = false);
        updateSelectedCount();
    });
    
    // Select Incomplete
    modal.querySelector('#select-incomplete-captains').addEventListener('click', () => {
        modal.querySelectorAll('.captain-checkbox').forEach(cb => {
            cb.checked = parseInt(cb.dataset.completion) < 100;
        });
        updateSelectedCount();
    });
    
    // Checkbox change
    modal.querySelectorAll('.captain-checkbox').forEach(cb => {
        cb.addEventListener('change', updateSelectedCount);
    });
    
    // Close modal
    modal.querySelector('#close-captain-modal').addEventListener('click', () => {
        modal.remove();
    });
    
    // Preview messages
    modal.querySelector('#preview-messages-btn').addEventListener('click', () => {
        const template = modal.querySelector('#captain-message-template').value;
        const selectedCheckboxes = modal.querySelectorAll('.captain-checkbox:checked');
        
        if (selectedCheckboxes.length === 0) {
            showToast('Please select at least one captain', 'error');
            return;
        }
        
        // Show preview modal
        const previewModal = document.createElement('div');
        previewModal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4';
        previewModal.innerHTML = `
            <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
                <h3 class="text-xl font-bold mb-4">📋 Message Preview</h3>
                <div class="space-y-3 mb-4">
                    ${Array.from(selectedCheckboxes).slice(0, 3).map(cb => {
                        const index = parseInt(cb.dataset.index);
                        const captain = captains[index];
                        const message = template
                            .replace(/{name}/g, captain.name)
                            .replace(/{team}/g, captain.team)
                            .replace(/{email}/g, captain.email)
                            .replace(/{completion}/g, captain.completionRate)
                            .replace(/{players}/g, captain.playerCount);
                        return `
                        <div class="border border-gray-300 rounded-lg p-3">
                            <div class="text-xs font-semibold text-gray-600 mb-2">To: ${captain.name} (${captain.team})</div>
                            <div class="text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded">${message}</div>
                        </div>
                        `;
                    }).join('')}
                    ${selectedCheckboxes.length > 3 ? `
                    <div class="text-sm text-gray-600 text-center">
                        ... and ${selectedCheckboxes.length - 3} more messages
                    </div>
                    ` : ''}
                </div>
                <button id="close-preview" class="w-full bg-cyan-100 text-gray-800 py-3 rounded-lg font-semibold hover:bg-cyan-200">
                    Close Preview
                </button>
            </div>
        `;
        
        document.body.appendChild(previewModal);
        
        previewModal.querySelector('#close-preview').addEventListener('click', () => {
            previewModal.remove();
        });
        
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) previewModal.remove();
        });
    });
    
    // Send messages
    modal.querySelector('#send-captain-messages').addEventListener('click', async () => {
        const template = modal.querySelector('#captain-message-template').value;
        const selectedCheckboxes = modal.querySelectorAll('.captain-checkbox:checked');
        const sendMethod = modal.querySelector('input[name="send-method"]:checked').value;
        
        if (selectedCheckboxes.length === 0) {
            showToast('Please select at least one captain', 'error');
            return;
        }
        
        if (!confirm(`Send message to ${selectedCheckboxes.length} captain${selectedCheckboxes.length > 1 ? 's' : ''}?`)) {
            return;
        }
        
        modal.remove();
        
        const delay = sendMethod === 'auto' ? 2000 : 1000; // 2 seconds for auto, 1 for manual
        let successCount = 0;
        
        // Show progress toast
        const progressToast = showProgressToast(`Sending to ${selectedCheckboxes.length} captains...`);
        
        for (let i = 0; i < selectedCheckboxes.length; i++) {
            const cb = selectedCheckboxes[i];
            const index = parseInt(cb.dataset.index);
            const captain = captains[index];
            
            await new Promise(resolve => setTimeout(resolve, i * delay));
            
            const personalizedMessage = template
                .replace(/{name}/g, captain.name)
                .replace(/{team}/g, captain.team)
                .replace(/{email}/g, captain.email)
                .replace(/{completion}/g, captain.completionRate)
                .replace(/{players}/g, captain.playerCount);
            
            const whatsappUrl = `https://wa.me/${captain.phone.replace(/\D/g, '')}?text=${encodeURIComponent(personalizedMessage)}`;
            window.open(whatsappUrl, '_blank');
            successCount++;
            
            // Update progress
            updateProgressToast(progressToast, `Sent ${successCount}/${selectedCheckboxes.length}...`);
        }
        
        // Final success message
        setTimeout(() => {
            progressToast.remove();
            showToast(`✅ Opened WhatsApp for ${successCount} captain${successCount > 1 ? 's' : ''}!`, 'success');
        }, 1000);
    });
    
    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function showProgressToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-blue-600 text-gray-800 px-6 py-4 rounded-lg shadow-xl z-[70] flex items-center gap-3';
    toast.innerHTML = `
        <div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
        <span id="progress-text">${message}</span>
    `;
    document.body.appendChild(toast);
    return toast;
}

function updateProgressToast(toast, message) {
    const textEl = toast.querySelector('#progress-text');
    if (textEl) textEl.textContent = message;
}

function messageAllPlayers(teams) {
    const players = [];
    
    Object.values(teams).forEach(team => {
        if (team.players) {
            Object.values(team.players).forEach(player => {
                players.push({
                    name: player.name,
                    phone: player.phone,
                    email: player.email,
                    team: team.name,
                    waiverSigned: player.waiverSigned,
                    lunchChoice: player.lunchChoice
                });
            });
        }
    });
    
    if (players.length === 0) {
        showToast('No players to message', 'error');
        return;
    }
    
    // Filter options
    const pendingWaiverPlayers = players.filter(p => !p.waiverSigned);
    const pendingLunchPlayers = players.filter(p => !p.lunchChoice);
    const completePlayers = players.filter(p => p.waiverSigned && p.lunchChoice);
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 class="text-xl font-bold text-gray-800 mb-4">Message Players</h3>
            
            <div class="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <p class="text-sm text-gray-700 mb-2">
                    <strong>Select which players to message:</strong>
                </p>
                <div class="space-y-2">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="player-filter" value="all" checked class="w-4 h-4">
                        <span class="text-sm">All Players (${players.length})</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="player-filter" value="pending-waiver" class="w-4 h-4">
                        <span class="text-sm">Only Pending Waiver (${pendingWaiverPlayers.length})</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="player-filter" value="pending-lunch" class="w-4 h-4">
                        <span class="text-sm">Only Pending Lunch (${pendingLunchPlayers.length})</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="player-filter" value="complete" class="w-4 h-4">
                        <span class="text-sm">Only Completed (${completePlayers.length})</span>
                    </label>
                </div>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">Message Template:</label>
                <textarea id="player-message" class="w-full px-3 py-2 border border-gray-300 rounded-lg h-48 text-sm">Hi {name}!

Reminder for Republic Day Tournament 2026 🏐

*Team:* {team}

🔗 *App Link:* https://rd-tournament.vercel.app

*Please complete your registration ASAP:*
✅ Sign the liability waiver
✅ Select lunch preference (Veg/Non-Veg)

*Tournament Date:* January 24, 2026

We need your registration to finalize catering and logistics!

See you at the tournament! 🎉</textarea>
            </div>
            
            <div class="flex gap-3">
                <button class="close-modal flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">
                    Cancel
                </button>
                <button id="send-to-players" class="flex-1 bg-indigo-100 text-gray-800 py-2 rounded-lg hover:bg-indigo-200">
                    Open WhatsApp for Selected Players
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    
    modal.querySelector('#send-to-players').addEventListener('click', () => {
        const messageTemplate = document.getElementById('player-message').value;
        const filter = document.querySelector('input[name="player-filter"]:checked').value;
        
        let selectedPlayers = players;
        if (filter === 'pending-waiver') selectedPlayers = pendingWaiverPlayers;
        if (filter === 'pending-lunch') selectedPlayers = pendingLunchPlayers;
        if (filter === 'complete') selectedPlayers = completePlayers;
        
        if (selectedPlayers.length === 0) {
            showToast('No players match the selected filter', 'error');
            return;
        }
        
        let successCount = 0;
        selectedPlayers.forEach((player, index) => {
            setTimeout(() => {
                const personalizedMessage = messageTemplate
                    .replace('{name}', player.name)
                    .replace('{team}', player.team);
                
                const whatsappUrl = `https://wa.me/${player.phone.replace(/\D/g, '')}?text=${encodeURIComponent(personalizedMessage)}`;
                window.open(whatsappUrl, '_blank');
                successCount++;
                
                if (successCount === selectedPlayers.length) {
                    showToast(`Opened WhatsApp for ${selectedPlayers.length} players!`, 'success');
                }
            }, index * 1000); // 1 second delay between each
        });
        
        modal.remove();
    });
}

// ============================================
// TEAM MANAGEMENT FUNCTIONS (FOR ORGANIZER)
// ============================================

function showTeamPlayersModal(teamId, team) {
    const players = team.players || {};
    const playersList = Object.entries(players);
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
                <div>
                    <h3 class="text-xl font-bold text-gray-800">${team.name} - Players</h3>
                    <p class="text-sm text-gray-600">Captain: ${team.captain.name}</p>
                </div>
                <button class="close-modal text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
            </div>
            <div class="p-6">
                ${playersList.length === 0 ? `
                    <div class="text-center py-8 text-gray-500">
                        <p>No players added yet</p>
                    </div>
                ` : `
                    <div class="space-y-3">
                        ${playersList.map(([playerId, player]) => `
                            <div class="border border-gray-200 rounded-lg p-4">
                                <div class="flex justify-between items-start">
                                    <div class="flex-1">
                                        <h4 class="font-semibold text-gray-800">${player.name}</h4>
                                        <p class="text-sm text-gray-600">${player.email}</p>
                                        <p class="text-sm text-gray-600">${player.phone}</p>
                                        
                                        <div class="mt-2 flex flex-wrap gap-3 text-xs">
                                            <div class="flex items-center gap-1">
                                                ${player.waiverSigned ? 
                                                    '<span class="text-green-600">✓ Waiver Signed</span>' : 
                                                    '<span class="text-red-600">✗ Waiver Pending</span>'
                                                }
                                            </div>
                                            ${player.waiverSigned ? `
                                                <div class="text-gray-500">
                                                    Signed: ${new Date(player.waiverSignedAt).toLocaleDateString()}
                                                </div>
                                            ` : ''}
                                            <div class="flex items-center gap-1">
                                                ${player.lunchChoice ? 
                                                    `<span class="text-green-600">🍽️ ${getLunchChoiceDisplay(player.lunchChoice)}</span>` : 
                                                    '<span class="text-red-600">🍽️ Pending</span>'
                                                }
                                            </div>
                                        </div>
                                    </div>
                                    <button class="delete-player-btn bg-red-100 text-gray-800 px-3 py-1 rounded text-xs hover:bg-red-200" data-team-id="${teamId}" data-player-id="${playerId}">
                                        Delete
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    modal.querySelectorAll('.delete-player-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const teamId = e.target.dataset.teamId;
            const playerId = e.target.dataset.playerId;
            if (confirm('Delete this player?')) {
                await remove(ref(database, `teams/${teamId}/players/${playerId}`));
                showToast('Player deleted', 'success');
                modal.remove();
                showOrganizerDashboard();
            }
        });
    });
}

function showEditTeamModal(teamId, team) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-md w-full p-6">
            <h3 class="text-xl font-bold text-gray-800 mb-4">Edit Team</h3>
            
            <form id="edit-team-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">League</label>
                    <select id="edit-league" class="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                        <option value="pro-volleyball" ${team.leagueId === 'pro-volleyball' ? 'selected' : ''}>Professional Volleyball</option>
                        <option value="regular-volleyball" ${team.leagueId === 'regular-volleyball' ? 'selected' : ''}>Regular Volleyball</option>
                        <option value="masters-volleyball" ${team.leagueId === 'masters-volleyball' ? 'selected' : ''}>Volleyball 45+</option>
                        <option value="women-throwball" ${team.leagueId === 'women-throwball' ? 'selected' : ''}>Women Throwball</option>
                    </select>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
                    <input type="text" id="edit-team-name" class="w-full px-3 py-2 border border-gray-300 rounded-lg" value="${team.name}" required>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Captain Name</label>
                    <input type="text" id="edit-captain-name" class="w-full px-3 py-2 border border-gray-300 rounded-lg" value="${team.captain.name}" required>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Captain Email</label>
                    <input type="email" id="edit-captain-email" class="w-full px-3 py-2 border border-gray-300 rounded-lg" value="${team.captain.email}" required>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Captain Phone</label>
                    <input type="tel" id="edit-captain-phone" class="w-full px-3 py-2 border border-gray-300 rounded-lg" value="${team.captain.phone}" required>
                </div>

                <div class="flex gap-3">
                    <button type="button" class="cancel-edit flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">
                        Cancel
                    </button>
                    <button type="submit" class="flex-1 bg-blue-100 text-gray-800 py-2 rounded-lg hover:bg-blue-200">
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.cancel-edit').addEventListener('click', () => modal.remove());
    
    modal.querySelector('#edit-team-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const updates = {
            name: document.getElementById('edit-team-name').value,
            leagueId: document.getElementById('edit-league').value,
            'captain/name': document.getElementById('edit-captain-name').value,
            'captain/email': document.getElementById('edit-captain-email').value,
            'captain/phone': document.getElementById('edit-captain-phone').value
        };
        
        try {
            await update(ref(database, `teams/${teamId}`), updates);
            
            // Also update captain record
            const captainQuery = query(ref(database, 'captains'), orderByChild('teamId'), equalTo(teamId));
            const captainSnapshot = await get(captainQuery);
            if (captainSnapshot.exists()) {
                const captainId = Object.keys(captainSnapshot.val())[0];
                await update(ref(database, `captains/${captainId}`), {
                    name: updates['captain/name'],
                    email: updates['captain/email'],
                    phone: updates['captain/phone'],
                    teamName: updates.name,
                    leagueId: updates.leagueId
                });
            }
            
            showToast('Team updated successfully!', 'success');
            modal.remove();
            showOrganizerDashboard();
        } catch (error) {
            showToast('Error updating team: ' + error.message, 'error');
        }
    });
}

async function deleteTeam(teamId) {
    try {
        // Delete team
        await remove(ref(database, `teams/${teamId}`));
        
        // Delete captain record
        const captainQuery = query(ref(database, 'captains'), orderByChild('teamId'), equalTo(teamId));
        const captainSnapshot = await get(captainQuery);
        if (captainSnapshot.exists()) {
            const captainId = Object.keys(captainSnapshot.val())[0];
            await remove(ref(database, `captains/${captainId}`));
        }
        
        showToast('Team deleted successfully', 'success');
        showOrganizerDashboard();
    } catch (error) {
        showToast('Error deleting team: ' + error.message, 'error');
    }
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

function getLunchChoiceDisplay(lunchChoice) {
    if (!lunchChoice) return 'Pending';
    if (lunchChoice === 'veg') return 'Veg';
    if (lunchChoice === 'nonveg') return 'Non-Veg';
    if (lunchChoice === 'none') return 'No Food';
    return lunchChoice;
}

function calculateStats(teams) {
    let totalTeams = 0;
    let totalPlayers = 0;
    let completedWaivers = 0;
    let completedLunch = 0;
    let vegCount = 0;
    let nonVegCount = 0;
    let noFoodCount = 0;
    
    Object.values(teams).forEach(team => {
        totalTeams++;
        if (team.players) {
            Object.values(team.players).forEach(player => {
                totalPlayers++;
                if (player.waiverSigned) completedWaivers++;
                if (player.lunchChoice) {
                    completedLunch++;
                    if (player.lunchChoice === 'veg') vegCount++;
                    else if (player.lunchChoice === 'nonveg') nonVegCount++;
                    else if (player.lunchChoice === 'none') noFoodCount++;
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
        nonVegCount,
        noFoodCount
    };
}

function calculateLeagueStats(teams) {
    const leagueStats = {};
    
    Object.values(teams).forEach(team => {
        const leagueId = team.leagueId;
        
        if (!leagueStats[leagueId]) {
            leagueStats[leagueId] = {
                teamCount: 0,
                totalPlayers: 0,
                completedWaivers: 0,
                completedLunch: 0,
                ageVerified: 0
            };
        }
        
        leagueStats[leagueId].teamCount++;
        
        if (team.players) {
            Object.values(team.players).forEach(player => {
                leagueStats[leagueId].totalPlayers++;
                if (player.waiverSigned) leagueStats[leagueId].completedWaivers++;
                if (player.lunchChoice) leagueStats[leagueId].completedLunch++;
                if (player.ageVerified && leagueId === 'masters-volleyball') {
                    leagueStats[leagueId].ageVerified++;
                }
            });
        }
    });
    
    return leagueStats;
}

function calculateTeamLeaderboard(teams) {
    const leaderboard = [];
    
    Object.entries(teams).forEach(([teamId, team]) => {
        const playerCount = team.players ? Object.keys(team.players).length : 0;
        const waiverCount = team.players ? Object.values(team.players).filter(p => p.waiverSigned).length : 0;
        const lunchCount = team.players ? Object.values(team.players).filter(p => p.lunchChoice).length : 0;
        
        const completionRate = playerCount > 0 
            ? Math.round(((waiverCount + lunchCount) / (playerCount * 2)) * 100)
            : 0;
        
        leaderboard.push({
            id: teamId,
            name: team.name,
            leagueId: team.leagueId,
            playerCount,
            waiverCount,
            lunchCount,
            completionRate
        });
    });
    
    // Sort by completion rate (descending), then by name (ascending)
    leaderboard.sort((a, b) => {
        if (b.completionRate === a.completionRate) {
            return a.name.localeCompare(b.name);
        }
        return b.completionRate - a.completionRate;
    });
    
    return leaderboard;
}

function messagePlayersWithFilter(teams, filter) {
    const players = [];
    
    Object.values(teams).forEach(team => {
        if (team.players) {
            Object.entries(team.players).forEach(([playerId, player]) => {
                let include = false;
                
                if (filter === 'pendingWaiver' && !player.waiverSigned) {
                    include = true;
                } else if (filter === 'pendingLunch' && !player.lunchChoice) {
                    include = true;
                }
                
                if (include && player.phone) {
                    players.push({
                        name: player.name,
                        phone: player.phone,
                        team: team.name,
                        playerId: playerId
                    });
                }
            });
        }
    });
    
    if (players.length === 0) {
        showToast('No players match this filter', 'info');
        return;
    }
    
    const filterName = filter === 'pendingWaiver' ? 'Pending Waiver' : 'Pending Lunch';
    const message = filter === 'pendingWaiver'
        ? `Hi {name}!

⚠️ URGENT REMINDER ⚠️

You haven't signed the waiver yet for Republic Day Tournament 2026!

Team: {team}

The waiver is REQUIRED to participate in the tournament.

Please complete ASAP:
1. Click your registration link
2. Sign the waiver
3. Select lunch preference

Tournament Date: January 24, 2026

Please complete this today! 🏐`
        : `Hi {name}!

Reminder: Please select your lunch preference! 🍽️

Team: {team}

We need to finalize food orders soon.

Please complete:
1. Click your registration link
2. Select: Veg / Non-Veg / No Food

Takes 30 seconds!

Tournament Date: January 24, 2026

Thank you! 🏐`;
    
    // Show modal with option to edit message
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 class="text-xl font-bold mb-4">Send Reminder to ${players.length} Players (${filterName})</h3>
            
            <div class="mb-4">
                <label class="block text-sm font-semibold text-gray-700 mb-2">Message Template:</label>
                <textarea id="bulk-message-template" class="w-full p-3 border rounded-lg h-64 font-mono text-sm">${message}</textarea>
                <p class="text-xs text-gray-500 mt-1">Variables: {name}, {team}</p>
            </div>
            
            <div class="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p class="text-sm font-semibold text-blue-800">Sending to ${players.length} players:</p>
                <p class="text-xs text-blue-600 mt-1">Messages will open in WhatsApp with 1 second delay between each</p>
            </div>
            
            <div class="flex gap-3">
                <button id="send-bulk-btn" class="flex-1 bg-green-600 text-gray-800 py-3 rounded-lg font-semibold hover:bg-green-700">
                    📱 Send to ${players.length} Players
                </button>
                <button id="cancel-bulk-btn" class="px-6 bg-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-400">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('send-bulk-btn').addEventListener('click', async () => {
        const template = document.getElementById('bulk-message-template').value;
        
        for (const player of players) {
            const playerMessage = template
                .replace(/{name}/g, player.name)
                .replace(/{team}/g, player.team);
            
            const whatsappUrl = `https://wa.me/${player.phone.replace(/\D/g, '')}?text=${encodeURIComponent(playerMessage)}`;
            window.open(whatsappUrl, '_blank');
            
            // Wait 1 second between messages
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        modal.remove();
        showToast(`Sent ${players.length} messages!`, 'success');
    });
    
    document.getElementById('cancel-bulk-btn').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function exportAllData(teams, stats) {
    // Create CSV content
    let csv = 'Team,League,Captain Name,Captain Email,Captain Phone,Player Name,Player Email,Player Phone,Waiver Signed,Lunch Choice,Waiver Signed At\n';
    
    Object.values(teams).forEach(team => {
        if (team.players && Object.keys(team.players).length > 0) {
            Object.values(team.players).forEach(player => {
                csv += `"${team.name}","${getLeagueName(team.leagueId)}","${team.captain.name}","${team.captain.email}","${team.captain.phone}","${player.name}","${player.email || 'Not provided'}","${player.phone}","${player.waiverSigned ? 'Yes' : 'No'}","${player.lunchChoice || 'Pending'}","${player.waiverSignedAt || 'N/A'}"\n`;
            });
        } else {
            // Team with no players
            csv += `"${team.name}","${getLeagueName(team.leagueId)}","${team.captain.name}","${team.captain.email}","${team.captain.phone}","No players yet","","","","",""\n`;
        }
    });
    
    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tournament-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showToast('Data exported successfully!', 'success');
}

function exportFoodOrders(teams, stats) {
    // Create food order CSV
    let csv = 'Team,League,Player Name,Phone,Lunch Choice\n';
    
    Object.values(teams).forEach(team => {
        if (team.players) {
            Object.values(team.players).forEach(player => {
                if (player.lunchChoice && player.lunchChoice !== 'none') {
                    csv += `"${team.name}","${getLeagueName(team.leagueId)}","${player.name}","${player.phone}","${player.lunchChoice === 'veg' ? 'Vegetarian' : 'Non-Vegetarian'}"\n`;
                }
            });
        }
    });
    
    // Add summary
    csv += '\n\nSUMMARY\n';
    csv += `Vegetarian,${stats.vegCount}\n`;
    csv += `Non-Vegetarian,${stats.nonVegCount}\n`;
    csv += `No Food,${stats.noFoodCount}\n`;
    csv += `Total Food Orders,${stats.vegCount + stats.nonVegCount}\n`;
    
    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `food-orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showToast('Food orders exported successfully!', 'success');
}

function showAllTeamsModal(teams) {
    const leaderboard = calculateTeamLeaderboard(teams);
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 class="text-2xl font-bold mb-4">🏆 Complete Team Leaderboard (${leaderboard.length} teams)</h3>
            
            <div class="space-y-2">
                ${leaderboard.map((team, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                    const bgColor = team.completionRate === 100 ? 'bg-green-50 border-green-200' : 
                                   team.completionRate >= 75 ? 'bg-blue-50 border-blue-200' :
                                   team.completionRate >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
                    return `
                    <div class="flex items-center gap-3 p-3 ${bgColor} border rounded-lg">
                        <div class="text-lg font-bold w-12 text-center">${medal}</div>
                        <div class="flex-1">
                            <div class="font-semibold text-gray-800">${team.name}</div>
                            <div class="text-xs text-gray-600">${getLeagueName(team.leagueId)} • ${team.playerCount} players</div>
                        </div>
                        <div class="text-right">
                            <div class="text-xl font-bold ${team.completionRate === 100 ? 'text-green-600' : 'text-gray-800'}">${team.completionRate}%</div>
                            <div class="text-xs text-gray-600">${team.waiverCount}W ${team.lunchCount}L</div>
                        </div>
                        ${team.completionRate === 100 ? '<div class="text-2xl">✅</div>' : ''}
                    </div>
                    `;
                }).join('')}
            </div>
            
            <button id="close-modal-btn" class="w-full mt-6 bg-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-400">
                Close
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('close-modal-btn').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
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
        success: 'bg-teal-100',
        error: 'bg-red-100',
        info: 'bg-cyan-100',
        warning: 'bg-yellow-500'
    };
    
    toast.className = `${colors[type]} text-gray-800 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in`;
    toast.innerHTML = `
        <span class="flex-1">${message}</span>
        <button class="text-gray-800 hover:text-gray-200" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}
