(function () {
  'use strict';

  const SUPABASE_URL = 'https://nhhmkdjwtfnganubffpm.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaG1rZGp3dGZuZ2FudWJmZnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMwNTUsImV4cCI6MjA5NDI2OTA1NX0.vpG-BLhHdrhLLaxPF2tIs4oYVEB9FOqPZrPziTmZrBs';

  const { createClient } = window.supabase;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let currentUser = null;
  let syncInProgress = false;
  let syncTimeout = null;

  const authEl = document.getElementById('authArea');
  const modalEl = document.getElementById('authModal');
  const modalClose = document.getElementById('authModalClose');
  const authForm = document.getElementById('authForm');
  const authTitle = document.getElementById('authTitle');
  const authSubmit = document.getElementById('authSubmit');
  const authToggle = document.getElementById('authToggle');
  const authError = document.getElementById('authError');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');

  let isSignUp = false;

  function renderAuth() {
    const userInfoEl = document.getElementById('userInfo');
    if (currentUser) {
      if (userInfoEl) {
        userInfoEl.innerHTML = `<span class="auth-user">${currentUser.email}</span>`;
      }
      authEl.innerHTML = '';
    } else {
      if (userInfoEl) userInfoEl.innerHTML = '';
      authEl.innerHTML = `<button id="signInBtn" class="nav-btn auth-btn">Sign In</button>`;
      document.getElementById('signInBtn').addEventListener('click', function () {
        showModal(false);
      });
    }
  }

  function showModal(signUp) {
    isSignUp = signUp;
    authTitle.textContent = signUp ? 'Create Account' : 'Sign In';
    authSubmit.textContent = signUp ? 'Create Account' : 'Sign In';
    authToggle.innerHTML = signUp
      ? 'Already have an account? <a href="#">Sign in</a>'
      : 'No account? <a href="#">Create one</a>';
    authError.textContent = '';
    authError.classList.add('hidden');
    modalEl.classList.remove('hidden');
  }

  function hideModal() {
    modalEl.classList.add('hidden');
    authForm.reset();
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    authError.textContent = '';
    authError.classList.add('hidden');
    const email = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) {
      authError.textContent = 'Email and password are required.';
      authError.classList.remove('hidden');
      return;
    }
    if (password.length < 6) {
      authError.textContent = 'Password must be at least 6 characters.';
      authError.classList.remove('hidden');
      return;
    }

    authSubmit.disabled = true;
    authSubmit.textContent = 'Please wait...';

    try {
      let result;
      if (isSignUp) {
        result = await client.auth.signUp({ email, password });
      } else {
        result = await client.auth.signInWithPassword({ email, password });
      }

      if (result.error) {
        authError.textContent = result.error.message;
        authError.classList.remove('hidden');
        authSubmit.disabled = false;
        authSubmit.textContent = isSignUp ? 'Create Account' : 'Sign In';
        return;
      }

      if (isSignUp && result.data?.user?.identities?.length === 0) {
        authError.textContent = 'An account with this email already exists.';
        authError.classList.remove('hidden');
        authSubmit.disabled = false;
        authSubmit.textContent = 'Create Account';
        return;
      }

      hideModal();
    } catch (err) {
      authError.textContent = 'Connection error. Please try again.';
      authError.classList.remove('hidden');
      authSubmit.disabled = false;
      authSubmit.textContent = isSignUp ? 'Create Account' : 'Sign In';
    }
  }

  async function signOut() {
    await client.auth.signOut();
  }

  function setUser(user) {
    currentUser = user;
    renderAuth();
    if (user) {
      loadProgress();
    }
  }

  async function loadProgress() {
    if (!currentUser) return;
    try {
      const { data, error } = await client
        .from('user_progress')
        .select('progress')
        .eq('user_id', currentUser.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.warn('Failed to load cloud progress:', error.message);
        return;
      }

      if (data?.progress) {
        window.__arLoadProgress && window.__arLoadProgress(data.progress);
      }
    } catch (err) {
      console.warn('Failed to load cloud progress:', err.message);
    }
  }

  async function saveProgress(progress) {
    if (!currentUser) return;
    if (syncInProgress) return;

    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
      try {
        syncInProgress = true;
        const { error } = await client
          .from('user_progress')
          .upsert(
            { user_id: currentUser.id, progress, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );

        if (error) {
          console.warn('Cloud sync failed:', error.message);
        }
      } catch (err) {
        console.warn('Cloud sync failed:', err.message);
      } finally {
        syncInProgress = false;
      }
    }, 500);
  }

  async function deleteAccount() {
    if (!currentUser) return;
    try {
      const { error } = await client.rpc('delete_user');
      if (error) throw error;
      await client.auth.signOut();
    } catch (err) {
      console.warn('Account deletion failed:', err.message);
      throw err;
    }
  }

  async function init() {
    const { data: { session } } = await client.auth.getSession();
    if (session?.user) {
      setUser(session.user);
    }

    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    authForm.addEventListener('submit', handleAuthSubmit);
    modalClose.addEventListener('click', hideModal);
    modalEl.addEventListener('click', function (e) {
      if (e.target === modalEl) hideModal();
    });
    authToggle.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        e.preventDefault();
        showModal(!isSignUp);
      }
    });

    renderAuth();
  }

  window.__arSupabase = {
    init,
    saveProgress,
    loadProgress,
    signOut,
    deleteAccount,
    get user() { return currentUser; },
  };
})();
