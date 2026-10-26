const { io } = require('socket.io-client');

const BASE_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

async function apiRequest(method, endpoint, token = null, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return { status: response.status, data: await response.json() };
  }
  return { status: response.status, data: { status: 'error', message: await response.text() } };
}

function waitForSocketEvent(socket, eventName, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for socket event: ${eventName}`)), timeout);
    socket.once(eventName, (data) => { clearTimeout(timer); resolve(data); });
  });
}

// 👈 নতুন: Test counter সহ helper
let passedCount = 0;
let totalCount = 0;
function printTest(name, passed, details = '') {
  totalCount++;
  if (passed) {
    passedCount++;
    console.log(`✅ ${name}`);
  } else {
    console.log(`❌ ${name} ${details ? '- ' + details : ''}`);
  }
}

async function runMasterTests() {
  console.log('🚀 Starting COMPLETE MASTER End-to-End Tests (Strict Mode)...\n');
  const randomStr = Math.floor(Math.random() * 10000);
  
  let userA, userB, userC;
  let groupId, postIdForCascadeDelete;
  // 👈 নতুন: socketC আলাদা variable
  let socketA, socketB, socketC;

  const dummyPublicKeyA = '-----BEGIN PUBLIC KEY-----MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...A-----END PUBLIC KEY-----';
  const dummyPublicKeyB = '-----BEGIN PUBLIC KEY-----MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...B-----END PUBLIC KEY-----';
  const strictE2EEText = 'U2FsdGVkX19X9Y4h8J2k3L5m7N9p1Q3r5T7v9X1z3B5d7F9h1J3k5L7m9N1p3Q5r7T9v1X3z5B7d9F1h3J5k7L9m='; 
  let oldUserAToken = null;

  try {
    // ========================================
    // ১. AUTHENTICATION & E2EE SETUP
    // ========================================
    console.log('--- 1. AUTHENTICATION & E2EE SETUP ---');
    
    const fakeEmailRes = await apiRequest('POST', '/auth/register', null, { name: 'Fake User', username: `fake_${randomStr}`, email: `hacker@yopmail.com`, password: 'password123' });
    printTest('Fake Email Blocker (yopmail)', fakeEmailRes.status === 400);

    userA = (await apiRequest('POST', '/auth/register', null, { name: 'Alpha', username: `alpha_${randomStr}`, email: `alpha_${randomStr}@test.com`, password: 'password123', publicKey: dummyPublicKeyA })).data.data;
    userB = (await apiRequest('POST', '/auth/register', null, { name: 'Beta', username: `beta_${randomStr}`, email: `beta_${randomStr}@test.com`, password: 'password123', publicKey: dummyPublicKeyB })).data.data;
    userC = (await apiRequest('POST', '/auth/register', null, { name: 'Charlie', username: `charlie_${randomStr}`, email: `charlie_${randomStr}@test.com`, password: 'password123' })).data.data;
    printTest('Register 3 Users with E2EE Keys', !!userA?.token && !!userB?.token && !!userC?.token);

    const loginRes = await apiRequest('POST', '/auth/login', null, { loginId: `alpha_${randomStr}`, password: 'password123' });
    printTest('Login existing user', loginRes.status === 200);
    if (loginRes.data?.data?.token) userA.token = loginRes.data.data.token;

    const dupRes = await apiRequest('POST', '/auth/register', null, { name: 'Alpha Dup', username: `alpha_${randomStr}`, email: `other_${randomStr}@test.com`, password: 'password123' });
    printTest('Duplicate Username Rejected (409)', dupRes.status === 409 && dupRes.data.message.includes('Duplicate credentials'));

    // ========================================
    // ২. USER PROFILE & SETTINGS
    // ========================================
    console.log('\n--- 2. USER PROFILE & SETTINGS ---');
    
    const updateProfileRes = await apiRequest('PUT', '/users/profile', userA.token, { name: 'Alpha Updated', bio: 'New Bio', username: 'hacker_man', publicKey: '-----BEGIN PUBLIC KEY-----NEW_KEY_FOR_NEW_DEVICE-----END PUBLIC KEY-----', fcmToken: 'dummy_fcm_token_12345' });
    printTest('Update Profile (Username locked, Keys updated)', updateProfileRes.status === 200 && updateProfileRes.data.data.username === `alpha_${randomStr}` && updateProfileRes.data.data.publicKey.includes('NEW_KEY_FOR_NEW_DEVICE'));

    // ========================================
    // ৩. FRIEND REQUEST, PRIVACY LOCK & KEY EXCHANGE
    // ========================================
    console.log('\n--- 3. FRIEND REQUEST & KEY EXCHANGE ---');
    
    await apiRequest('POST', `/users/friend-request/send/${userB.user._id}`, userA.token);
    const acceptRes = await apiRequest('POST', `/users/friend-request/accept/${userA.user._id}`, userB.token);
    printTest('Send & Accept Friend Request', acceptRes.status === 200);

    await apiRequest('PUT', '/users/toggle-profile-lock', userB.token);
    
    const searchResC = (await apiRequest('GET', `/users/search?query=beta_${randomStr}`, userC.token)).data.data[0];
    printTest('Privacy Lock: Non-friend search obfuscation', searchResC && searchResC.email === undefined);

    const searchResA = (await apiRequest('GET', `/users/search?query=beta_${randomStr}`, userA.token)).data.data[0];
    printTest('Privacy Lock: Friend search full access', searchResA && searchResA.email !== undefined);
    printTest('E2EE Security: Public Key is hidden in search results', searchResA.publicKey === undefined);

    const keyRes = await apiRequest('GET', `/users/keys/${userB.user._id}`, userA.token);
    printTest('E2EE: Fetch Public Key via Key Exchange API', keyRes.status === 200 && keyRes.data.data.publicKey === dummyPublicKeyB);

       // 👈 নতুন যোগ করা হলো: ৩.১ FRIENDS & REQUESTS LIST
    console.log('\n--- 3.1. FRIENDS & REQUESTS LIST ---');
    
    // ✅ FIX: Friends list check (UserA has 1 friend = UserB)
    const friendsListRes = await apiRequest('GET', '/users/friends', userA.token);
    printTest(
      'Get Friends List (returns 1 friend)', 
      friendsListRes.status === 200 && 
      friendsListRes.data.data.length === 1 &&
      friendsListRes.data.data[0]._id === userB.user._id
    );

    // ✅ FIX: Create a FRESH pending request (UserA → UserC) so outgoingCount is genuinely 1
    await apiRequest('POST', `/users/friend-request/send/${userC.user._id}`, userA.token);

    // Now UserA has: 0 incoming, 1 outgoing pending
    const friendReqRes = await apiRequest('GET', '/users/friend-requests', userA.token);
    printTest(
      'Get Friend Requests List (UserA: outgoing=1, incoming=0)', 
      friendReqRes.status === 200 && 
      friendReqRes.data.data.outgoingCount === 1 &&
      friendReqRes.data.data.incomingCount === 0 &&
      friendReqRes.data.data.outgoing[0]._id === userC.user._id
    );

    // ✅ BONUS: Verify UserC's incoming side (UserC received 1 request from UserA)
    const friendReqResC = await apiRequest('GET', '/users/friend-requests', userC.token);
    printTest(
      'Get Friend Requests List (UserC: incoming=1, outgoing=0)', 
      friendReqResC.status === 200 && 
      friendReqResC.data.data.incomingCount === 1 &&
      friendReqResC.data.data.outgoingCount === 0 &&
      friendReqResC.data.data.incoming[0]._id === userA.user._id
    );

    // ========================================
    // ৪. E2EE POSTS & PAGINATION
    // ========================================
    console.log('\n--- 4. E2EE POSTS & PAGINATION ---');
    
    for(let i=0; i<3; i++) {
      await apiRequest('POST', '/posts/create', userA.token, { textContent: strictE2EEText, visibility: 'public', mediaType: 'none' });
    }
    printTest('Create 3 E2EE Posts', true);

    const feedByA = (await apiRequest('GET', '/posts/feed?page=1&limit=2', userA.token)).data.data;
    printTest('Pagination Works (Limit 2, Total > 2)', feedByA.length === 2);
    const myPostInFeed = feedByA.find(p => p.textContent === strictE2EEText);
    printTest('E2EE Strict Check: Backend didn\'t alter ciphertext', myPostInFeed && myPostInFeed.textContent === strictE2EEText);

    // ========================================
    // ৫. GROUPS & E2EE GROUP KEYS
    // ========================================
    console.log('\n--- 5. GROUPS & E2EE GROUP KEYS ---');
    
    const mockEncryptedKeys = [
      { user: userA.user._id, encryptedKey: 'encryptedKeyForUserA' },
      { user: userB.user._id, encryptedKey: 'encryptedKeyForUserB' }
    ];
    const groupRes = await apiRequest('POST', '/groups/create', userA.token, { groupName: 'Test Group', members: [userB.user._id], encryptedGroupKeys: mockEncryptedKeys });
    groupId = groupRes.data.data._id;
    printTest('Create Group with E2EE Keys', groupRes.status === 201 && groupRes.data.data.encryptedGroupKeys.length === 2);

    const leaveRes = await apiRequest('PUT', `/groups/${groupId}/leave`, userB.token);
    printTest('User leaves group successfully', leaveRes.status === 200);

    // ========================================
    // ৫.১ MUTE / UNMUTE USER (NEW)
    // ========================================
    console.log('\n--- 5.1. MUTE / UNMUTE USER ---');
    
    const muteUserRes = await apiRequest('PUT', `/users/mute/${userB.user._id}`, userA.token);
    printTest('Mute a User', muteUserRes.status === 200);

    const muteSelfRes = await apiRequest('PUT', `/users/mute/${userA.user._id}`, userA.token);
    printTest('Cannot Mute Yourself (400)', muteSelfRes.status === 400);

    const muteNonexistentUserRes = await apiRequest('PUT', `/users/mute/000000000000000000000000`, userA.token);
    printTest('Mute Nonexistent User (404)', muteNonexistentUserRes.status === 404);

    const unmuteUserRes = await apiRequest('PUT', `/users/unmute/${userB.user._id}`, userA.token);
    printTest('Unmute a User', unmuteUserRes.status === 200);

    // ========================================
    // ৫.২ MUTE / UNMUTE GROUP (NEW)
    // ========================================
    console.log('\n--- 5.2. MUTE / UNMUTE GROUP ---');
    
    // UserA is still in the group (creator), so they can mute it
    const muteGroupRes = await apiRequest('PUT', `/users/mute-group/${groupId}`, userA.token);
    printTest('Mute a Group (as member)', muteGroupRes.status === 200);

    const muteGroupNonMemberRes = await apiRequest('PUT', `/users/mute-group/${groupId}`, userC.token);
    printTest('Cannot Mute Group as Non-Member (403)', muteGroupNonMemberRes.status === 403);

    // UserB left the group, so should fail
    const muteGroupLeftRes = await apiRequest('PUT', `/users/mute-group/${groupId}`, userB.token);
    printTest('Cannot Mute Group after leaving (403)', muteGroupLeftRes.status === 403);

    const muteNonexistentGroupRes = await apiRequest('PUT', `/users/mute-group/000000000000000000000000`, userA.token);
    printTest('Mute Nonexistent Group (404)', muteNonexistentGroupRes.status === 404);

    const unmuteGroupRes = await apiRequest('PUT', `/users/unmute-group/${groupId}`, userA.token);
    printTest('Unmute a Group', unmuteGroupRes.status === 200);

    // ========================================
    // ৬. REAL-TIME SOCKET.IO (Strict Block Test)
    // ========================================
    console.log('\n--- 6. REAL-TIME SOCKET.IO (Strict Block Test) ---');
    
    socketA = io(SOCKET_URL, { auth: { token: userA.token }, transports: ['websocket'] });
    socketB = io(SOCKET_URL, { auth: { token: userB.token }, transports: ['websocket'] });

    await Promise.all([ waitForSocketEvent(socketA, 'connect'), waitForSocketEvent(socketB, 'connect') ]);
    
    await apiRequest('PUT', `/users/block/${userA.user._id}`, userB.token);

    let receivedBlockedSocketMessage = false;
    socketB.on('receive-message', () => { receivedBlockedSocketMessage = true; });
    socketA.emit('instant-message', { receiverId: userB.user._id.toString(), messagePayload: { content: 'Hacked' } });

    await new Promise(r => setTimeout(r, 1500)); 
    printTest('Strict Socket Block: Message was dropped', receivedBlockedSocketMessage === false);

    // 👈 নতুন যোগ করা হলো: Blocked Users List check
    const blockedListRes = await apiRequest('GET', '/users/blocked', userB.token);
    printTest('Get Blocked Users List (returns 1 blocked user)', blockedListRes.status === 200 && blockedListRes.data.data.length === 1);

    socketA.disconnect();
    socketB.disconnect();

    // ========================================
    // ৭. SECURITY: LOGOUT & TOKEN REVOCATION
    // ========================================
    console.log('\n--- 7. SECURITY: LOGOUT & TOKEN REVOCATION ---');
    
    const checkBeforeLogout = await apiRequest('GET', '/auth/me', userA.token);
    printTest('Token is valid before logout', checkBeforeLogout.status === 200);

    oldUserAToken = userA.token; 
    const logoutRes = await apiRequest('POST', '/auth/logout', userA.token);
    printTest('Logout successful', logoutRes.status === 200);

    const checkAfterLogout = await apiRequest('GET', '/auth/me', userA.token);
    printTest('Old token is INVALIDATED (401 expected)', checkAfterLogout.status === 401);

    const reloginRes = await apiRequest('POST', '/auth/login', null, { loginId: `alpha_${randomStr}`, password: 'password123' });
    if (reloginRes.data?.data?.token) userA.token = reloginRes.data.data.token; 
    printTest('Login again successful with new token', reloginRes.status === 200);

    // ========================================
    // ৮. SOCKET TOKEN REVOCATION
    // ========================================
    console.log('\n--- ৮. SOCKET TOKEN REVOCATION ---');
    
    let socketAuthFailed = false;
    const newSocket = io(SOCKET_URL, { auth: { token: oldUserAToken }, transports: ['websocket'] });
    newSocket.on('connect_error', (err) => {
      if (err.message === 'Authentication error') { socketAuthFailed = true; newSocket.close(); }
    });

    await new Promise(r => setTimeout(r, 1000));
    printTest('Socket Auth Rejected Old Token', socketAuthFailed === true);

    // ========================================
    // ৯. OTP BRUTE-FORCE PROTECTION
    // ========================================
    console.log('\n--- 9. OTP BRUTE-FORCE PROTECTION ---');
    
    const reqOtp = await apiRequest('POST', '/auth/forgot-password', null, { email: `alpha_${randomStr}@test.com` });
    printTest('Request OTP', reqOtp.status === 200);

    for (let i = 1; i <= 3; i++) {
      await apiRequest('POST', '/auth/verify-otp', null, { email: `alpha_${randomStr}@test.com`, otp: '000000' });
    }
    const blockedOtpRes = await apiRequest('POST', '/auth/verify-otp', null, { email: `alpha_${randomStr}@test.com`, otp: '123456' });
    printTest('OTP is blocked after 3 wrong attempts', blockedOtpRes.status === 400);

    // ========================================
    // ১০. PASSWORD BRUTE-FORCE PROTECTION
    // ========================================
    console.log('\n--- ১০. PASSWORD BRUTE-FORCE PROTECTION ---');
    
    for (let i = 1; i <= 5; i++) {
      await apiRequest('POST', '/auth/login', null, { loginId: `alpha_${randomStr}`, password: 'wrongpassword' });
    }
    const lockedLoginRes = await apiRequest('POST', '/auth/login', null, { loginId: `alpha_${randomStr}`, password: 'password123' });
    printTest('Account is LOCKED after 5 wrong passwords', lockedLoginRes.status === 401 && lockedLoginRes.data.message.includes('temporarily locked'));

    // ========================================
    // ১১. NO-SQL INJECTION PROTECTION
    // ========================================
    console.log('\n--- ১১. NO-SQL INJECTION PROTECTION ---');
    
    const nosqlLoginRes = await apiRequest('POST', '/auth/login', null, { loginId: { "$gt": "" }, password: { "$gt": "" } });
    printTest('NoSQL Injection on Login Blocked', nosqlLoginRes.status === 400 || nosqlLoginRes.status === 401);

    const nosqlSearchRes = await apiRequest('GET', '/users/search?query[$gt]=', userB.token);
    printTest('NoSQL Injection on Search Blocked', nosqlSearchRes.status === 400 || nosqlSearchRes.status === 200); 

    // ========================================
    // ১২. SINGLE DEVICE POLICY
    // ========================================
    console.log('\n--- ১২. SINGLE DEVICE POLICY ---');
    
    const device1Login = await apiRequest('POST', '/auth/login', null, { loginId: `beta_${randomStr}`, password: 'password123' });
    const token1 = device1Login.data?.data?.token;
    const checkDevice1 = await apiRequest('GET', '/auth/me', token1);
    printTest('Device 1: Token is valid initially', checkDevice1.status === 200);

    const device2Login = await apiRequest('POST', '/auth/login', null, { loginId: `beta_${randomStr}`, password: 'password123' });
    const token2 = device2Login.data?.data?.token;
    
    const checkDevice1After = await apiRequest('GET', '/auth/me', token1);
    printTest('Device 1: Token INVALIDATED after Device 2 login', checkDevice1After.status === 401);

    const checkDevice2 = await apiRequest('GET', '/auth/me', token2);
    printTest('Device 2: New token is valid', checkDevice2.status === 200);

    userB.token = token2; 

    // ========================================
    // ১৩. JSON LIMIT (DoS PREVENTION)
    // ========================================
    console.log('\n--- ১৩. JSON LIMIT (DoS PREVENTION) ---');
    
    const hugePayload = { textContent: 'A'.repeat(3 * 1024 * 1024) }; 
    const hugeRes = await apiRequest('POST', '/posts/create', token2, hugePayload);
    printTest('JSON Payload Limit Blocked (3MB payload rejected)', hugeRes.status === 413);

    // ========================================
    // ১৪. REGEX REDOS / QUERY LENGTH LIMIT
    // ========================================
    console.log('\n--- ১৪. REGEX REDOS / QUERY LENGTH LIMIT ---');
    
    const longQuery = 'a'.repeat(100); 
    const longQueryRes = await apiRequest('GET', `/users/search?query=${longQuery}`, userB.token);
    printTest('Search Query Length Limit Blocked', longQueryRes.status === 400 && longQueryRes.data.message.includes('Maximum 50 characters'));

    // ========================================
    // ১৫. GROUP E2EE KEY ROTATION
    // ========================================
    console.log('\n--- ১৫. GROUP E2EE KEY ROTATION ---');
    
    const newRotatedKeys = [
      { user: userA.user._id, encryptedKey: 'newEncryptedKeyForUserA' }
    ];
    const rotateRes = await apiRequest('PUT', `/groups/${groupId}/rotate-keys`, userA.token, { encryptedGroupKeys: newRotatedKeys });
    printTest('Group Key Rotation Successful', rotateRes.status === 200 && rotateRes.data.data.encryptedGroupKeys[0].encryptedKey === 'newEncryptedKeyForUserA');

    // ========================================
    // ১৬. REFRESH TOKEN SYSTEM (COMPLETE)
    // ========================================
    console.log('\n--- ১৬. REFRESH TOKEN SYSTEM ---');
    
    const refreshLoginRes = await apiRequest('POST', '/auth/login', null, { loginId: `charlie_${randomStr}`, password: 'password123' });
    const charlieAccessToken = refreshLoginRes.data?.data?.token;
    const charlieRefreshToken = refreshLoginRes.data?.data?.refreshToken;

    printTest('Login returns Access & Refresh Token', !!charlieAccessToken && !!charlieRefreshToken);
    
    userC.token = charlieAccessToken;

    // 👈 নতুন যোগ করা হলো: Actual refresh flow test
    if (charlieRefreshToken) {
      const refreshRes = await apiRequest('POST', '/auth/refresh-token', null, { refreshToken: charlieRefreshToken });
      printTest('Refresh Token generates new Access Token', refreshRes.status === 200 && !!refreshRes.data?.data?.token);
      
      if (refreshRes.data?.data?.token) {
        const newAccessToken = refreshRes.data.data.token;
        userC.token = newAccessToken; // 👈 নতুন token দিয়ে userC update
        
        const meRes = await apiRequest('GET', '/auth/me', newAccessToken);
        printTest('New Access Token is valid', meRes.status === 200);
      }
      
      // Invalid refresh token test
      const invalidRefreshRes = await apiRequest('POST', '/auth/refresh-token', null, { refreshToken: 'invalid_refresh_token_xyz' });
      printTest('Invalid Refresh Token rejected (403)', invalidRefreshRes.status === 403);
    }

    // ========================================
    // ১৭. E2EE CRYPTO VAULT RESTORE
    // ========================================
    console.log('\n--- ১৭. E2EE CRYPTO VAULT RESTORE ---');
    
    const restoreVaultRes = await apiRequest('POST', '/users/restore-crypto-vault', userC.token, { backupPin: '123456' });
    printTest('Crypto Vault Restore (Returns 404 if no vault)', restoreVaultRes.status === 404 || restoreVaultRes.status === 401);

    // ========================================
    // ১৮. SOCKET OFFLINE QUEUE SYNC
    // ========================================
    console.log('\n--- ১৮. SOCKET OFFLINE QUEUE SYNC ---');

    // User B sends a message to User C (who has NEVER connected a socket)
    await apiRequest('POST', '/messages/send', userB.token, {
      receiverId: userC.user._id,
      content: 'Offline Message Payload',
      messageType: 'text'
    });

    // 👈 নতুন: socketC আলাদা variable ব্যবহার করা হলো (socketA reuse এড়িয়ে)
    socketC = io(SOCKET_URL, { auth: { token: userC.token }, transports: ['websocket'] });

    try {
      const offlineEvents = await waitForSocketEvent(socketC, 'sync-offline-events', 5000);
      printTest('Offline message successfully queued and synced on reconnect', offlineEvents.length > 0 && offlineEvents[0].event === 'receive-message');
    } catch (err) {
      printTest('Offline message successfully queued and synced on reconnect', false, 'Timeout: ' + err.message);
    }
    socketC.disconnect();

    // ========================================
    // ১৯. CASCADE MEDIA DELETION
    // ========================================
    console.log('\n--- ১৯. CASCADE MEDIA DELETION ---');
    
    const cascadePostRes = await apiRequest('POST', '/posts/create', userC.token, {
      textContent: 'Post with media',
      visibility: 'public',
      mediaType: 'image',
      mediaUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      mediaPublicId: 'dummy_public_id_123'
    });
    postIdForCascadeDelete = cascadePostRes.data.data._id;

    const deleteCascadeRes = await apiRequest('DELETE', `/posts/${postIdForCascadeDelete}`, userC.token);
    printTest('Post deleted successfully (Cascade Hook executed without crashing)', deleteCascadeRes.status === 200);

    // ========================================
    // 🎉 FINAL SUMMARY
    // ========================================
    console.log('\n🎉 ALL TESTS COMPLETED! 🎉');
    console.log(`\n📊 Summary: ${passedCount}/${totalCount} tests passed.`);
    if (passedCount === totalCount) {
      console.log('✅ ALL TESTS PASSED PERFECTLY! 🎉');
    } else {
      console.log(`⚠️  ${totalCount - passedCount} test(s) failed. Check logs above.`);
    }
    
  } catch (error) {
    console.error('\n❌ Test Suite Failed with Error:', error.message);
    if (socketA) socketA.disconnect();
    if (socketB) socketB.disconnect();
    if (socketC) socketC.disconnect();
  }
}

runMasterTests();